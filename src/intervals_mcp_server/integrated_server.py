#!/usr/bin/env python3
"""
Integrated MCP server with OAuth authentication.

This implements a single server that handles both authentication and MCP protocol,
eliminating the proxy architecture that was breaking session management.
"""

import os
import sys
import logging
from typing import Optional

from fastapi import FastAPI, Request, Response, HTTPException, Form
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from fastmcp import FastMCP
from .oauth import verify_oauth_or_api_key
from .security import get_cors_origins

# Import all the tool implementations
from .server import (
    get_athlete_wellness,
    get_athlete_activities,
    get_activity_streams,
    get_activity_details,
    add_wellness_entry,
)

# Logging setup
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("intervals_mcp_integrated")

# Environment variables
PORT = int(os.getenv("PORT", "9000"))
HOST = os.getenv("HOST", "0.0.0.0")
BASE_URL = os.getenv("BASE_URL", f"http://localhost:{PORT}")


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """Middleware to handle authentication for MCP requests."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip authentication for certain paths
        skip_paths = [
            "/.well-known/mcp-configuration",
            "/oauth/authorize",
            "/oauth/token",
            "/oauth/register",
            "/health",
        ]
        
        if any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)
        
        # Skip auth for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # For SSE endpoints, check authentication
        if request.headers.get("accept") == "text/event-stream" or request.url.path in ["/", "/sse", "/mcp"]:
            try:
                # Verify authentication
                auth_result = await verify_oauth_or_api_key(
                    request,
                    request.headers.get("authorization"),
                    request.headers.get("x-api-key")
                )
                
                # Store auth context in request state for MCP handlers
                request.state.auth_context = {
                    "user_id": auth_result.get("sub") or auth_result.get("user_id") or "anonymous",
                    "scopes": auth_result.get("scopes", []),
                    "auth_type": auth_result.get("type", "none")
                }
                
                logger.info(f"Authenticated {request.state.auth_context['auth_type']} user {request.state.auth_context['user_id']}")
                
            except HTTPException as e:
                # For HEAD requests without auth, return 401
                if request.method == "HEAD":
                    return Response(status_code=401, content="Authentication required")
                # For other requests, propagate the error
                return Response(status_code=e.status_code, content=e.detail)
        
        return await call_next(request)


# Create FastMCP instance with tools
mcp = FastMCP(
    "Intervals.icu MCP Server",
    version="1.0.0"
)

# Register all tools with proper authentication context handling
@mcp.tool()
async def intervals_get_wellness(
    start_date: str = "Get wellness data from this date (YYYY-MM-DD)",
    end_date: str = "Get wellness data up to this date (YYYY-MM-DD)",
    cols: Optional[str] = "Comma-separated list of columns to include (e.g., 'weight,restingHR')"
) -> str:
    """Get athlete wellness data for a date range from Intervals.icu.
    
    Available columns include: weight, restingHR, hrv, hrvRMSSD, kcalConsumed, 
    sleepSecs, sleepQuality, sleepTime, soreness, fatigue, stress, mood,
    motivation, injury, spO2, systolic, diastolic, hydration, hydrationVolume,
    readiness, hrRange, lactate, baevskySI, bloodGlucose, menstrualPhase,
    menstrualPhasePredicted, alcohol, and custom wellness fields.
    """
    result = await get_athlete_wellness(start_date, end_date, cols)
    if isinstance(result, dict) and "error" in result:
        return result["error"]
    return str(result)

@mcp.tool()
async def intervals_get_activities(
    oldest: Optional[str] = "Get activities from this date (YYYY-MM-DD)",
    newest: Optional[str] = "Get activities up to this date (YYYY-MM-DD)",
    cols: Optional[str] = "Comma-separated list of columns to include"
) -> str:
    """Get athlete activities from Intervals.icu.
    
    Returns a list of activities with details like name, start time, type,
    distance, duration, elevation gain, average power, normalized power, etc.
    """
    result = await get_athlete_activities(oldest, newest, cols)
    if isinstance(result, dict) and "error" in result:
        return result["error"]
    return str(result)

@mcp.tool()
async def intervals_get_activity_streams(
    activity_id: str = "The ID of the activity to get streams for",
    streams: Optional[str] = "Comma-separated list of stream types to retrieve"
) -> str:
    """Get detailed time-series data streams for a specific activity.
    
    Available stream types include: time, distance, heartrate, watts, 
    cadence, temp, altitude, velocity_smooth, grade_smooth, and more.
    
    This returns the raw data points that make up an activity recording.
    """
    result = await get_activity_streams(activity_id, streams)
    if isinstance(result, dict) and "error" in result:
        return result["error"]
    return str(result)

@mcp.tool()
async def intervals_get_activity_details(
    activity_id: str = "The ID of the activity to get details for"
) -> str:
    """Get comprehensive details for a specific activity.
    
    Returns detailed information including all metrics, intervals,
    power curves, and other analysis data for the activity.
    """
    result = await get_activity_details(activity_id)
    if isinstance(result, dict) and "error" in result:
        return result["error"]
    return str(result)

@mcp.tool()
async def intervals_add_wellness_entry(
    date: str = "Date for the wellness entry (YYYY-MM-DD)",
    weight: Optional[float] = "Body weight",
    restingHR: Optional[int] = "Resting heart rate",
    hrv: Optional[float] = "Heart rate variability",
    hrvRMSSD: Optional[float] = "HRV RMSSD value",
    kcalConsumed: Optional[int] = "Calories consumed",
    sleepSecs: Optional[int] = "Sleep duration in seconds",
    sleepQuality: Optional[int] = "Sleep quality (1-5)",
    sleepTime: Optional[str] = "Time went to sleep (HH:MM)",
    soreness: Optional[int] = "Muscle soreness (1-10)",
    fatigue: Optional[int] = "Fatigue level (1-10)",
    stress: Optional[int] = "Stress level (1-10)",
    mood: Optional[int] = "Mood rating (1-10)",
    motivation: Optional[int] = "Motivation level (1-10)",
    injury: Optional[int] = "Injury level (1-10)",
    spO2: Optional[float] = "Blood oxygen saturation (%)",
    systolic: Optional[int] = "Systolic blood pressure",
    diastolic: Optional[int] = "Diastolic blood pressure",
    hydration: Optional[int] = "Hydration level",
    hydrationVolume: Optional[float] = "Hydration volume consumed",
    readiness: Optional[int] = "Training readiness score",
    baevskySI: Optional[float] = "Baevsky stress index",
    bloodGlucose: Optional[float] = "Blood glucose level",
    lactate: Optional[float] = "Blood lactate level",
    menstrualPhase: Optional[str] = "Current menstrual phase",
    menstrualPhasePredicted: Optional[str] = "Predicted menstrual phase",
    alcohol: Optional[int] = "Alcohol consumption units",
    notes: Optional[str] = "Additional notes"
) -> str:
    """Add or update a wellness entry for a specific date."""
    result = await add_wellness_entry(
        date=date,
        weight=weight,
        restingHR=restingHR,
        hrv=hrv,
        hrvRMSSD=hrvRMSSD,
        kcalConsumed=kcalConsumed,
        sleepSecs=sleepSecs,
        sleepQuality=sleepQuality,
        sleepTime=sleepTime,
        soreness=soreness,
        fatigue=fatigue,
        stress=stress,
        mood=mood,
        motivation=motivation,
        injury=injury,
        spO2=spO2,
        systolic=systolic,
        diastolic=diastolic,
        hydration=hydration,
        hydrationVolume=hydrationVolume,
        readiness=readiness,
        baevskySI=baevskySI,
        bloodGlucose=bloodGlucose,
        lactate=lactate,
        menstrualPhase=menstrualPhase,
        menstrualPhasePredicted=menstrualPhasePredicted,
        alcohol=alcohol,
        notes=notes
    )
    if isinstance(result, dict) and "error" in result:
        return result["error"]
    return str(result)


# Create the integrated FastAPI app
def create_integrated_app() -> FastAPI:
    """Create a FastAPI app with integrated MCP and authentication."""
    
    # Get the SSE app from FastMCP
    sse_app = mcp.sse_app()
    
    # Create a new FastAPI app that will wrap the SSE app
    app = FastAPI(
        title="Intervals.icu MCP Server",
        description="Integrated MCP server with OAuth authentication",
        version="1.0.0"
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Add authentication middleware
    app.add_middleware(AuthenticationMiddleware)
    
    # Mount the SSE app at root
    @app.get("/")
    @app.post("/")
    @app.head("/")
    async def root_endpoint(request: Request):
        """Root endpoint - serves MCP SSE"""
        # Pass through to the SSE app
        return await sse_app(request.scope, request.receive, request.send)
    
    # Also mount at /sse and /mcp for compatibility
    @app.get("/sse")
    @app.post("/sse")
    async def sse_endpoint(request: Request):
        """SSE endpoint - serves MCP SSE"""
        return await sse_app(request.scope, request.receive, request.send)
    
    @app.get("/mcp")
    @app.post("/mcp")
    async def mcp_endpoint(request: Request):
        """MCP endpoint - serves MCP SSE"""
        return await sse_app(request.scope, request.receive, request.send)
    
    # Messages endpoint
    @app.post("/messages/{path:path}")
    async def messages_endpoint(path: str, request: Request):
        """Messages endpoint - handles MCP protocol messages"""
        # Build the full path
        full_path = f"/messages/{path}"
        # Update request scope
        request.scope["path"] = full_path
        # Pass through to SSE app
        return await sse_app(request.scope, request.receive, request.send)
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "service": "intervals-mcp-server"}
    
    # MCP configuration endpoint
    @app.get("/.well-known/mcp-configuration")
    async def mcp_configuration():
        """Return MCP server configuration."""
        return {
            "mcpVersion": "2024-11-05",
            "serverInfo": {
                "name": "intervals-icu-mcp-server",
                "version": "1.0.0"
            },
            "capabilities": {
                "tools": True,
                "prompts": False,
                "resources": False,
                "sampling": False
            },
            "transport": ["sse"],
            "authentication": {
                "type": "oauth2",
                "oauth2": {
                    "authorizationUrl": f"{BASE_URL}/oauth/authorize",
                    "tokenUrl": f"{BASE_URL}/oauth/token",
                    "clientRegistrationUrl": f"{BASE_URL}/oauth/register",
                    "scopes": {
                        "intervals:read": "Read access to Intervals.icu data",
                        "intervals:write": "Write access to Intervals.icu data"
                    }
                }
            }
        }
    
    # OAuth endpoints (import from existing oauth module)
    from .oauth import (
        register_oauth_client,
        handle_authorization_request,
        handle_token_request,
        get_authorization_server_metadata,
        create_jwks
    )
    
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
        code: Optional[str] = Form(None),
        redirect_uri: Optional[str] = Form(None),
        client_id: Optional[str] = Form(None),
        client_secret: Optional[str] = Form(None),
        code_verifier: Optional[str] = Form(None),
        scope: Optional[str] = Form(None),
    ):
        """OAuth token endpoint with public client support."""
        return await handle_token_request(
            grant_type=grant_type,
            code=code,
            redirect_uri=redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            code_verifier=code_verifier,
            scope=scope,
        )
    
    @app.get("/.well-known/oauth-authorization-server")
    async def oauth_metadata():
        """OAuth 2.1 Authorization Server Metadata endpoint."""
        return get_authorization_server_metadata()
    
    @app.get("/.well-known/jwks.json")
    async def jwks_endpoint():
        """JSON Web Key Set endpoint."""
        return create_jwks()
    
    return app


# Create the app
app = create_integrated_app()


if __name__ == "__main__":
    import uvicorn
    
    # Check for stdio mode
    if "--stdio" in sys.argv or os.getenv("MCP_MODE") == "stdio":
        logger.info("Starting MCP server in stdio mode")
        mcp.run()
    else:
        # Run as HTTP/SSE server
        logger.info(f"Starting integrated MCP server on {HOST}:{PORT}")
        logger.info("OAuth authentication and MCP protocol in single server")
        uvicorn.run(app, host=HOST, port=PORT)