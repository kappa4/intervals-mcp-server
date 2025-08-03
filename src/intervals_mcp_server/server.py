"""
Intervals.icu MCP Server

This module implements a Model Context Protocol (MCP) server for connecting
Claude with the Intervals.icu API. It provides tools for retrieving and managing
athlete data, including activities, events, workouts, and wellness metrics.

Main Features:
    - Activity retrieval and detailed analysis
    - Event management (races, workouts, calendar items)
    - Wellness data tracking and visualization
    - Error handling with user-friendly messages
    - Configurable parameters with environment variable support
    - Remote MCP server capability with HTTP/SSE transport

Usage:
    This server is designed to be run as a standalone script and exposes several MCP tools
    for use with Claude Desktop or other MCP-compatible clients. The server loads configuration
    from environment variables (optionally via a .env file) and communicates with the Intervals.icu API.

    To run the server locally:
        $ python src/intervals_mcp_server/server.py

    To run the server remotely:
        $ uvicorn intervals_mcp_server.server:app --host 0.0.0.0 --port 8000

    MCP tools provided:
        - get_activities
        - get_activity_details
        - get_events
        - get_event_by_id
        - get_wellness_data
        - get_activity_intervals
        - add_events

    See the README for more details on configuration and usage.
"""

from json import JSONDecodeError
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from http import HTTPStatus
from typing import Any
import json

import httpx  # pylint: disable=import-error
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response

# Import security utilities
from intervals_mcp_server.security import (
    get_cors_origins,
    log_request,
)

# Import OAuth utilities
from intervals_mcp_server.oauth import (
    get_protected_resource_metadata,
    get_authorization_server_metadata,
    verify_oauth_or_api_key,
    create_jwks,
    register_oauth_client,
    handle_authorization_request,
    handle_token_request,
)

# Import authentication context
from intervals_mcp_server.auth_context import require_scope

# Import formatting utilities
from intervals_mcp_server.utils.formatting import (
    format_activity_summary,
    format_event_details,
    format_event_summary,
    format_intervals,
    format_wellness_entry,
)

from intervals_mcp_server.utils.types import WorkoutDoc

# Try to load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv

    _ = load_dotenv()
except ImportError:
    # python-dotenv not installed, proceed without it
    pass

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("intervals_icu_mcp_server")

# Create a single AsyncClient instance for all requests
httpx_client = httpx.AsyncClient()

# Constants
INTERVALS_API_BASE_URL = os.getenv("INTERVALS_API_BASE_URL", "https://intervals.icu/api/v1")
API_KEY = os.getenv("API_KEY", "")  # Provide default empty string
ATHLETE_ID = os.getenv("ATHLETE_ID", "")  # Default athlete ID from .env
USER_AGENT = "intervalsicu-mcp-server/1.0"

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Accept athlete IDs that are either all digits or start with 'i' followed by digits
if ATHLETE_ID and not re.fullmatch(r"i?\d+", ATHLETE_ID):
    raise ValueError(
        "ATHLETE_ID must be all digits (e.g. 123456) or start with 'i' followed by digits (e.g. i123456)"
    )

# Import MCP components
# Always import FastMCP for compatibility
from mcp.server.fastmcp import FastMCP

# Create FastMCP instance
mcp = FastMCP("intervals-icu")
server = mcp  # Alias for MCP CLI compatibility

# HTTP/SSE mode imports - always import for HTTP server mode

# No need for separate MCP server instance - FastMCP handles everything

# Initialize FastAPI app
app = FastAPI(title="Intervals.icu MCP Server")

# Remove original_app - use single app instance
# original_app = app

# Remove old SSE connection class - using MCP's SseServerTransport instead

# Add CORS middleware - essential for browser clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)

