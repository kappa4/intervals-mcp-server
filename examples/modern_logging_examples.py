"""
Modern Python Logging Examples with Structlog and Loguru
FastAPI production-ready logging implementations
"""

import sys
import os
from typing import Any, Dict
import asyncio
import json

# Example 1: Structlog for Production (recommended for FastAPI)
import structlog
from structlog.typing import EventDict
import logging

def setup_structlog_production():
    """
    Production-ready structlog configuration for FastAPI projects.
    
    Features:
    - JSON output for log aggregation
    - Correlation IDs for request tracing
    - Proper log levels
    - Integration with uvicorn
    """
    
    # Configure standard logging (uvicorn compatibility)
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
    
    # Custom processor to add correlation ID
    def add_correlation_id(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
        # In real FastAPI app, get from context or middleware
        correlation_id = getattr(logger, "_correlation_id", None)
        if correlation_id:
            event_dict["correlation_id"] = correlation_id
        return event_dict
    
    # Custom processor to filter sensitive data
    def filter_sensitive_data(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
        sensitive_keys = ["password", "api_key", "secret", "token"]
        for key in sensitive_keys:
            if key in event_dict:
                event_dict[key] = "[REDACTED]"
        return event_dict
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            add_correlation_id,
            filter_sensitive_data,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()  # JSON for production
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        context_class=dict,
        cache_logger_on_first_use=True,
    )
    
    return structlog.get_logger()

def setup_structlog_development():
    """
    Development-friendly structlog configuration.
    
    Features:
    - Colorized console output
    - Pretty formatting
    - Readable timestamps
    """
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            structlog.dev.ConsoleRenderer(colors=True)  # Pretty colors for dev
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        context_class=dict,
        cache_logger_on_first_use=True,
    )
    
    return structlog.get_logger()

# Example 2: Loguru for Development (simple and beautiful)
def setup_loguru_development():
    """
    Loguru configuration for development environments.
    
    Features:
    - Zero configuration
    - Automatic colors
    - File rotation
    - Beautiful stack traces
    """
    from loguru import logger
    
    # Remove default handler
    logger.remove()
    
    # Add colorized console handler for development
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        level="DEBUG",
        colorize=True
    )
    
    # Add file handler with rotation
    logger.add(
        "logs/app_{time:YYYY-MM-DD}.log",
        rotation="1 day",
        retention="7 days",
        level="INFO",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"
    )
    
    return logger

# Example 3: FastAPI Middleware for Correlation IDs
from contextlib import asynccontextmanager
from contextvars import ContextVar
import uuid

# Context variable for correlation ID
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")

class LoggingMiddleware:
    """
    FastAPI middleware for request logging with correlation IDs.
    """
    
    def __init__(self, app, logger):
        self.app = app
        self.logger = logger
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Generate correlation ID
        correlation_id = str(uuid.uuid4())
        correlation_id_var.set(correlation_id)
        
        # Extract request info
        method = scope["method"]
        path = scope["path"]
        client_ip = scope.get("client", ["unknown"])[0]
        
        # Bind correlation ID to logger
        bound_logger = self.logger.bind(
            correlation_id=correlation_id,
            method=method,
            path=path,
            client_ip=client_ip
        )
        
        # Log request
        bound_logger.info("Request started")
        
        # Custom send wrapper to log response
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code = message["status"]
                bound_logger.info("Request completed", status_code=status_code)
            await send(message)
        
        await self.app(scope, receive, send_wrapper)

# Example 4: Configuration Factory
class LoggerFactory:
    """
    Factory class to create appropriate logger based on environment.
    """
    
    @staticmethod
    def create_logger(environment: str = None):
        if environment is None:
            environment = os.getenv("ENVIRONMENT", "development")
        
        if environment == "production":
            return setup_structlog_production()
        elif environment == "development":
            # Choose between structlog and loguru for development
            use_loguru = os.getenv("USE_LOGURU", "false").lower() == "true"
            if use_loguru:
                return setup_loguru_development()
            else:
                return setup_structlog_development()
        else:
            # Default to structlog development
            return setup_structlog_development()

# Example 5: Usage in FastAPI
async def example_fastapi_usage():
    """
    Example of how to use modern logging in FastAPI.
    """
    
    # Create logger based on environment
    logger = LoggerFactory.create_logger()
    
    # Structured logging with context
    logger.info("Application starting", 
                version="1.0.0", 
                environment=os.getenv("ENVIRONMENT", "development"))
    
    # Log with bound context (correlation ID added by middleware)
    bound_logger = logger.bind(user_id="u123", operation="get_activities")
    bound_logger.info("Processing user request")
    
    try:
        # Simulate some work
        await asyncio.sleep(0.1)
        bound_logger.info("Operation completed successfully", 
                         records_processed=42,
                         processing_time_ms=100)
        
    except Exception as e:
        bound_logger.error("Operation failed", 
                          error=str(e),
                          error_type=type(e).__name__)
        raise

# Example 6: Migration from standard logging
def migrate_from_standard_logging():
    """
    Show how to migrate from standard logging to structlog.
    """
    
    # Old way (what you currently have)
    import logging
    logging.basicConfig(level=logging.INFO)
    old_logger = logging.getLogger("intervals_mcp_production")
    
    old_logger.info("Starting server on port 8000")
    old_logger.info(f"Athlete ID: i123456")
    
    # New way with structlog
    new_logger = setup_structlog_production()
    
    new_logger.info("Starting server", 
                   port=8000,
                   athlete_id="i123456",
                   service="intervals-mcp-server")

if __name__ == "__main__":
    # Demo different logging approaches
    print("=== Structlog Production ===")
    prod_logger = setup_structlog_production()
    prod_logger.info("Production log example", 
                    user_id="u123", 
                    api_key="secret_key",  # Will be redacted
                    action="get_activities")
    
    print("\n=== Structlog Development ===")
    dev_logger = setup_structlog_development()
    dev_logger.info("Development log example", 
                   debug_info="This is easier to read")
    
    print("\n=== Loguru Development ===")
    loguru_logger = setup_loguru_development()
    loguru_logger.info("Loguru example with beautiful colors")
    loguru_logger.warning("This is a warning")
    loguru_logger.error("This is an error with stack trace")
    
    print("\n=== Migration Example ===")
    migrate_from_standard_logging()