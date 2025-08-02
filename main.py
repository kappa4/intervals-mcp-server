#!/usr/bin/env python3
"""
Intervals.icu MCP Server - Production Version

A Model Context Protocol (MCP) server that provides access to Intervals.icu API
with OAuth 2.1 authentication and FastMCP integration.

This implementation follows MCP specification and uses proven architecture
that successfully connects with Claude.ai.

Environment Variables Required:
- ATHLETE_ID: Your Intervals.icu athlete ID (e.g., i123456)
- API_KEY: Your Intervals.icu API key
- MCP_API_KEY: API key for MCP authentication (fallback)
- JWT_SECRET_KEY: Secret key for JWT token signing (minimum 32 characters)
- BASE_URL: Public URL of your server (for OAuth callbacks)
- PORT: Server port (default: 8000)
- ALLOWED_ORIGINS: CORS allowed origins (default: *)
"""

import os
import sys
import logging
from typing import Optional

from fastapi import Request, Form

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("intervals_mcp_production")

# Import the existing MCP server and FastAPI app from intervals_mcp_server
# This maintains all the working tool implementations and middleware
from intervals_mcp_server.server import mcp, app

# Import OAuth functionality
from intervals_mcp_server.oauth import (
    register_oauth_client,
    handle_authorization_request,
    handle_token_request,
)

def validate_environment():
    """Validate that required environment variables are set."""
    required_vars = {
        'ATHLETE_ID': 'Your Intervals.icu athlete ID (e.g., i123456)',
        'API_KEY': 'Your Intervals.icu API key',
        'JWT_SECRET_KEY': 'JWT secret key (minimum 32 characters)',
        'BASE_URL': 'Public URL of your server (for OAuth callbacks)',
    }

    missing_vars = []
    for var, description in required_vars.items():
        if not os.getenv(var):
            missing_vars.append(f"  {var}: {description}")

    if missing_vars:
        logger.error("Missing required environment variables:")
        for var in missing_vars:
            logger.error(var)
        logger.error("\nPlease set these environment variables and restart the server.")
        sys.exit(1)

    # Validate JWT secret key length
    jwt_secret = os.getenv('JWT_SECRET_KEY', '')
    if len(jwt_secret) < 32:
        logger.error("JWT_SECRET_KEY must be at least 32 characters long")
        sys.exit(1)

    logger.info("Environment validation passed")

# Add OAuth endpoints to the existing FastAPI app
@app.post("/oauth/register")
async def oauth_client_registration(request: Request):
    """Dynamic Client Registration endpoint for OAuth 2.1."""
    return await register_oauth_client(request)

@app.get("/oauth/authorize")
async def oauth_authorization(request: Request):
    """OAuth 2.1 authorization endpoint with PKCE support."""
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
    """OAuth 2.1 token endpoint with public client and PKCE support."""
    return await handle_token_request(
        grant_type=grant_type,
        code=code,
        redirect_uri=redirect_uri,
        client_id=client_id,
        client_secret=client_secret,
        code_verifier=code_verifier,
        scope=scope,
    )

# Get FastMCP's SSE application
sse_app = mcp.sse_app()

# Integrate SSE endpoints with the existing FastAPI app
# This uses the exact same pattern that successfully works with Claude.ai
@app.get("/")
@app.post("/")
@app.head("/")
async def root_sse_endpoint(request: Request):
    """
    Root endpoint serves MCP SSE transport.

    This endpoint handles the primary MCP communication channel.
    Authentication is handled by middleware in the main app.

    Uses the proven pattern: request.send.__wrapped__
    """
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

@app.get("/sse")
@app.post("/sse")
async def sse_endpoint(request: Request):
    """SSE endpoint for MCP protocol compatibility."""
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

@app.get("/mcp")
@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """MCP endpoint for protocol compatibility."""
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

@app.post("/messages/{path:path}")
async def messages_endpoint(path: str, request: Request):
    """
    MCP protocol messages endpoint.

    Handles MCP JSON-RPC messages with proper session management.
    The path parameter allows for session-specific routing with session_id.
    """
    # Update request scope to include the full path for proper routing
    request.scope["path"] = f"/messages/{path}"
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

# Health check endpoint for monitoring
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring systems."""
    return {
        "status": "healthy",
        "service": "intervals-mcp-server",
        "version": "1.0.0",
        "athlete_id": os.getenv("ATHLETE_ID", "not_configured"),
        "base_url": os.getenv("BASE_URL", "not_configured")
    }

# Configuration endpoint for debugging
@app.get("/config")
async def config_info():
    """Configuration information endpoint (excludes sensitive data)."""
    return {
        "athlete_id": os.getenv("ATHLETE_ID", "not_set"),
        "base_url": os.getenv("BASE_URL", "not_set"),
        "port": os.getenv("PORT", "8000"),
        "cors_origins": os.getenv("ALLOWED_ORIGINS", "*"),
        "mcp_api_key_set": bool(os.getenv("MCP_API_KEY")),
        "intervals_api_key_set": bool(os.getenv("API_KEY")),
        "jwt_secret_set": bool(os.getenv("JWT_SECRET_KEY")),
    }

def main():
    """Main entry point for the application."""

    # Validate environment before starting
    validate_environment()

    import uvicorn
    
    # Configuration from environment variables
    PORT = int(os.getenv("PORT", "8000"))  # Default to 8000 for production
    HOST = os.getenv("HOST", "0.0.0.0")

    # Check for stdio mode (backwards compatibility)
    if "--stdio" in sys.argv or os.getenv("MCP_MODE") == "stdio":
        logger.info("Starting MCP server in stdio mode")
        mcp.run()
    else:
        # Production HTTP/SSE server mode
        logger.info(f"Starting Intervals.icu MCP Server on {HOST}:{PORT}")
        logger.info(f"Athlete ID: {os.getenv('ATHLETE_ID')}")
        logger.info(f"Base URL: {os.getenv('BASE_URL')}")
        logger.info("OAuth 2.1 authentication and MCP protocol integrated")
        logger.info("Ready for Claude.ai connections")

        # Run with production-ready uvicorn configuration
        uvicorn.run(
            app,
            host=HOST,
            port=PORT,
            log_level="info",
            access_log=True,
        )

if __name__ == "__main__":
    main()