# Add request logging middleware
@app.middleware("http") 
async def logging_middleware(request: Request, call_next):
    return await log_request(request, call_next)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Context manager to ensure the shared httpx client is closed when the server stops.
    """
    try:
        yield
    finally:
        await httpx_client.aclose()


# Update the app lifespan
app.router.lifespan_context = lifespan

# HTTP/SSE mode setup
if "--stdio" not in sys.argv and os.getenv("MCP_MODE") != "stdio":
    if "--mcp-only" in sys.argv:
        # MCP-only mode: Run FastMCP SSE server directly
        logger.info("Starting in MCP-only mode (SSE server)")
        # This will be handled in __main__ section
    else:
        # Full mode: FastAPI with OAuth + proxy to MCP
        from fastapi.responses import StreamingResponse
        import httpx
        
        # MCP server configuration
        MCP_INTERNAL_PORT = int(os.getenv("MCP_INTERNAL_PORT", "9001"))
        MCP_INTERNAL_URL = f"http://localhost:{MCP_INTERNAL_PORT}"
        
        async def proxy_sse_to_mcp(request: Request, target_path: str = "/sse"):
            """Proxy SSE requests to internal MCP server"""
            # Verify authentication first
            authorization = request.headers.get("authorization")
            x_api_key = request.headers.get("x-api-key")
            
            # For HEAD requests without auth, return 401
            if request.method == "HEAD" and not authorization and not x_api_key:
                return Response(status_code=401, content="Authentication required")
            
            try:
                auth_result = await verify_oauth_or_api_key(request, authorization, x_api_key)
                auth_context = {
                    "user_id": auth_result.get("sub") or auth_result.get("user_id") or "anonymous",
                    "scopes": auth_result.get("scopes", []),
                    "auth_type": auth_result.get("type", "none")
                }
                logger.info(f"Proxying SSE request: {auth_context['auth_type']} user {auth_context['user_id']}")
            except HTTPException as e:
                return Response(status_code=e.status_code, content=e.detail)
            
            # Build target URL with query parameters
            query_string = str(request.url.query) if request.url.query else ""
            target_url = f"{MCP_INTERNAL_URL}{target_path}"
            if query_string:
                target_url = f"{target_url}?{query_string}"
            
            # Forward headers (excluding host)
            headers = dict(request.headers)
            headers.pop("host", None)
            
            # For SSE, we need to stream the response
            if request.headers.get("accept") == "text/event-stream":
                async def event_stream():
                    async with httpx.AsyncClient() as client:
                        # MCP SSE endpoint only accepts GET requests
                        method = "GET" if target_path == "/sse" else request.method
                        content = None if method == "GET" else await request.body()
                        
                        async with client.stream(
                            method,
                            target_url,
                            headers=headers,
                            content=content,
                            timeout=httpx.Timeout(None),  # No timeout for SSE
                            follow_redirects=True,  # Follow redirects
                        ) as response:
                            async for chunk in response.aiter_bytes():
                                yield chunk
                
                return StreamingResponse(
                    event_stream(),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "X-Accel-Buffering": "no",
                    }
                )
            else:
                # Non-SSE requests
                async with httpx.AsyncClient() as client:
                    response = await client.request(
                        request.method,
                        target_url,
                        headers=headers,
                        content=await request.body() if request.method in ["POST", "PUT", "PATCH"] else None,
                    )
                    return Response(
                        content=response.content,
                        status_code=response.status_code,
                        headers=dict(response.headers)
                    )
        
        # Root endpoint - proxy to /sse
        @app.get("/")
        @app.post("/")
        @app.head("/")
        async def root_endpoint(request: Request):
            """Root endpoint - proxy to MCP /sse"""
            return await proxy_sse_to_mcp(request, "/sse")
        
        # /mcp endpoint - also proxy to /sse
        @app.get("/mcp")
        @app.post("/mcp")
        async def mcp_endpoint(request: Request):
            """MCP endpoint - proxy to MCP /sse"""
            return await proxy_sse_to_mcp(request, "/sse")
        
        # /sse endpoint - direct proxy
        @app.get("/sse")
        @app.post("/sse")
        async def sse_endpoint(request: Request):
            """SSE endpoint - direct proxy"""
            return await proxy_sse_to_mcp(request, "/sse")
        
        # /messages/* endpoint - proxy with path
        @app.post("/messages/{path:path}")
        async def messages_endpoint(path: str, request: Request):
            """Messages endpoint - proxy to MCP"""
            return await proxy_sse_to_mcp(request, f"/messages/{path}")
        
        logger.debug(f"HTTP/SSE proxy mode enabled: Proxying to MCP server at {MCP_INTERNAL_URL}")

# Message handling is done via FastMCP's SSE app


def validate_date(date_str: str) -> str:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return date_str
    except ValueError:
        raise ValueError("Invalid date format. Please use YYYY-MM-DD.")


def _get_error_message(error_code: int, error_text: str) -> str:
    """Return a user-friendly error message for a given HTTP status code."""
    error_messages = {
        HTTPStatus.UNAUTHORIZED: f"{HTTPStatus.UNAUTHORIZED.value} {HTTPStatus.UNAUTHORIZED.phrase}: Please check your API key.",
        HTTPStatus.FORBIDDEN: f"{HTTPStatus.FORBIDDEN.value} {HTTPStatus.FORBIDDEN.phrase}: You may not have permission to access this resource.",
        HTTPStatus.NOT_FOUND: f"{HTTPStatus.NOT_FOUND.value} {HTTPStatus.NOT_FOUND.phrase}: The requested endpoint or ID doesn't exist.",
        HTTPStatus.UNPROCESSABLE_ENTITY: f"{HTTPStatus.UNPROCESSABLE_ENTITY.value} {HTTPStatus.UNPROCESSABLE_ENTITY.phrase}: The server couldn't process the request (invalid parameters or unsupported operation).",
        HTTPStatus.TOO_MANY_REQUESTS: f"{HTTPStatus.TOO_MANY_REQUESTS.value} {HTTPStatus.TOO_MANY_REQUESTS.phrase}: Too many requests in a short time period.",
        HTTPStatus.INTERNAL_SERVER_ERROR: f"{HTTPStatus.INTERNAL_SERVER_ERROR.value} {HTTPStatus.INTERNAL_SERVER_ERROR.phrase}: The Intervals.icu server encountered an internal error.",
        HTTPStatus.SERVICE_UNAVAILABLE: f"{HTTPStatus.SERVICE_UNAVAILABLE.value} {HTTPStatus.SERVICE_UNAVAILABLE.phrase}: The Intervals.icu server might be down or undergoing maintenance.",
    }
    try:
        status = HTTPStatus(error_code)
        return error_messages.get(status, error_text)
    except ValueError:
        return error_text


async def make_intervals_request(
    url: str,
    api_key: str | None = None,
    params: dict[str, Any] | None = None,
    method: str = "GET",
    data: dict[str, Any] | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """
    Make a request to the Intervals.icu API with proper error handling.

    Args:
        url (str): The API endpoint path (e.g., '/athlete/{id}/activities').
        api_key (str | None): Optional API key to use for authentication. Defaults to the global API_KEY.
        params (dict[str, Any] | None): Optional query parameters for the request.
        method (str): HTTP method to use (GET, POST, etc.). Defaults to GET.
        data (dict[str, Any] | None): Optional data to send in the request body.

    Returns:
        dict[str, Any] | list[dict[str, Any]]: The parsed JSON response from the API, or an error dict.
    """
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    if method in ["POST", "PUT", "DELETE"]:
        headers["Content-Type"] = "application/json"

    # Use provided api_key or fall back to global API_KEY
    key_to_use = api_key if api_key is not None else API_KEY
    if not key_to_use:
        logger.error("No API key provided for request to: %s", url)
        return {
            "error": True,
            "message": "API key is required. Set API_KEY env var or pass api_key",
        }

    auth = httpx.BasicAuth("API_KEY", key_to_use)
    full_url = f"{INTERVALS_API_BASE_URL}{url}"

    try:
        if method in ["POST", "PUT"] and data is not None:
            response = await httpx_client.request(
                method=method,
                url=full_url,
                headers=headers,
                params=params,
                auth=auth,
                timeout=30.0,
                content=json.dumps(data),
            )
        else:
            response = await httpx_client.request(
                method=method,
                url=full_url,
                headers=headers,
                params=params,
                auth=auth,
                timeout=30.0,
            )
        try:
            response_data = response.json() if response.content else {}
        except JSONDecodeError:
            logger.error("Invalid JSON in response from: %s", full_url)
            return {"error": True, "message": "Invalid JSON in response"}
        _ = response.raise_for_status()
        return response_data
    except httpx.HTTPStatusError as e:
        error_code = e.response.status_code
        error_text = e.response.text

        logger.error("HTTP error: %s - %s", error_code, error_text)

        return {
            "error": True,
            "status_code": error_code,
            "message": _get_error_message(error_code, error_text),
        }
    except httpx.RequestError as e:
        logger.error("Request error: %s", str(e))
        return {"error": True, "message": f"Request error: {str(e)}"}
    except httpx.HTTPError as e:
        logger.error("HTTP client error: %s", str(e))
        return {"error": True, "message": f"HTTP client error: {str(e)}"}


# ----- MCP Tool Implementations ----- #


def _parse_activities_from_result(result: Any) -> list[dict[str, Any]]:
    """Extract a list of activity dictionaries from the API result."""
    activities: list[dict[str, Any]] = []

    if isinstance(result, list):
        activities = [item for item in result if isinstance(item, dict)]
    elif isinstance(result, dict):
        # Result is a single activity or a container
        for _key, value in result.items():
            if isinstance(value, list):
                activities = [item for item in value if isinstance(item, dict)]
                break
        # If no list was found but the dict has typical activity fields, treat it as a single activity
        if not activities and any(key in result for key in ["name", "startTime", "distance"]):
            activities = [result]

    return activities


def _filter_named_activities(activities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter out unnamed activities from the list."""
    return [
        activity
        for activity in activities
        if activity.get("name") and activity.get("name") != "Unnamed"
    ]


