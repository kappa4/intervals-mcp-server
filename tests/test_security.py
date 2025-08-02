"""
Tests for security features
"""

import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

# Import the app with security enabled
os.environ["MCP_API_KEY"] = "test_api_key"
os.environ["ALLOWED_ORIGINS"] = "https://test.example.com,https://claude.ai"
os.environ["ENFORCE_HTTPS"] = "false"  # Disable for testing

from intervals_mcp_server.server import app

client = TestClient(app)


class TestAPIKeyAuthentication:
    """Test API Key authentication"""
    
    def test_health_check_no_auth_required(self):
        """Health check should work without authentication"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    @pytest.mark.skipif(
        "--stdio" in os.environ.get("PYTEST_CURRENT_TEST", "") or os.getenv("MCP_MODE") == "stdio",
        reason="SSE endpoint only available in HTTP mode"
    )
    def test_sse_endpoint_requires_api_key(self):
        """SSE endpoint should require API key when configured"""
        # Without API key
        response = client.get("/sse")
        assert response.status_code == 401
        assert "Authentication required: provide either valid Bearer token or X-API-Key header" in response.json()["detail"]
        
        # With wrong API key
        response = client.get("/sse", headers={"X-API-Key": "wrong_key"})
        assert response.status_code == 401
        
        # With correct API key (would succeed if SSE was properly mocked)
        response = client.get("/sse", headers={"X-API-Key": "test_api_key"})
        # Note: This will fail with different error because we're not in a real SSE context
        # but it should pass authentication
        assert response.status_code != 401
    
    def test_api_key_optional_when_not_configured(self):
        """API key should be optional when MCP_API_KEY is not set"""
        with patch.dict(os.environ, {"MCP_API_KEY": ""}):
            # Need to reimport to pick up env change
            from intervals_mcp_server.security import verify_api_key
            from fastapi import Request
            
            # Should not raise exception
            request = Request({"type": "http", "headers": []}, receive=None)
            import asyncio
            asyncio.run(verify_api_key(request, None))


class TestOriginValidation:
    """Test Origin header validation"""
    
    @pytest.mark.skipif(
        "--stdio" in os.environ.get("PYTEST_CURRENT_TEST", "") or os.getenv("MCP_MODE") == "stdio",
        reason="SSE endpoint only available in HTTP mode"
    )
    def test_origin_validation(self):
        """Origin should be validated against allowed list"""
        headers = {"X-API-Key": "test_api_key"}
        
        # No origin header - should pass
        response = client.get("/sse", headers=headers)
        assert response.status_code != 403
        
        # Allowed origin
        headers["Origin"] = "https://claude.ai"
        response = client.get("/sse", headers=headers)
        assert response.status_code != 403
        
        # Disallowed origin
        headers["Origin"] = "https://evil.com"
        response = client.get("/sse", headers=headers)
        assert response.status_code == 403
        assert "Origin https://evil.com is not allowed" in response.json()["detail"]
    
    def test_origin_validation_optional_when_not_configured(self):
        """Origin validation should be skipped when ALLOWED_ORIGINS is not set"""
        with patch.dict(os.environ, {"ALLOWED_ORIGINS": ""}):
            from intervals_mcp_server.security import verify_origin
            from fastapi import Request
            
            # Should not raise exception even with "bad" origin
            request = Request(
                {"type": "http", "headers": [[b"origin", b"https://any.com"]]}, 
                receive=None
            )
            import asyncio
            asyncio.run(verify_origin(request))


class TestCORSConfiguration:
    """Test CORS middleware configuration"""
    
    def test_cors_headers_present(self):
        """CORS headers should be present in responses"""
        response = client.options("/health", headers={"Origin": "https://claude.ai"})
        assert "access-control-allow-origin" in response.headers
        assert "access-control-allow-methods" in response.headers
        assert "access-control-max-age" in response.headers
    
    def test_cors_allowed_origins(self):
        """CORS should respect ALLOWED_ORIGINS configuration"""
        # Allowed origin
        response = client.options("/health", headers={"Origin": "https://claude.ai"})
        assert response.headers.get("access-control-allow-origin") == "https://claude.ai"
        
        # Disallowed origin
        response = client.options("/health", headers={"Origin": "https://evil.com"})
        # FastAPI CORS middleware returns null for disallowed origins
        assert response.headers.get("access-control-allow-origin") != "https://evil.com"


class TestHTTPSEnforcement:
    """Test HTTPS enforcement"""
    
    @pytest.mark.skipif(
        "--stdio" in os.environ.get("PYTEST_CURRENT_TEST", "") or os.getenv("MCP_MODE") == "stdio",
        reason="SSE endpoint only available in HTTP mode"
    )
    def test_https_enforcement_when_enabled(self):
        """HTTPS should be enforced when ENFORCE_HTTPS is true"""
        with patch.dict(os.environ, {"ENFORCE_HTTPS": "true"}):
            # Need to test with X-Forwarded-Proto header (common in production)
            headers = {
                "X-API-Key": "test_api_key",
                "X-Forwarded-Proto": "http"
            }
            
            # Should fail with HTTP
            response = client.get("/sse", headers=headers)
            assert response.status_code == 400
            assert "HTTPS required" in response.json()["detail"]
            
            # Should pass with HTTPS
            headers["X-Forwarded-Proto"] = "https"
            response = client.get("/sse", headers=headers)
            assert response.status_code != 400  # Won't be 400 for HTTPS error
    
    def test_https_not_enforced_by_default(self):
        """HTTPS should not be enforced by default"""
        with patch.dict(os.environ, {"ENFORCE_HTTPS": "false"}):
            headers = {
                "X-API-Key": "test_api_key",
                "X-Forwarded-Proto": "http"
            }
            response = client.get("/sse", headers=headers)
            # Should not get 400 for HTTPS requirement
            assert response.status_code != 400 or "HTTPS required" not in response.text


class TestLogging:
    """Test request logging"""
    
    def test_request_logging(self, caplog):
        """Requests should be logged"""
        import logging
        caplog.set_level(logging.INFO)
        
        response = client.get("/health")
        assert response.status_code == 200
        
        # Check that request was logged
        assert any("Request: GET /health" in record.message for record in caplog.records)
        assert any("Response: 200" in record.message for record in caplog.records)