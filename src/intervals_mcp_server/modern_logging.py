"""
Modern logging configuration for Intervals MCP Server.

Provides a drop-in replacement for standard logging with structured logging capabilities.
"""

import os
import sys
import logging
from typing import Any, Dict

try:
    import structlog
    from structlog.typing import EventDict
    STRUCTLOG_AVAILABLE = True
except ImportError:
    STRUCTLOG_AVAILABLE = False

try:
    from loguru import logger as loguru_logger
    LOGURU_AVAILABLE = True
except ImportError:
    LOGURU_AVAILABLE = False


def filter_sensitive_data(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """Filter sensitive information from logs."""
    sensitive_keys = ["password", "api_key", "secret", "token", "jwt_secret_key"]
    for key in list(event_dict.keys()):
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            event_dict[key] = "[REDACTED]"
    return event_dict


def setup_structlog(environment: str = "development") -> Any:
    """
    Setup structlog with environment-appropriate configuration.
    
    Args:
        environment: "development" or "production"
        
    Returns:
        Configured structlog logger
    """
    if not STRUCTLOG_AVAILABLE:
        raise ImportError("structlog is not installed. Install with: pip install structlog")
    
    # Configure standard logging for uvicorn compatibility
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level, logging.INFO),
    )
    
    if environment == "production":
        # Production: JSON output for log aggregation
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            filter_sensitive_data,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ]
    else:
        # Development: Pretty console output
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            filter_sensitive_data,
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        context_class=dict,
        cache_logger_on_first_use=True,
    )
    
    return structlog.get_logger()


def setup_loguru(environment: str = "development") -> Any:
    """
    Setup loguru with environment-appropriate configuration.
    
    Args:
        environment: "development" or "production"
        
    Returns:
        Configured loguru logger
    """
    if not LOGURU_AVAILABLE:
        raise ImportError("loguru is not installed. Install with: pip install loguru")
    
    from loguru import logger
    
    # Remove default handler
    logger.remove()
    
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    if environment == "production":
        # Production: JSON format
        logger.add(
            sys.stdout,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
            level=log_level,
            serialize=True  # JSON output
        )
    else:
        # Development: Pretty colors
        logger.add(
            sys.stdout,
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
                   "<level>{level: <8}</level> | "
                   "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
                   "<level>{message}</level>",
            level=log_level,
            colorize=True
        )
    
    return logger


def get_logger(name: str = None) -> Any:
    """
    Get a logger instance with automatic library detection.
    
    Priority:
    1. Structlog (recommended for production)
    2. Loguru (good for development) 
    3. Standard logging (fallback)
    
    Args:
        name: Logger name (for standard logging compatibility)
        
    Returns:
        Configured logger instance
    """
    environment = os.getenv("ENVIRONMENT", "development")
    preferred_library = os.getenv("LOGGING_LIBRARY", "auto")
    
    if preferred_library == "structlog" or (preferred_library == "auto" and STRUCTLOG_AVAILABLE):
        return setup_structlog(environment)
    elif preferred_library == "loguru" or (preferred_library == "auto" and LOGURU_AVAILABLE):
        return setup_loguru(environment)
    else:
        # Fallback to standard logging (current implementation)
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        logging.basicConfig(
            level=getattr(logging, log_level, logging.INFO),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[logging.StreamHandler(sys.stdout)]
        )
        return logging.getLogger(name or __name__)


# Drop-in replacement functions for existing code
def get_production_logger():
    """Get production-ready logger (backward compatibility)."""
    return get_logger("intervals_mcp_production")


def get_server_logger():
    """Get server logger (backward compatibility).""" 
    return get_logger("intervals_icu_mcp_server")