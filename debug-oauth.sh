#!/bin/bash
# OAuth debugging script for intervals-mcp-server

echo "=== OAuth Discovery Check ==="
curl -s https://kpnco-intervals-mcp-77.deno.dev/.well-known/oauth-authorization-server | jq

echo -e "\n=== Health Check ==="
curl -s https://kpnco-intervals-mcp-77.deno.dev/health | jq

echo -e "\n=== Initialize Request (No Auth) ==="
curl -s -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "Debug Client",
        "version": "1.0.0"
      }
    }
  }' | jq

echo -e "\n=== Tools List Request (Requires Auth) ==="
curl -s -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' | jq

echo -e "\n=== Done ==="