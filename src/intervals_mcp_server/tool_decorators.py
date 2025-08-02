"""
Tool decorators for authentication and authorization in MCP tools

This module provides decorators to handle authentication and authorization
for MCP tools without modifying the FastMCP framework.
"""

import functools
import logging
from typing import Callable
from intervals_mcp_server.auth_context import require_scope

logger = logging.getLogger("intervals_mcp_server.tool_decorators")


def require_intervals_scope(scope: str):
    """
    Decorator to require specific scope for MCP tool execution.
    
    Args:
        scope: Required scope (e.g., "intervals:read", "intervals:write")
    
    Returns:
        Decorator function
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                require_scope(scope)
                logger.debug(f"Scope check passed for {func.__name__}: {scope}")
                return await func(*args, **kwargs)
            except RuntimeError as e:
                error_msg = f"Permission denied for {func.__name__}: {str(e)}"
                logger.warning(error_msg)
                return error_msg
        return wrapper
    return decorator


def require_read_access(func: Callable) -> Callable:
    """Decorator to require intervals:read scope."""
    return require_intervals_scope("intervals:read")(func)


def require_write_access(func: Callable) -> Callable:
    """Decorator to require intervals:write scope."""
    return require_intervals_scope("intervals:write")(func)


def require_admin_access(func: Callable) -> Callable:
    """Decorator to require intervals:admin scope."""
    return require_intervals_scope("intervals:admin")(func)