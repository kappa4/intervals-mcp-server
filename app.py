#!/usr/bin/env python3
"""
Intervals.icu MCP Server - Production App

Production-ready integrated MCP server with OAuth 2.1 authentication.
Based on the proven simple_integrated.py that successfully connects with Claude.ai.

Features:
- OAuth 2.1 authentication with PKCE support
- MCP (Model Context Protocol) over SSE transport
- Integration with Intervals.icu API
- Environment variable validation
- Production logging and monitoring
"""

import os
import sys
import logging

# Set up logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("intervals_mcp_production")

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

    logger.debug("Environment validation passed")

# Validate environment on import
validate_environment()

# Add src directory to Python path for Railway
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Force integrated mode (disable proxy mode in server.py)
os.environ["AUTO_START_MCP"] = "false"

# Import the existing mcp instance and app from server.py (same as simple_integrated.py)
from intervals_mcp_server.server import mcp, app

# Additional imports for OAuth endpoints
from fastapi import Request, Form
from typing import Optional

# Import OAuth functions
from intervals_mcp_server.oauth import (
    register_oauth_client,
    handle_authorization_request,
    handle_token_request,
    get_protected_resource_metadata,
    get_authorization_server_metadata,
    create_jwks,
)

# OAuth endpoints
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

# Get the SSE app from FastMCP
sse_app = mcp.sse_app()

# Mount SSE endpoints on the existing FastAPI app
# This uses the exact same pattern that successfully works with Claude.ai
@app.get("/")
@app.post("/")
@app.head("/")
async def root_sse_endpoint(request: Request):
    """
    Root endpoint serves MCP SSE transport.
    
    This uses the FastMCP SSE app directly with environment-aware send function.
    """
    # Environment-aware send function selection
    # Railway environment requires _send, local development uses send.__wrapped__
    if hasattr(request, 'send') and hasattr(request.send, '__wrapped__'):
        send_func = request.send.__wrapped__
    else:
        send_func = request._send
    
    return await sse_app(request.scope, request.receive, send_func)

@app.get("/sse")
@app.post("/sse")
async def sse_endpoint(request: Request):
    """SSE endpoint for MCP protocol compatibility."""
    if hasattr(request, 'send') and hasattr(request.send, '__wrapped__'):
        send_func = request.send.__wrapped__
    else:
        send_func = request._send
    
    return await sse_app(request.scope, request.receive, send_func)

@app.get("/mcp")
@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """MCP endpoint for protocol compatibility."""
    if hasattr(request, 'send') and hasattr(request.send, '__wrapped__'):
        send_func = request.send.__wrapped__
    else:
        send_func = request._send
    
    return await sse_app(request.scope, request.receive, send_func)

# Messages endpoint for MCP protocol
@app.post("/messages/{path:path}")
async def messages_endpoint(path: str, request: Request):
    """
    MCP protocol messages endpoint.
    
    Handles MCP JSON-RPC messages with proper session management.
    """
    # Environment-aware send function selection
    if hasattr(request, 'send') and hasattr(request.send, '__wrapped__'):
        send_func = request.send.__wrapped__
    else:
        send_func = request._send
    
    # Update request scope to include the full path for proper routing
    request.scope["path"] = f"/messages/{path}"
    return await sse_app(request.scope, request.receive, send_func)

# OAuth 2.1 Discovery endpoints
@app.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource_metadata():
    """OAuth 2.1 Protected Resource Metadata discovery endpoint."""
    return get_protected_resource_metadata()

@app.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata():
    """OAuth 2.1 Authorization Server Metadata discovery endpoint."""
    return get_authorization_server_metadata()

@app.get("/.well-known/jwks.json")
async def jwks_endpoint():
    """JSON Web Key Set endpoint for token verification."""
    return create_jwks()

# Enhanced health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring systems."""
    return {
        "status": "healthy",
        "service": "intervals-mcp-server",
        "version": "1.0.0",
        "athlete_id": os.getenv("ATHLETE_ID", "not_configured"),
        "base_url": os.getenv("BASE_URL", "not_configured"),
        "oauth_enabled": True,
        "mcp_protocol": "2024-11-05"
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
        "oauth_endpoints": ["/oauth/register", "/oauth/authorize", "/oauth/token"],
        "mcp_endpoints": ["/", "/sse", "/mcp", "/messages"]
    }

# Main entry point for development/testing
if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.getenv("PORT", "8000"))
    HOST = os.getenv("HOST", "0.0.0.0")
    
    if "--stdio" in sys.argv or os.getenv("MCP_MODE") == "stdio":
        logger.info("Starting MCP server in stdio mode")
        mcp.run()
    else:
        logger.info(f"Starting Intervals.icu MCP Server on {HOST}:{PORT}")
        logger.debug(f"Athlete ID: {os.getenv('ATHLETE_ID')}")
        logger.debug(f"Base URL: {os.getenv('BASE_URL')}")
        logger.debug("OAuth 2.1 authentication and MCP protocol integrated")
        logger.info("Ready for Claude.ai connections")
        
        # Use consistent log level for uvicorn
        uvicorn_log_level = log_level.lower() if log_level in ['DEBUG', 'INFO', 'WARNING', 'ERROR'] else 'info'
        uvicorn.run(app, host=HOST, port=PORT, log_level=uvicorn_log_level, access_log=True)