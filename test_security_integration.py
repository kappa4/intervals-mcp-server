#!/usr/bin/env python
"""
Integration test script for security features
"""

import asyncio
import httpx
import sys

BASE_URL = "http://localhost:9000"


async def test_health_endpoint():
    """Test health endpoint (no auth required)"""
    print("\n=== Testing Health Endpoint ===")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        assert response.status_code == 200


async def test_api_key_auth():
    """Test API key authentication"""
    print("\n=== Testing API Key Authentication ===")
    
    async with httpx.AsyncClient() as client:
        # Test without API key
        print("\n1. Without API key:")
        try:
            response = await client.get(f"{BASE_URL}/sse")
            print(f"Status: {response.status_code}")
            if response.status_code == 401:
                print(f"Response: {response.json()}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test with wrong API key
        print("\n2. With wrong API key:")
        try:
            response = await client.get(
                f"{BASE_URL}/sse",
                headers={"X-API-Key": "wrong_key"}
            )
            print(f"Status: {response.status_code}")
            if response.status_code == 401:
                print(f"Response: {response.json()}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test with correct API key
        print("\n3. With correct API key:")
        try:
            response = await client.get(
                f"{BASE_URL}/sse",
                headers={"X-API-Key": "test_key"},
                timeout=2.0
            )
            print(f"Status: {response.status_code}")
            print(f"Headers: {dict(response.headers)}")
        except httpx.TimeoutException:
            print("Timeout (expected for SSE endpoint)")
        except Exception as e:
            print(f"Error: {e}")


async def test_origin_validation():
    """Test origin header validation"""
    print("\n=== Testing Origin Validation ===")
    
    async with httpx.AsyncClient() as client:
        headers_base = {"X-API-Key": "test_key"}
        
        # Test allowed origin
        print("\n1. Allowed origin (https://claude.ai):")
        headers = {**headers_base, "Origin": "https://claude.ai"}
        try:
            response = await client.get(
                f"{BASE_URL}/sse",
                headers=headers,
                timeout=2.0
            )
            print(f"Status: {response.status_code}")
            assert response.status_code != 403
        except httpx.TimeoutException:
            print("Timeout (expected for SSE endpoint)")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test disallowed origin
        print("\n2. Disallowed origin (https://evil.com):")
        headers = {**headers_base, "Origin": "https://evil.com"}
        try:
            response = await client.get(
                f"{BASE_URL}/sse",
                headers=headers
            )
            print(f"Status: {response.status_code}")
            if response.status_code == 403:
                print(f"Response: {response.json()}")
        except Exception as e:
            print(f"Error: {e}")


async def test_cors_headers():
    """Test CORS headers"""
    print("\n=== Testing CORS Headers ===")
    
    async with httpx.AsyncClient() as client:
        # OPTIONS request with allowed origin
        print("\n1. OPTIONS request with allowed origin:")
        response = await client.options(
            f"{BASE_URL}/health",
            headers={"Origin": "https://claude.ai"}
        )
        print(f"Status: {response.status_code}")
        print("CORS Headers:")
        for header in ["access-control-allow-origin", "access-control-allow-methods", "access-control-max-age"]:
            value = response.headers.get(header)
            if value:
                print(f"  {header}: {value}")


async def test_mcp_initialization():
    """Test MCP initialization sequence"""
    print("\n=== Testing MCP Initialization ===")
    
    async with httpx.AsyncClient() as client:
        # Prepare initialization request
        init_request = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "test", "version": "1.0"}
            },
            "id": 1
        }
        
        headers = {
            "X-API-Key": "test_key",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        
        print("\n1. Sending initialization request:")
        try:
            response = await client.post(
                f"{BASE_URL}/messages/",
                json=init_request,
                headers=headers,
                timeout=5.0
            )
            print(f"Status: {response.status_code}")
            
            # Check for SSE response
            if response.status_code == 200:
                print("Response headers:", dict(response.headers))
                # Read SSE data
                content = response.text
                print(f"Response content (first 500 chars): {content[:500]}")
                
                # Look for session ID
                session_id = response.headers.get("mcp-session-id")
                if session_id:
                    print(f"Session ID: {session_id}")
        except Exception as e:
            print(f"Error: {e}")


async def main():
    print("Starting Security Integration Tests")
    print(f"Base URL: {BASE_URL}")
    print("\nMake sure the server is running with:")
    print("PORT=9000 MCP_API_KEY=test_key ALLOWED_ORIGINS=https://claude.ai uv run python src/intervals_mcp_server/server.py")
    
    try:
        await test_health_endpoint()
        await test_api_key_auth()
        await test_origin_validation()
        await test_cors_headers()
        await test_mcp_initialization()
        print("\n✅ All tests completed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())