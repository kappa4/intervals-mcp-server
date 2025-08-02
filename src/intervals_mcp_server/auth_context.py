"""
Authentication context management for MCP tools

This module provides a way to pass authentication context to MCP tools
since FastMCP doesn't support middleware-based context injection.
"""

import contextvars
from typing import Dict, Any, Optional

# Context variable to store authentication context per request
auth_context_var: contextvars.ContextVar[Optional[Dict[str, Any]]] = contextvars.ContextVar(
    'auth_context', default=None
)


def set_auth_context(context: Dict[str, Any]) -> None:
    """
    Set the authentication context for the current request.
    
    Args:
        context: Authentication context dictionary
    """
    auth_context_var.set(context)


def get_auth_context() -> Optional[Dict[str, Any]]:
    """
    Get the authentication context for the current request.
    
    Returns:
        Authentication context dictionary or None if not authenticated
    """
    return auth_context_var.get()


def require_scope(required_scope: str) -> None:
    """
    Check if the current authenticated user has the required scope.
    
    Args:
        required_scope: Required scope (e.g., "intervals:read")
        
    Raises:
        RuntimeError: If authentication context is missing or scope is insufficient
    """
    from intervals_mcp_server.oauth import check_scope_permission
    
    context = get_auth_context()
    
    if not context:
        raise RuntimeError("Authentication required: No authentication context available")
    
    if not check_scope_permission(context, required_scope):
        user_scopes = context.get("scopes", [])
        raise RuntimeError(
            f"Insufficient permissions: user has {user_scopes}, required {required_scope}"
        )


def get_user_id() -> Optional[str]:
    """
    Get the current authenticated user ID.
    
    Returns:
        User ID or None if not authenticated
    """
    context = get_auth_context()
    return context.get("user_id") if context else None


def get_client_id() -> Optional[str]:
    """
    Get the current authenticated client ID.
    
    Returns:
        Client ID or None if not authenticated
    """
    context = get_auth_context()
    return context.get("client_id") if context else None