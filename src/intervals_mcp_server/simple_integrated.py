#!/usr/bin/env python3
"""
Simple integrated MCP server using FastMCP's built-in SSE support.
"""

import os
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("intervals_mcp_simple")

# Import the existing mcp instance and app from server.py
from intervals_mcp_server.server import mcp, app

# Additional imports for OAuth endpoints
from fastapi import Request, Form
from typing import Optional

# Import OAuth functions
from intervals_mcp_server.oauth import (
    register_oauth_client,
    handle_authorization_request,
    handle_token_request,
)

# OAuth endpoints
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

# Get the SSE app from FastMCP
sse_app = mcp.sse_app()

# Mount SSE endpoints on the existing FastAPI app
@app.get("/")
@app.post("/")
@app.head("/")
async def root_sse(request: Request):
    """Root endpoint serves MCP SSE"""
    # Use the SSE app directly
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

@app.get("/sse")
@app.post("/sse")
async def sse_endpoint(request: Request):
    """SSE endpoint"""
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

@app.get("/mcp")
@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """MCP endpoint"""
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

# Messages endpoint
@app.post("/messages/{path:path}")
async def messages_endpoint(path: str, request: Request):
    """Messages endpoint for MCP protocol"""
    # Update request scope to include full path
    request.scope["path"] = f"/messages/{path}"
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)

if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.getenv("PORT", "9000"))
    HOST = os.getenv("HOST", "0.0.0.0")
    
    if "--stdio" in sys.argv or os.getenv("MCP_MODE") == "stdio":
        logger.info("Starting MCP server in stdio mode")
        mcp.run()
    else:
        logger.info(f"Starting integrated MCP server with SSE on {HOST}:{PORT}")
        logger.info("OAuth and MCP protocol in single server")
        uvicorn.run(app, host=HOST, port=PORT)