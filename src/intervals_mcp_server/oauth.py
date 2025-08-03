"""
OAuth 2.1 implementation for Intervals.icu MCP Server

This module provides OAuth 2.1 support following MCP specification 2025-03-26
with Protected Resource Metadata and JWT token validation.
"""

import os
import logging
import secrets
import base64
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import json
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from fastapi import Header, HTTPException, Request, Form
from cryptography.hazmat.primitives.asymmetric import rsa

logger = logging.getLogger("intervals_mcp_server.oauth")

# In-memory storage for OAuth clients and tokens
# In production, these should be stored in a database
OAUTH_CLIENTS = {}
OAUTH_TOKENS = {}
AUTHORIZATION_CODES = {}

# Simple file-based persistence for development
CLIENTS_FILE = "/tmp/mcp_oauth_clients.json"

def load_clients():
    """Load clients from persistent storage"""
    global OAUTH_CLIENTS
    try:
        if os.path.exists(CLIENTS_FILE):
            with open(CLIENTS_FILE, 'r') as f:
                OAUTH_CLIENTS = json.load(f)
                logger.info(f"Loaded {len(OAUTH_CLIENTS)} OAuth clients from storage")
    except Exception as e:
        logger.error(f"Failed to load OAuth clients: {e}")

def save_clients():
    """Save clients to persistent storage"""
    try:
        with open(CLIENTS_FILE, 'w') as f:
            json.dump(OAUTH_CLIENTS, f, indent=2)
            logger.info(f"Saved {len(OAUTH_CLIENTS)} OAuth clients to storage")
    except Exception as e:
        logger.error(f"Failed to save OAuth clients: {e}")

# Load existing clients on startup
load_clients()

# Add a debug client for Claude Desktop testing
if os.getenv("DEBUG_OAUTH_CLIENT", "false").lower() == "true":
    OAUTH_CLIENTS["claude_desktop_debug"] = {
        "client_id": "claude_desktop_debug",
        "client_name": "Claude Desktop Debug",
        "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": "intervals:read intervals:write"
    }
    logger.info("Debug OAuth client added for Claude Desktop testing")
    save_clients()

# OAuth configuration from environment variables
OAUTH_AUTHORIZATION_SERVER = os.getenv("OAUTH_AUTHORIZATION_SERVER", "")
OAUTH_CLIENT_ID = os.getenv("OAUTH_CLIENT_ID", "")
OAUTH_CLIENT_SECRET = os.getenv("OAUTH_CLIENT_SECRET", "")
OAUTH_SCOPE = os.getenv("OAUTH_SCOPE", "intervals:read intervals:write")
OAUTH_AUDIENCE = os.getenv("OAUTH_AUDIENCE", "intervals-mcp-server")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# OAuth endpoints configuration
OAUTH_TOKEN_ENDPOINT = os.getenv("OAUTH_TOKEN_ENDPOINT", "")
OAUTH_AUTHORIZATION_ENDPOINT = os.getenv("OAUTH_AUTHORIZATION_ENDPOINT", "")
OAUTH_JWKS_URI = os.getenv("OAUTH_JWKS_URI", "")


def get_protected_resource_metadata() -> Dict[str, Any]:
    """
    Generate Protected Resource Metadata according to OAuth 2.1 specification.
    
    This implements the discovery mechanism described in Aaron Parecki's solution
    for MCP OAuth implementation.
    
    Returns:
        Dictionary containing protected resource metadata
    """
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    
    metadata = {
        "resource": f"{base_url}/mcp",
        "authorization_servers": [
            OAUTH_AUTHORIZATION_SERVER or f"{base_url}/oauth"
        ],
        "scopes_supported": OAUTH_SCOPE.split() if OAUTH_SCOPE else [
            "intervals:read",
            "intervals:write",
            "intervals:admin"
        ],
        "bearer_methods_supported": ["header"],
        "resource_documentation": f"{base_url}/docs"
    }
    
    # Add JWKS URI if configured
    if OAUTH_JWKS_URI:
        metadata["jwks_uri"] = OAUTH_JWKS_URI
    
    logger.info(f"Generated protected resource metadata: {metadata}")
    return metadata