async def _fetch_more_activities(
    athlete_id: str,
    start_date: str,
    api_key: str | None,
    api_limit: int,
) -> list[dict[str, Any]]:
    """Fetch additional activities from an earlier date range."""
    oldest_date = datetime.fromisoformat(start_date)
    older_start_date = (oldest_date - timedelta(days=60)).strftime("%Y-%m-%d")
    older_end_date = (oldest_date - timedelta(days=1)).strftime("%Y-%m-%d")

    if older_start_date >= older_end_date:
        return []

    more_params = {
        "oldest": older_start_date,
        "newest": older_end_date,
        "limit": api_limit,
    }
    more_result = await make_intervals_request(
        url=f"/athlete/{athlete_id}/activities",
        api_key=api_key,
        params=more_params,
    )

    if isinstance(more_result, list):
        return _filter_named_activities(more_result)
    return []


def _format_activities_response(
    activities: list[dict[str, Any]],
    athlete_id: str,
    include_unnamed: bool,
) -> str:
    """Format the activities response based on the results."""
    if not activities:
        if include_unnamed:
            return (
                f"No valid activities found for athlete {athlete_id} in the specified date range."
            )
        return f"No named activities found for athlete {athlete_id} in the specified date range. Try with include_unnamed=True to see all activities."

    # Format the output
    activities_summary = "Activities:\n\n"
    for activity in activities:
        if isinstance(activity, dict):
            activities_summary += format_activity_summary(activity) + "\n"
        else:
            activities_summary += f"Invalid activity format: {activity}\n\n"

    return activities_summary


