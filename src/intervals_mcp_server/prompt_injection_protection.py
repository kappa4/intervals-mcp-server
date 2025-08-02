"""
Prompt injection protection for Intervals.icu MCP Server

This module provides security measures to detect and prevent prompt injection attacks
in user inputs to MCP tools, following security best practices for AI applications.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger("intervals_mcp_server.prompt_injection")

# Known prompt injection patterns
PROMPT_INJECTION_PATTERNS = [
    # Direct instruction attempts
    r"(?i)(ignore|forget|disregard).*(previous|above|earlier).*(instruction|prompt|rule)",
    r"(?i)(you are|act as|pretend to be|simulate).*(different|new|another)",
    r"(?i)(system|admin|root|developer).*(mode|access|privilege)",
    
    # Role manipulation
    r"(?i)(assistant|ai|model|system).*(now|from now|instead)",
    r"(?i)(change|switch|become).*(role|character|persona)",
    
    # Instruction termination attempts
    r"(?i)(end|stop|terminate).*(instruction|prompt|conversation)",
    r"(?i)(override|bypass|circumvent).*(rule|restriction|limit)",
    
    # Data exfiltration attempts
    r"(?i)(show|display|reveal|tell me).*(configuration|settings|environment|secret|key)",
    r"(?i)(what is|show me).*(your|the).*(prompt|instruction|system message)",
    
    # Code injection attempts
    r"(?i)(execute|run|eval|import).*(code|script|function)",
    r"(?i)(sql|database|query|select|insert|update|delete)",
    
    # XML/HTML injection
    r"<\s*\/?\s*(script|iframe|object|embed|style)",
    r"(?i)javascript\s*:",
    
    # Special tokens/delimiters
    r"(\[INST\]|\[\/INST\]|\<\|system\|\>|\<\|user\|\>|\<\|assistant\|\>)",
    r"(?i)(###|---|\*\*\*).*(system|instruction|prompt)",
]

# Suspicious keywords that warrant additional logging
SUSPICIOUS_KEYWORDS = [
    "jailbreak", "prompt", "instruction", "system", "override", "bypass",
    "hack", "exploit", "inject", "manipulate", "trick", "fool"
]

# Maximum allowed length for various input types
MAX_INPUT_LENGTHS = {
    "athlete_id": 50,
    "api_key": 200,
    "event_id": 50,
    "activity_id": 50,
    "date": 20,
    "name": 200,
    "description": 5000,
    "workout_type": 50,
}


class PromptInjectionDetector:
    """Detects and prevents prompt injection attacks in user inputs."""
    
    def __init__(self):
        self.compiled_patterns = [re.compile(pattern) for pattern in PROMPT_INJECTION_PATTERNS]
        self.detection_count = 0
        self.last_detection_time: Optional[datetime] = None
    
    def check_input_safety(self, value: Any, param_name: str = "unknown") -> Dict[str, Any]:
        """
        Check if input value is safe from prompt injection attacks.
        
        Args:
            value: Input value to check
            param_name: Name of the parameter being checked
            
        Returns:
            Dictionary with safety assessment results
        """
        if not isinstance(value, str):
            return {"safe": True, "reason": "non-string input"}
        
        # Check length limits
        max_length = MAX_INPUT_LENGTHS.get(param_name, 1000)
        if len(value) > max_length:
            logger.warning(f"Input too long for {param_name}: {len(value)} > {max_length}")
            return {
                "safe": False,
                "reason": f"Input too long ({len(value)} > {max_length} characters)",
                "severity": "medium"
            }
        
        # Check for suspicious patterns
        for i, pattern in enumerate(self.compiled_patterns):
            if pattern.search(value):
                self.detection_count += 1
                self.last_detection_time = datetime.now()
                
                logger.warning(
                    f"Potential prompt injection detected in {param_name}: "
                    f"pattern #{i}, value: {value[:100]}..."
                )
                
                return {
                    "safe": False,
                    "reason": f"Potential prompt injection detected (pattern #{i})",
                    "severity": "high",
                    "detected_pattern": PROMPT_INJECTION_PATTERNS[i]
                }
        
        # Check for suspicious keywords
        value_lower = value.lower()
        found_keywords = [kw for kw in SUSPICIOUS_KEYWORDS if kw in value_lower]
        
        if found_keywords:
            logger.info(f"Suspicious keywords detected in {param_name}: {found_keywords}")
            # Log but don't block - might be legitimate usage
            return {
                "safe": True,
                "reason": "Contains suspicious keywords but no injection patterns",
                "suspicious_keywords": found_keywords,
                "severity": "low"
            }
        
        return {"safe": True, "reason": "passed all checks"}
    
    def sanitize_input(self, value: str, param_name: str = "unknown") -> str:
        """
        Sanitize input by removing potentially dangerous content.
        
        Args:
            value: Input string to sanitize
            param_name: Name of the parameter being sanitized
            
        Returns:
            Sanitized string
        """
        if not isinstance(value, str):
            return str(value)
        
        original_value = value
        
        # Remove HTML/XML tags
        value = re.sub(r'<[^>]*>', '', value)
        
        # Remove potential code injection attempts
        value = re.sub(r'(?i)(javascript|vbscript|onload|onerror|eval)\s*[:=]\s*["\']?[^"\']*["\']?', '', value)
        
        # Limit consecutive special characters
        value = re.sub(r'[^\w\s.,!?@#$%()-]{3,}', '***', value)
        
        # Truncate to maximum allowed length
        max_length = MAX_INPUT_LENGTHS.get(param_name, 1000)
        if len(value) > max_length:
            value = value[:max_length] + "..."
            logger.info(f"Truncated {param_name} from {len(original_value)} to {len(value)} characters")
        
        if value != original_value:
            logger.info(f"Sanitized {param_name}: '{original_value[:50]}...' -> '{value[:50]}...'")
        
        return value.strip()
    
    def get_detection_stats(self) -> Dict[str, Any]:
        """Get statistics about prompt injection detections."""
        return {
            "total_detections": self.detection_count,
            "last_detection": self.last_detection_time.isoformat() if self.last_detection_time else None,
        }


# Global detector instance
detector = PromptInjectionDetector()


def validate_tool_inputs(**kwargs) -> List[str]:
    """
    Validate all inputs to an MCP tool for prompt injection attacks.
    
    Args:
        **kwargs: Tool input parameters
        
    Returns:
        List of error messages (empty if all inputs are safe)
    """
    errors = []
    
    for param_name, value in kwargs.items():
        if value is None:
            continue
            
        safety_check = detector.check_input_safety(value, param_name)
        
        if not safety_check["safe"]:
            severity = safety_check.get("severity", "medium")
            reason = safety_check["reason"]
            
            if severity == "high":
                errors.append(f"Security violation in {param_name}: {reason}")
            elif severity == "medium":
                errors.append(f"Input validation failed for {param_name}: {reason}")
        
        # Log suspicious but non-blocking content
        elif "suspicious_keywords" in safety_check:
            logger.info(
                f"Suspicious content in {param_name}: {safety_check['suspicious_keywords']}"
            )
    
    return errors


def sanitize_tool_inputs(**kwargs) -> Dict[str, Any]:
    """
    Sanitize all inputs to an MCP tool.
    
    Args:
        **kwargs: Tool input parameters
        
    Returns:
        Dictionary of sanitized parameters
    """
    sanitized = {}
    
    for param_name, value in kwargs.items():
        if isinstance(value, str):
            sanitized[param_name] = detector.sanitize_input(value, param_name)
        else:
            sanitized[param_name] = value
    
    return sanitized


def require_safe_inputs(func):
    """
    Decorator to validate tool inputs for prompt injection attacks.
    
    Args:
        func: MCP tool function to protect
        
    Returns:
        Wrapped function with input validation
    """
    import functools
    
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        # Validate inputs
        errors = validate_tool_inputs(**kwargs)
        
        if errors:
            error_msg = f"Security validation failed for {func.__name__}: {'; '.join(errors)}"
            logger.error(error_msg)
            return error_msg
        
        # Sanitize inputs
        sanitized_kwargs = sanitize_tool_inputs(**kwargs)
        
        # Call original function with sanitized inputs
        return await func(*args, **sanitized_kwargs)
    
    return wrapper