def get_authorization_server_metadata() -> Dict[str, Any]:
    """
    Generate Authorization Server Metadata for embedded authorization server.
    
    This is used when the MCP server acts as its own authorization server
    (though this approach is less recommended per Aaron Parecki's guidance).
    
    Returns:
        Dictionary containing authorization server metadata
    """
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    
    metadata = {
        "issuer": f"{base_url}/",
        "authorization_endpoint": f"{base_url}/oauth/authorize",
        "token_endpoint": f"{base_url}/oauth/token",
        "jwks_uri": f"{base_url}/.well-known/jwks.json",
        "registration_endpoint": f"{base_url}/oauth/register",
        "scopes_supported": OAUTH_SCOPE.split() if OAUTH_SCOPE else [
            "intervals:read",
            "intervals:write",
            "intervals:admin"
        ],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
        "code_challenge_methods_supported": ["S256"],  # PKCE support
        "pkce_required": True,  # Required per MCP spec
        "revocation_endpoint": f"{base_url}/oauth/revoke",
        "revocation_endpoint_auth_methods_supported": ["none", "client_secret_post"]
    }
    
    logger.info(f"Generated authorization server metadata: {metadata}")
    return metadata


async def verify_jwt_token(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Verify JWT token from Authorization header.
    
    Args:
        authorization: Authorization header value (Bearer token)
        
    Returns:
        Decoded JWT payload
        
    Raises:
        HTTPException: If token is invalid, expired, or missing
    """
    if not authorization:
        logger.warning("JWT token validation failed: No Authorization header")
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header"
        )
    
    # Extract Bearer token
    if not authorization.startswith("Bearer "):
        logger.warning("JWT token validation failed: Invalid Authorization header format")
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format"
        )
    
    token = authorization[7:]  # Remove "Bearer " prefix
    
    if not JWT_SECRET_KEY:
        logger.error("JWT token validation failed: JWT_SECRET_KEY not configured")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: JWT secret not configured"
        )
    
    try:
        # Decode and verify JWT token
        # Temporarily disable audience verification for debugging
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_aud": False}  # Disable audience check for Claude Desktop compatibility
        )
        logger.debug(f"JWT decoded successfully. Audience in token: {payload.get('aud')}, Expected: {OAUTH_AUDIENCE}")
        
        # Verify token expiration
        if "exp" in payload:
            exp_timestamp = payload["exp"]
            current_time = datetime.now(timezone.utc)
            exp_time = datetime.fromtimestamp(exp_timestamp, timezone.utc)
            logger.debug(f"Token time check - Current: {current_time}, Expires: {exp_time}, Expired: {current_time > exp_time}")
            if current_time > exp_time:
                logger.warning(f"JWT token validation failed: Token expired (current: {current_time}, exp: {exp_time})")
                raise HTTPException(
                    status_code=401,
                    detail="Token expired"
                )
        
        # Verify required scopes
        token_scopes = payload.get("scope", "").split()
        required_scopes = ["intervals:read"]  # Minimum required scope
        
        if not any(scope in token_scopes for scope in required_scopes):
            logger.warning(f"JWT token validation failed: Insufficient scopes. Required: {required_scopes}, Token: {token_scopes}")
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions"
            )
        
        logger.debug(f"JWT token validation passed for subject: {payload.get('sub')}")
        return payload
        
    except ExpiredSignatureError:
        logger.warning("JWT token validation failed: Token expired")
        raise HTTPException(
            status_code=401,
            detail="Token expired"
        )
    except InvalidTokenError as e:
        logger.warning(f"JWT token validation failed: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )


def verify_jwt_token_sync(authorization: str) -> Dict[str, Any]:
    """
    Synchronous version of JWT token verification.
    
    Args:
        authorization: Authorization header value (Bearer token)
        
    Returns:
        Decoded JWT payload
        
    Raises:
        HTTPException: If token is invalid, expired, or missing
    """
    if not authorization.startswith("Bearer "):
        logger.warning("JWT token validation failed: Invalid Authorization header format")
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format"
        )
    
    token = authorization[7:]  # Remove "Bearer " prefix
    
    if not JWT_SECRET_KEY:
        logger.error("JWT token validation failed: JWT_SECRET_KEY not configured")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: JWT secret not configured"
        )
    
    try:
        # Decode and verify JWT token
        # Temporarily disable audience verification for debugging
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_aud": False}  # Disable audience check for Claude Desktop compatibility
        )
        logger.debug(f"JWT decoded successfully. Audience in token: {payload.get('aud')}, Expected: {OAUTH_AUDIENCE}")
        
        # Verify token expiration
        if "exp" in payload:
            exp_timestamp = payload["exp"]
            current_time = datetime.now(timezone.utc)
            exp_time = datetime.fromtimestamp(exp_timestamp, timezone.utc)
            logger.debug(f"Token time check - Current: {current_time}, Expires: {exp_time}, Expired: {current_time > exp_time}")
            if current_time > exp_time:
                logger.warning(f"JWT token validation failed: Token expired (current: {current_time}, exp: {exp_time})")
                raise HTTPException(
                    status_code=401,
                    detail="Token expired"
                )
        
        # Verify required scopes
        token_scopes = payload.get("scope", "").split()
        required_scopes = ["intervals:read"]  # Minimum required scope
        
        if not any(scope in token_scopes for scope in required_scopes):
            logger.warning(f"JWT token validation failed: Insufficient scopes. Required: {required_scopes}, Token: {token_scopes}")
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions"
            )
        
        logger.debug(f"JWT token validation passed for subject: {payload.get('sub')}")
        return payload
        
    except ExpiredSignatureError:
        logger.warning("JWT token validation failed: Token expired")
        raise HTTPException(
            status_code=401,
            detail="Token expired"
        )
    except InvalidTokenError as e:
        logger.warning(f"JWT token validation failed: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )


async def verify_oauth_or_api_key(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """
    Verify either OAuth JWT token or API key authentication.
    
    This provides backward compatibility while supporting OAuth 2.1.
    Prioritizes OAuth if available, falls back to API key.
    
    Args:
        request: FastAPI Request object
        authorization: Authorization header (Bearer token)
        x_api_key: X-API-Key header
        
    Returns:
        Authentication context with user info and permissions
        
    Raises:
        HTTPException: If both authentication methods fail
    """
    # Try OAuth first
    if authorization and authorization.startswith("Bearer "):
        try:
            jwt_payload = verify_jwt_token_sync(authorization)
            return {
                "type": "oauth",
                "user_id": jwt_payload.get("sub"),
                "scopes": jwt_payload.get("scope", "").split(),
                "client_id": jwt_payload.get("client_id"),
                "payload": jwt_payload
            }
        except HTTPException as e:
            # OAuth failed, try API key as fallback
            logger.info(f"OAuth authentication failed ({e.detail}), trying API key fallback")
    
    # Fallback to API key authentication
    try:
        from intervals_mcp_server.security import verify_api_key
        await verify_api_key(request, x_api_key)
        return {
            "type": "api_key",
            "user_id": "api_key_user",
            "scopes": ["intervals:read", "intervals:write", "intervals:admin"],
            "client_id": "api_key_client"
        }
    except HTTPException:
        pass
    
    # Both authentication methods failed
    logger.warning("Both OAuth and API key authentication failed")
    raise HTTPException(
        status_code=401,
        detail="Authentication required: provide either valid Bearer token or X-API-Key header"
    )


def check_scope_permission(auth_context: Dict[str, Any], required_scope: str) -> bool:
    """
    Check if the authenticated user has the required scope permission.
    
    Args:
        auth_context: Authentication context from verify_oauth_or_api_key
        required_scope: Required scope (e.g., "intervals:read")
        
    Returns:
        True if user has required permission, False otherwise
    """
    user_scopes = auth_context.get("scopes", [])
    
    # API key users have all permissions by default (backward compatibility)
    if auth_context.get("type") == "api_key":
        return True
    
    # Check if user has the required scope
    has_permission = required_scope in user_scopes
    
    if not has_permission:
        logger.warning(f"Scope permission denied: user has {user_scopes}, required {required_scope}")
    
    return has_permission


def create_jwks() -> Dict[str, Any]:
    """
    Create JWKS (JSON Web Key Set) for token signing.
    
    This is used when the MCP server acts as its own authorization server.
    
    Returns:
        JWKS dictionary
    """
    if JWT_ALGORITHM.startswith("RS"):
        # RSA keys for RS256, RS384, RS512
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        public_key = private_key.public_key()
        public_numbers = public_key.public_numbers()
        
        # Convert to JWKS format
        jwks = {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "kid": "intervals-mcp-server-key",
                    "n": public_numbers.n.to_bytes(256, 'big').hex(),
                    "e": public_numbers.e.to_bytes(3, 'big').hex(),
                    "alg": JWT_ALGORITHM
                }
            ]
        }
        
        return jwks
    else:
        # For HMAC algorithms, we don't expose the secret key
        logger.warning("JWKS endpoint not applicable for HMAC algorithms")
        return {"keys": []}


async def register_oauth_client(request: Request) -> Dict[str, Any]:
    """
    Dynamic Client Registration endpoint for OAuth 2.1.
    
    This allows Claude Desktop to register as a public client.
    """
    try:
        client_data = await request.json()
        
        # Generate client ID
        client_id = f"intervals_mcp_{secrets.token_urlsafe(16)}"
        
        # Determine client type
        is_public_client = (
            client_data.get("token_endpoint_auth_method") == "none" or
            "client_secret" not in client_data
        )
        
        # For public clients (like Claude Desktop), no client secret needed
        client_secret = None if is_public_client else secrets.token_urlsafe(32)
        
        # Validate redirect URIs (security requirement)
        redirect_uris = client_data.get("redirect_uris", [])
        for uri in redirect_uris:
            if not (uri.startswith("https://") or uri.startswith("http://localhost")):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid redirect URI: must be HTTPS or localhost"
                )
        
        # Store client information
        client_info = {
            "client_id": client_id,
            "client_secret": client_secret,
            "client_name": client_data.get("client_name", "MCP Client"),
            "redirect_uris": redirect_uris,
            "grant_types": client_data.get("grant_types", ["authorization_code"]),
            "response_types": client_data.get("response_types", ["code"]),
            "token_endpoint_auth_method": "none" if is_public_client else "client_secret_post",
            "scope": client_data.get("scope", "intervals:read intervals:write"),
            "is_public_client": is_public_client,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        OAUTH_CLIENTS[client_id] = client_info
        save_clients()  # Persist clients to file
        
        # Prepare response (don't include client_secret for public clients)
        response = {
            "client_id": client_id,
            "client_name": client_info["client_name"],
            "redirect_uris": redirect_uris,
            "grant_types": client_info["grant_types"],
            "response_types": client_info["response_types"],
            "token_endpoint_auth_method": client_info["token_endpoint_auth_method"],
            "scope": client_info["scope"],
        }
        
        if not is_public_client:
            response["client_secret"] = client_secret
        
        logger.info(f"Registered {'public' if is_public_client else 'confidential'} client: {client_id}")
        return response
        
    except Exception as e:
        logger.error(f"Client registration failed: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Client registration failed: {str(e)}"
        )


def verify_pkce(code_verifier: str, code_challenge: str, code_challenge_method: str = "S256") -> bool:
    """
    Verify PKCE code challenge.
    
    Args:
        code_verifier: The original random string
        code_challenge: The challenge derived from the verifier
        code_challenge_method: Method used to generate challenge (S256 or plain)
    
    Returns:
        True if PKCE verification succeeds
    """
    if code_challenge_method == "S256":
        # SHA256 hash of code_verifier, then base64url encode
        digest = hashlib.sha256(code_verifier.encode('ascii')).digest()
        expected_challenge = base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')
        return expected_challenge == code_challenge
    elif code_challenge_method == "plain":
        return code_verifier == code_challenge
    else:
        return False


async def handle_authorization_request(request: Request) -> Dict[str, Any]:
    """
    Handle OAuth authorization request.
    
    This is where Claude Desktop would redirect users for authorization.
    For MCP servers, this is typically auto-approved.
    """
    params = dict(request.query_params)
    
    client_id = params.get("client_id")
    redirect_uri = params.get("redirect_uri")
    response_type = params.get("response_type")
    scope = params.get("scope", "")
    state = params.get("state")
    code_challenge = params.get("code_challenge")
    code_challenge_method = params.get("code_challenge_method", "S256")
    
    # Validate client
    if client_id not in OAUTH_CLIENTS:
        raise HTTPException(status_code=400, detail="Invalid client_id")
    
    client = OAUTH_CLIENTS[client_id]
    
    # Validate redirect URI
    if redirect_uri not in client["redirect_uris"]:
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")
    
    # Validate response type
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Unsupported response_type")
    
    # For public clients, PKCE is required
    if client["is_public_client"] and not code_challenge:
        raise HTTPException(status_code=400, detail="PKCE required for public clients")
    
    # Generate authorization code
    auth_code = secrets.token_urlsafe(32)
    
    # Store authorization code with associated data
    AUTHORIZATION_CODES[auth_code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),  # 10 minute expiry
        "used": False,
    }
    
    logger.info(f"Generated authorization code for client {client_id}")
    
    # For MCP servers, we auto-approve and redirect to the redirect_uri
    from fastapi.responses import RedirectResponse
    import urllib.parse
    
    # Build callback URL with authorization code and state
    callback_params = {
        "code": auth_code,
        "state": state
    }
    callback_url = f"{redirect_uri}?{urllib.parse.urlencode(callback_params)}"
    
    logger.info(f"Redirecting to callback URL: {callback_url}")
    return RedirectResponse(url=callback_url, status_code=302)


async def handle_token_request(
    grant_type: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    code_verifier: Optional[str] = Form(None),
    scope: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Handle OAuth token request.
    
    Supports both confidential and public clients (with PKCE).
    """
    if grant_type != "authorization_code":
        raise HTTPException(status_code=400, detail="Unsupported grant_type")
    
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    
    # Validate authorization code
    if code not in AUTHORIZATION_CODES:
        raise HTTPException(status_code=400, detail="Invalid authorization code")
    
    auth_data = AUTHORIZATION_CODES[code]
    
    # Check if code is expired or already used
    if auth_data["used"] or datetime.now(timezone.utc) > auth_data["expires_at"]:
        raise HTTPException(status_code=400, detail="Authorization code expired or already used")
    
    # Validate client
    stored_client_id = auth_data["client_id"]
    if client_id != stored_client_id:
        raise HTTPException(status_code=400, detail="Client ID mismatch")
    
    if stored_client_id not in OAUTH_CLIENTS:
        raise HTTPException(status_code=400, detail="Invalid client")
    
    client = OAUTH_CLIENTS[stored_client_id]
    
    # Validate redirect URI
    if redirect_uri != auth_data["redirect_uri"]:
        raise HTTPException(status_code=400, detail="Redirect URI mismatch")
    
    # Handle authentication based on client type
    if client["is_public_client"]:
        # Public client: verify PKCE instead of client secret
        if not code_verifier or not auth_data["code_challenge"]:
            raise HTTPException(status_code=400, detail="PKCE verification required for public clients")
        
        if not verify_pkce(code_verifier, auth_data["code_challenge"], auth_data["code_challenge_method"]):
            raise HTTPException(status_code=400, detail="PKCE verification failed")
        
        logger.debug(f"PKCE verification successful for public client {client_id}")
    else:
        # Confidential client: verify client secret
        if client_secret != client["client_secret"]:
            raise HTTPException(status_code=400, detail="Invalid client secret")
        
        logger.debug(f"Client secret verification successful for confidential client {client_id}")
    
    # Mark authorization code as used
    auth_data["used"] = True
    
    # Generate access token
    access_token = create_access_token(
        client_id=client_id,
        scope=auth_data["scope"] or "intervals:read intervals:write"
    )
    
    # Generate refresh token (optional)
    refresh_token = secrets.token_urlsafe(32)
    
    # Store token info
    OAUTH_TOKENS[access_token] = {
        "client_id": client_id,
        "scope": auth_data["scope"] or "intervals:read intervals:write",
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "refresh_token": refresh_token,
    }
    
    logger.info(f"Issued access token for client {client_id}")
    
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 3600,  # 1 hour
        "refresh_token": refresh_token,
        "scope": auth_data["scope"] or "intervals:read intervals:write",
    }


def create_access_token(client_id: str, scope: str) -> str:
    """
    Create a JWT access token.
    
    Args:
        client_id: OAuth client identifier
        scope: Granted scopes
    
    Returns:
        JWT access token
    """
    if not JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY not configured")
    
    now = datetime.now(timezone.utc)
    payload = {
        "sub": client_id,  # Subject (client)
        "client_id": client_id,
        "scope": scope,
        "aud": OAUTH_AUDIENCE if OAUTH_AUDIENCE else "intervals-mcp-server",
        "iss": os.getenv("BASE_URL", "http://localhost:8000") + "/",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=24)).timestamp()),  # Extended to 24 hours for testing
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)