@mcp.tool()
async def get_activities(  # pylint: disable=too-many-arguments,too-many-return-statements,too-many-branches,too-many-positional-arguments
    athlete_id: str | None = None,
    api_key: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 10,
    include_unnamed: bool = False,
) -> str:
    """Get a list of activities for an athlete from Intervals.icu

    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        start_date: Start date in YYYY-MM-DD format (optional, defaults to 30 days ago)
        end_date: End date in YYYY-MM-DD format (optional, defaults to today)
        limit: Maximum number of activities to return (optional, defaults to 10)
        include_unnamed: Whether to include unnamed activities (optional, defaults to False)
    """
    # Check permissions - reading activities requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Use provided athlete_id or fall back to global ATHLETE_ID
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."

    # Parse date parameters
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    # Fetch more activities if we need to filter out unnamed ones
    api_limit = limit * 3 if not include_unnamed else limit

    # Call the Intervals.icu API
    params = {"oldest": start_date, "newest": end_date, "limit": api_limit}
    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/activities", api_key=api_key, params=params
    )

    # Check for error
    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error fetching activities: {error_message}"

    if not result:
        return f"No activities found for athlete {athlete_id_to_use} in the specified date range."

    # Parse activities from result
    activities = _parse_activities_from_result(result)

    if not activities:
        return f"No valid activities found for athlete {athlete_id_to_use} in the specified date range."

    # Filter and fetch more if needed
    if not include_unnamed:
        activities = _filter_named_activities(activities)

        # If we don't have enough named activities, try to fetch more
        if len(activities) < limit:
            more_activities = await _fetch_more_activities(
                athlete_id_to_use, start_date, api_key, api_limit
            )
            activities.extend(more_activities)

    # Limit to requested count
    activities = activities[:limit]

    return _format_activities_response(activities, athlete_id_to_use, include_unnamed)


@mcp.tool()
async def get_activity_details(activity_id: str, api_key: str | None = None) -> str:
    """Get detailed information for a specific activity from Intervals.icu

    Args:
        activity_id: The Intervals.icu activity ID
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
    """
    # Check permissions - reading activity details requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Call the Intervals.icu API
    result = await make_intervals_request(url=f"/activity/{activity_id}", api_key=api_key)

    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error fetching activity details: {error_message}"

    # Format the response
    if not result:
        return f"No details found for activity {activity_id}."

    # If result is a list, use the first item if available
    activity_data = result[0] if isinstance(result, list) and result else result
    if not isinstance(activity_data, dict):
        return f"Invalid activity format for activity {activity_id}."

    # Return a more detailed view of the activity
    detailed_view = format_activity_summary(activity_data)

    # Add additional details if available
    if "zones" in activity_data:
        zones = activity_data["zones"]
        detailed_view += "\nPower Zones:\n"
        for zone in zones.get("power", []):
            detailed_view += f"Zone {zone.get('number')}: {zone.get('secondsInZone')} seconds\n"

        detailed_view += "\nHeart Rate Zones:\n"
        for zone in zones.get("hr", []):
            detailed_view += f"Zone {zone.get('number')}: {zone.get('secondsInZone')} seconds\n"

    return detailed_view


@mcp.tool()
async def get_activity_intervals(activity_id: str, api_key: str | None = None) -> str:
    """Get interval data for a specific activity from Intervals.icu

    This endpoint returns detailed metrics for each interval in an activity, including power, heart rate,
    cadence, speed, and environmental data. It also includes grouped intervals if applicable.

    Args:
        activity_id: The Intervals.icu activity ID
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
    """
    # Check permissions - reading activity intervals requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Call the Intervals.icu API
    result = await make_intervals_request(url=f"/activity/{activity_id}/intervals", api_key=api_key)

    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error fetching intervals: {error_message}"

    # Format the response
    if not result:
        return f"No interval data found for activity {activity_id}."

    # If the result is empty or doesn't contain expected fields
    if not isinstance(result, dict) or not any(
        key in result for key in ["icu_intervals", "icu_groups"]
    ):
        return f"No interval data or unrecognized format for activity {activity_id}."

    # Format the intervals data
    return format_intervals(result)


