"""
Security middleware and utilities for Intervals.icu MCP Server

This module provides security features including:
- Origin header validation
- API Key authentication
- HTTPS enforcement
- Request logging
"""

import os
import logging
from typing import Optional
from fastapi import Header, HTTPException, Request

logger = logging.getLogger("intervals_mcp_server.security")


async def verify_origin(request: Request) -> None:
    """
    Verify that the request comes from an allowed origin.
    
    Args:
        request: FastAPI Request object
        
    Raises:
        HTTPException: If origin is not allowed
    """
    origin = request.headers.get("origin")
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
    
    # If no allowed origins are configured, skip validation (development mode)
    if not allowed_origins:
        logger.debug("Origin validation skipped: ALLOWED_ORIGINS not configured")
        return
    
    allowed_list = [o.strip() for o in allowed_origins.split(",") if o.strip()]
    
    # If origin is not provided, skip validation (non-browser clients)
    if not origin:
        logger.debug("Origin validation skipped: No origin header present")
        return
    
    if origin not in allowed_list:
        logger.warning(f"Origin validation failed: {origin} not in allowed list")
        raise HTTPException(
            status_code=403,
            detail=f"Origin {origin} is not allowed"
        )
    
    logger.debug(f"Origin validation passed: {origin}")


async def verify_api_key(request: Request, x_api_key: Optional[str] = Header(None)) -> None:
    """
    Verify API key for authentication.
    
    Args:
        x_api_key: API key from X-API-Key header
        
    Raises:
        HTTPException: If API key is invalid or missing
    """
    expected_key = os.getenv("MCP_API_KEY", "").strip()
    
    # If no API key is configured, log warning and skip validation
    if not expected_key:
        logger.warning("API Key validation skipped: MCP_API_KEY not configured")
        return
    
    if not x_api_key or x_api_key != expected_key:
        logger.warning("API Key validation failed")
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key"
        )
    
    logger.debug("API Key validation passed")


async def enforce_https(request: Request) -> None:
    """
    Enforce HTTPS connections when configured.
    
    Args:
        request: FastAPI Request object
        
    Raises:
        HTTPException: If HTTPS is required but request is HTTP
    """
    enforce = os.getenv("ENFORCE_HTTPS", "false").lower() == "true"
    
    if not enforce:
        return
    
    # Check X-Forwarded-Proto header (common in proxy setups)
    forwarded_proto = request.headers.get("x-forwarded-proto")
    
    if forwarded_proto:
        if forwarded_proto != "https":
            logger.warning(f"HTTPS enforcement failed: X-Forwarded-Proto is {forwarded_proto}")
            raise HTTPException(
                status_code=400,
                detail="HTTPS required"
            )
    else:
        # Check direct connection scheme
        if request.url.scheme != "https":
            logger.warning(f"HTTPS enforcement failed: Scheme is {request.url.scheme}")
            raise HTTPException(
                status_code=400,
                detail="HTTPS required"
            )
    
    logger.debug("HTTPS enforcement passed")


def get_cors_origins() -> list[str]:
    """
    Get the list of allowed CORS origins from environment variables.
    
    Returns:
        List of allowed origins
    """
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
    
    if not allowed_origins:
        # Default to permissive settings in development
        logger.warning("ALLOWED_ORIGINS not configured, using permissive CORS settings")
        return ["*"]
    
    origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
    logger.info(f"CORS allowed origins: {origins}")
    return origins


async def log_request(request: Request, call_next):
    """
    Log incoming requests for monitoring.
    
    Args:
        request: FastAPI Request object
        call_next: Next middleware in chain
        
    Returns:
        Response from the next middleware
    """
    # Skip ALL middleware processing for SSE endpoints to avoid conflicts
    # SSE endpoints include: /, /mcp, /sse, and any /messages/* endpoints
    sse_paths = ["/", "/mcp", "/sse"]
    if (request.url.path in sse_paths or 
        request.url.path.startswith("/messages/") or
        request.headers.get("accept") == "text/event-stream"):
        return await call_next(request)
    
    # Log request details
    logger.info(f"Request: {request.method} {request.url.path} from {request.client.host}")
    
    # Log security-relevant headers
    logger.debug(f"Headers: Origin={request.headers.get('origin')}, "
                f"X-API-Key={'present' if request.headers.get('x-api-key') else 'absent'}, "
                f"User-Agent={request.headers.get('user-agent')}")
    
    # Process request
    response = await call_next(request)
    
    # Log response status
    logger.info(f"Response: {response.status_code} for {request.method} {request.url.path}")
    
    return response