"""
Logging decorators for clean code organization.

These decorators automatically handle logging without cluttering business logic.
"""

import functools
import logging
import time
from typing import Any, Callable, Optional


def log_function_call(
    logger: Optional[logging.Logger] = None,
    level: int = logging.INFO,
    include_args: bool = False,
    include_result: bool = False
):
    """
    Decorator to automatically log function calls.
    
    Args:
        logger: Logger instance (defaults to function's module logger)
        level: Log level to use
        include_args: Whether to log function arguments
        include_result: Whether to log function result
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Get logger if not provided
            log = logger or logging.getLogger(func.__module__)
            
            # Log function entry
            log_msg = f"Calling {func.__name__}"
            if include_args and (args or kwargs):
                log_msg += f" with args={args}, kwargs={kwargs}"
            log.log(level, log_msg)
            
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log success
                success_msg = f"{func.__name__} completed in {duration:.3f}s"
                if include_result:
                    success_msg += f" -> {result}"
                log.log(level, success_msg)
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                log.error(f"{func.__name__} failed after {duration:.3f}s: {e}")
                raise
                
        return wrapper
    return decorator


def log_api_call(logger: Optional[logging.Logger] = None):
    """
    Specialized decorator for API calls.
    Logs request details and response status.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            log = logger or logging.getLogger(func.__module__)
            
            # Extract URL if available
            url = "unknown"
            if args and hasattr(args[0], 'url'):
                url = str(args[0].url)
            elif 'url' in kwargs:
                url = kwargs['url']
            
            log.debug(f"API call: {func.__name__} -> {url}")
            
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log API success
                log.debug(f"API success: {func.__name__} ({duration:.3f}s)")
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                log.warning(f"API error: {func.__name__} ({duration:.3f}s): {e}")
                raise
                
        return wrapper
    return decorator


class LoggingContext:
    """
    Context manager for grouped logging operations.
    """
    
    def __init__(self, operation_name: str, logger: Optional[logging.Logger] = None):
        self.operation_name = operation_name
        self.logger = logger or logging.getLogger(__name__)
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        self.logger.info(f"Starting {self.operation_name}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        
        if exc_type is None:
            self.logger.info(f"{self.operation_name} completed in {duration:.3f}s")
        else:
            self.logger.error(f"{self.operation_name} failed after {duration:.3f}s: {exc_val}")
        
        return False  # Don't suppress exceptions