@mcp.tool()
async def get_events(
    athlete_id: str | None = None,
    api_key: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """Get events for an athlete from Intervals.icu

    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        start_date: Start date in YYYY-MM-DD format (optional, defaults to today)
        end_date: End date in YYYY-MM-DD format (optional, defaults to 30 days from today)
    """
    # Check permissions - reading events requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Use provided athlete_id or fall back to global ATHLETE_ID
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."

    # Parse date parameters
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")
    if not end_date:
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")

    # Call the Intervals.icu API
    params = {"oldest": start_date, "newest": end_date}

    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events", api_key=api_key, params=params
    )

    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error fetching events: {error_message}"

    # Format the response
    if not result:
        return f"No events found for athlete {athlete_id_to_use} in the specified date range."

    # Ensure result is a list
    events = result if isinstance(result, list) else []

    if not events:
        return f"No events found for athlete {athlete_id_to_use} in the specified date range."

    events_summary = "Events:\n\n"
    for event in events:
        if not isinstance(event, dict):
            continue

        events_summary += format_event_summary(event) + "\n\n"

    return events_summary


@mcp.tool()
async def get_event_by_id(
    event_id: str,
    athlete_id: str | None = None,
    api_key: str | None = None,
) -> str:
    """Get detailed information for a specific event from Intervals.icu

    Args:
        event_id: The Intervals.icu event ID
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
    """
    # Check permissions - reading event details requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Use provided athlete_id or fall back to global ATHLETE_ID
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."

    # Call the Intervals.icu API
    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events/{event_id}", api_key=api_key
    )

    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error fetching event details: {error_message}"

    # Format the response
    if not result:
        return f"No details found for event {event_id}."

    if not isinstance(result, dict):
        return f"Invalid event format for event {event_id}."

    return format_event_details(result)


@mcp.tool()
async def get_wellness_data(
    athlete_id: str | None = None,
    api_key: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    include_custom_fields: bool = True,
) -> str:
    """Get wellness data for an athlete from Intervals.icu, including custom fields

    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        start_date: Start date in YYYY-MM-DD format (optional, defaults to 30 days ago)
        end_date: End date in YYYY-MM-DD format (optional, defaults to today)
        include_custom_fields: Whether to include custom wellness fields (optional, defaults to True)
    """
    # Check permissions - reading wellness data requires intervals:read scope
    try:
        require_scope("intervals:read")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    # Use provided athlete_id or fall back to global ATHLETE_ID
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."

    # Parse date parameters
    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    # Call the Intervals.icu API
    params = {"oldest": start_date, "newest": end_date}

    # Try to use the extended endpoint if custom fields are requested
    if include_custom_fields:
        # First try the extended endpoint
        result = await make_intervals_request(
            url=f"/athlete/{athlete_id_to_use}/wellness-ext-", api_key=api_key, params=params
        )
        
        # If the extended endpoint fails with 404, fall back to the standard endpoint
        if isinstance(result, dict) and result.get("status_code") == 404:
            result = await make_intervals_request(
                url=f"/athlete/{athlete_id_to_use}/wellness", api_key=api_key, params=params
            )
    else:
        result = await make_intervals_request(
            url=f"/athlete/{athlete_id_to_use}/wellness", api_key=api_key, params=params
        )

    if isinstance(result, dict) and "error" in result:
        return f"Error fetching wellness data: {result.get('message')}"

    # Format the response
    if not result:
        return (
            f"No wellness data found for athlete {athlete_id_to_use} in the specified date range."
        )

    wellness_summary = "Wellness Data:\n\n"

    # Handle both list and dictionary responses
    if isinstance(result, dict):
        for date_str, data in result.items():
            # Add the date to the data dictionary if it's not already present
            if isinstance(data, dict) and "date" not in data:
                data["date"] = date_str
            wellness_summary += format_wellness_entry(data) + "\n\n"
    elif isinstance(result, list):
        for entry in result:
            if isinstance(entry, dict):
                wellness_summary += format_wellness_entry(entry) + "\n\n"

    return wellness_summary


def _format_start_date(start_date: str) -> str:
    """Format start_date to ensure proper ISO8601 format."""
    if "T" in start_date:
        # Already includes time, return as-is
        return start_date
    # Date only, append T00:00:00
    return start_date + "T00:00:00"


