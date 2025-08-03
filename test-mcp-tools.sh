#!/bin/bash

# MCP Tools Test Script
# 本番環境のMCPツール疎通テスト

BASE_URL="https://kpnco-intervals-mcp-77.deno.dev"

echo "=== MCP Tools Test Script ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Initialize (認証不要)
echo "1. Initialize Test"
curl -s -X POST "$BASE_URL/" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }' | jq .

echo ""
echo "2. Tools List (認証必要)"
# 注意: 実際の使用時はOAuth認証トークンが必要
curl -s -X POST "$BASE_URL/" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tools-1",
    "method": "tools/list",
    "params": {}
  }' | jq .