def _resolve_workout_type(name: str | None, workout_type: str | None) -> str:
    """Determine the workout type based on the name and provided value."""
    if workout_type:
        return workout_type
    name_lower = name.lower() if name else ""
    mapping = [
        ("Ride", ["bike", "cycle", "cycling", "ride"]),
        ("Run", ["run", "running", "jog", "jogging"]),
        ("Swim", ["swim", "swimming", "pool"]),
        ("Walk", ["walk", "walking", "hike", "hiking"]),
        ("Row", ["row", "rowing"]),
        ("Weight Training", ["weight", "weights", "strength", "筋トレ"]),
    ]
    for workout, keywords in mapping:
        if any(keyword in name_lower for keyword in keywords):
            return workout
    return "Ride"  # Default


@mcp.tool()
async def delete_event(
    event_id: str,
    athlete_id: str | None = None,
    api_key: str | None = None,
) -> str:
    """Delete event for an athlete from Intervals.icu
    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        event_id: The Intervals.icu event ID
    """
    # Check permissions - deleting events requires intervals:write scope
    try:
        require_scope("intervals:write")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."
    if not event_id:
        return "Error: No event ID provided."
    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events/{event_id}", api_key=api_key, method="DELETE"
    )
    if isinstance(result, dict) and "error" in result:
        return f"Error deleting event: {result.get('message')}"
    return json.dumps(result, indent=2)


@mcp.tool()
async def delete_events_by_date_range(
    start_date: str,
    end_date: str,
    athlete_id: str | None = None,
    api_key: str | None = None,
) -> str:
    """Delete events for an athlete from Intervals.icu in the specified date range.

    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    """
    # Check permissions - deleting events requires intervals:write scope
    try:
        require_scope("intervals:write")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."
    params = {"oldest": validate_date(start_date), "newest": validate_date(end_date)}
    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events", api_key=api_key, params=params
    )
    if isinstance(result, dict) and "error" in result:
        return f"Error deleting events: {result.get('message')}"
    events = result if isinstance(result, list) else []
    failed_events = []
    for event in events:
        result = await make_intervals_request(
            url=f"/athlete/{athlete_id_to_use}/events/{event.get('id')}", api_key=api_key, method="DELETE"
        )
        if isinstance(result, dict) and "error" in result:
            failed_events.append(event.get('id'))
    return f"Deleted {len(events) - len(failed_events)} events. Failed to delete {len(failed_events)} events: {failed_events}" 


@mcp.tool()
async def add_or_update_event(
    workout_type: str,
    name: str,
    athlete_id: str | None = None,
    api_key: str | None = None,
    event_id: str | None = None,
    start_date: str | None = None,
    workout_doc: WorkoutDoc | None = None,
    moving_time: int | None = None,
    distance: int | None = None,
) -> str:
    """Post event for an athlete to Intervals.icu this follows the event api from intervals.icu
    If event_id is provided, the event will be updated instead of created.

    Args:
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided)
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided)
        event_id: The Intervals.icu event ID (optional, will use event_id from .env if not provided)
        start_date: Start date in YYYY-MM-DD format (optional, defaults to today)
        name: Name of the activity
        workout_doc: steps as a list of Step objects (optional, but necessary to define workout steps)
        workout_type: Workout type (e.g. Ride, Run, Swim, Walk, Row)
        moving_time: Total expected moving time of the workout in seconds (optional)
        distance: Total expected distance of the workout in meters (optional)
    
    Example:
        "workout_doc": {
            "description": "High-intensity workout for increasing VO2 max",
            "steps": [
                {"power": {"value": "80", "units": "%ftp"}, "duration": "900", "warmup": true},
                {"reps": 2, "text": "High-intensity intervals", "steps": [
                    {"power": {"value": "110", "units": "%ftp"}, "distance": "500", "text": "High-intensity"},
                    {"power": {"value": "80", "units": "%ftp"}, "duration": "90", "text": "Recovery"}
                ]},
                {"power": {"value": "80", "units": "%ftp"}, "duration": "600", "cooldown": true}
                {"text": ""}, # Add comments or blank lines for readability
            ]
        }
    
    Step properties:
        distance: Distance of step in meters
            {"distance": "5000"}
        duration: Duration of step in seconds
            {"duration": "1800"}
        power/hr/pace/cadence: Define step intensity
            Percentage of FTP: {"power": {"value": "80", "units": "%ftp"}}
            Absolute power: {"power": {"value": "200", "units": "w"}}
            Heart rate: {"hr": {"value": "75", "units": "%hr"}}
            Heart rate (LTHR): {"hr": {"value": "85", "units": "%lthr"}}
            Cadence: {"cadence": {"value": "90", "units": "rpm"}}
            Pace by ftp: {"pace": {"value": "80", "units": "%pace"}}
            Pace by zone: {"pace": {"value": "Z2", "units": "pace_zone"}}
            Zone by power: {"power": {"value": "Z2", "units": "power_zone"}}
            Zone by heart rate: {"hr": {"value": "Z2", "units": "hr_zone"}}
        Ranges: Specify ranges for power, heart rate, or cadence:
            {"power": {"start": "80", "end": "90", "units": "%ftp"}}
        Ramps: Instead of a range, indicate a gradual change in intensity (useful for ERG workouts):
            {"ramp": True, "power": {"start": "80", "end": "90", "units": "%ftp"}}
        Repeats: include the reps property and add nested steps
            {"reps": 3,
            "steps": [
                {"power": {"value": "110", "units": "%ftp"}, "distance": "500", "text": "High-intensity"},
                {"power": {"value": "80", "units": "%ftp"}, "duration": "90", "text": "Recovery"}
            ]}
        Free Ride: Include free to indicate a segment without ERG control, optionally with a suggested power range:
            {"free": true, "power": {"value": "80", "units": "%ftp"}}
        Comments and Labels: Add descriptive text to label steps:
            {"text": "Warmup"}

    How to use steps:
        - Set distance or duration as appropriate for step
        - Use "reps" with nested steps to define repeat intervals (as in example above)
        - Define one of "power", "hr" or "pace" to define step intensity
    """
    # Check permissions - creating/updating events requires intervals:write scope
    try:
        require_scope("intervals:write")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
        
    message = None
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        message = "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."
    else:
        if not start_date:
            start_date = datetime.now().strftime("%Y-%m-%d")
        try:
            resolved_workout_type = _resolve_workout_type(name, workout_type)
            data = {
                "start_date_local": _format_start_date(start_date),
                "category": "WORKOUT",
                "name": name,
                "description": str(workout_doc) if workout_doc else None,
                "type": resolved_workout_type,
                "moving_time": moving_time,
                "distance": distance,
            }
            result = await make_intervals_request(
                url=f"/athlete/{athlete_id_to_use}/events" +("/"+event_id if event_id else ""),
                api_key=api_key,
                data=data,
                method="PUT" if event_id else "POST",
            )
            action = "updated" if event_id else "created"
            if isinstance(result, dict) and "error" in result:
                error_message = result.get("message", "Unknown error")
                message = f"Error {action} event: {error_message}, data used: {data}"
            elif not result:
                message = f"No events {action} for athlete {athlete_id_to_use}."
            elif isinstance(result, dict):
                message = f"Successfully {action} event: {json.dumps(result, indent=2)}"
            else:
                message = f"Event {action} successfully at {start_date}"
        except ValueError as e:
            message = f"Error: {e}"
    return message


@mcp.tool()
async def update_event(  # pylint: disable=too-many-arguments,too-many-locals,too-many-branches,too-many-statements
    event_id: str,
    athlete_id: str | None = None,
    api_key: str | None = None,
    start_date: str | None = None,
    name: str | None = None,
    description: str | None = None,
    workout_type: str | None = None,
    moving_time: int | None = None,
    distance: int | None = None,
) -> str:
    """Update an existing event in Intervals.icu.

    This function updates an event using the PUT /api/v1/athlete/{id}/events/{eventId} endpoint.
    Only the provided fields will be updated.

    Args:
        event_id: The Intervals.icu event ID (required).
        athlete_id: The Intervals.icu athlete ID (optional, will use ATHLETE_ID from .env if not provided).
        api_key: The Intervals.icu API key (optional, will use API_KEY from .env if not provided).
        start_date: Start date in YYYY-MM-DD or ISO8601 format (optional).
        name: Name of the activity (optional).
        description: Description of the activity including steps (optional).
        workout_type: Workout type (Run, Ride, Swim, etc.) (optional).
        moving_time: Total expected moving time of the workout in seconds (optional).
        distance: Total expected distance of the workout in meters (optional).
    """
    # Check permissions - updating events requires intervals:write scope
    try:
        require_scope("intervals:write")
    except RuntimeError as e:
        return f"Permission denied: {str(e)}"
    athlete_id_to_use = athlete_id if athlete_id is not None else ATHLETE_ID
    if not athlete_id_to_use:
        return "Error: No athlete ID provided and no default ATHLETE_ID found in environment variables."

    # Fetch the existing event to get its current data
    existing_event = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events/{event_id}", api_key=api_key
    )

    if isinstance(existing_event, dict) and "error" in existing_event:
        return f"Error fetching existing event: {existing_event.get('message', 'Unknown error')}"

    if not isinstance(existing_event, dict):
        return f"Could not retrieve existing event {event_id}."

    # Build the update payload with only the specified fields
    update_data = {}
    if start_date:
        update_data["start_date_local"] = _format_start_date(start_date)
    if name:
        update_data["name"] = name
    if description:
        update_data["description"] = description
    if workout_type:
        update_data["type"] = workout_type
    elif name and not workout_type:
        # If name is updated but type isn't, try to resolve type from new name
        update_data["type"] = _resolve_workout_type(name, None)
    if moving_time is not None:
        update_data["moving_time"] = moving_time
    if distance is not None:
        update_data["distance"] = distance

    if not update_data:
        return "Error: No fields provided to update."

    # Merge existing data with update data
    final_data = {**existing_event, **update_data}

    result = await make_intervals_request(
        url=f"/athlete/{athlete_id_to_use}/events/{event_id}",
        api_key=api_key,
        data=final_data,
        method="PUT",
    )

    if isinstance(result, dict) and "error" in result:
        error_message = result.get("message", "Unknown error")
        return f"Error updating event: {error_message}, data used: {final_data}"

    if isinstance(result, dict):
        return f"Successfully updated event: {json.dumps(result, indent=2)}"

    return f"Event {event_id} updated successfully."


# Health check endpoint - always available
@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "intervals-icu-mcp-server"}


# OAuth 2.1 Discovery endpoints
@app.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource():
    """OAuth Protected Resource Metadata endpoint per MCP specification."""
    return get_protected_resource_metadata()


@app.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server():
    """OAuth Authorization Server Metadata endpoint."""
    return get_authorization_server_metadata()


@app.get("/.well-known/jwks.json")
async def jwks_endpoint():
    """JSON Web Key Set endpoint for token verification."""
    return create_jwks()


# OAuth 2.1 Implementation endpoints
@app.post("/oauth/register")
async def oauth_client_registration(request: Request):
    """Dynamic Client Registration endpoint."""
    return await register_oauth_client(request)


@app.get("/oauth/authorize")
async def oauth_authorization(request: Request):
    """OAuth authorization endpoint."""
    return await handle_authorization_request(request)


@app.post("/oauth/token")
async def oauth_token_endpoint(
    grant_type: str = Form(...),
    code: str = Form(None),
    redirect_uri: str = Form(None),
    client_id: str = Form(None),
    client_secret: str = Form(None),
    code_verifier: str = Form(None),
):
    """OAuth token endpoint with public client support."""
    return await handle_token_request(
        grant_type=grant_type,
        code=code,
        redirect_uri=redirect_uri,
        client_id=client_id,
        client_secret=client_secret,
        code_verifier=code_verifier,
    )

# HTTP/SSE mode setup
if "--stdio" not in sys.argv and os.getenv("MCP_MODE") != "stdio":
    logger.debug("HTTP/SSE mode enabled: MCP over SSE endpoints available at /, /sse, /mcp")
    logger.debug("Message handling endpoint: POST /messages/{path}")
else:
    logger.info("stdio mode enabled: SSE endpoints disabled")


# Run the server
if __name__ == "__main__":
    # Check run mode
    if "--stdio" in sys.argv or os.getenv("MCP_MODE") == "stdio":
        # Run as stdio server (backwards compatibility)
        logger.info("Starting MCP server in stdio mode")
        mcp.run()
    elif "--mcp-only" in sys.argv:
        # Run as MCP SSE server only (no OAuth, no proxy)
        import uvicorn
        MCP_INTERNAL_PORT = int(os.getenv("MCP_INTERNAL_PORT", "9001"))
        
        logger.info(f"Starting MCP-only SSE server on port {MCP_INTERNAL_PORT}")
        logger.info("This server handles MCP protocol only, no authentication")
        
        # Get the SSE app from FastMCP
        mcp_app = mcp.sse_app()
        
        # Run with uvicorn
        uvicorn.run(
            mcp_app,
            host="127.0.0.1",  # Only listen on localhost for security
            port=MCP_INTERNAL_PORT,
            log_level="info"
        )
    else:
        # Run as full HTTP server with OAuth and proxy
        import uvicorn
        
        # Check if MCP server is running
        MCP_INTERNAL_PORT = int(os.getenv("MCP_INTERNAL_PORT", "9001"))
        MCP_INTERNAL_URL = f"http://localhost:{MCP_INTERNAL_PORT}"
        
        # Start MCP server in subprocess if AUTO_START_MCP is enabled
        mcp_process = None
        if os.getenv("AUTO_START_MCP", "true").lower() == "true":
            import subprocess
            logger.info(f"Auto-starting MCP server on port {MCP_INTERNAL_PORT}...")
            mcp_process = subprocess.Popen(
                [sys.executable, __file__, "--mcp-only"],
                env={**os.environ, "MCP_INTERNAL_PORT": str(MCP_INTERNAL_PORT)}
            )
            # Wait a bit for MCP server to start
            import time
            time.sleep(2)
        
        try:
            logger.info(f"Starting Intervals.icu HTTP/OAuth server on {HOST}:{PORT}")
            logger.info(f"Proxying MCP requests to {MCP_INTERNAL_URL}")
            uvicorn.run(app, host=HOST, port=PORT)
        finally:
            # Clean up MCP subprocess if started
            if mcp_process:
                logger.info("Stopping MCP server...")
                mcp_process.terminate()
                mcp_process.wait()