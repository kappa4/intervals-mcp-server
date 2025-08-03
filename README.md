# Intervals.icu MCP Server (TypeScript)

A Model Context Protocol (MCP) server for Intervals.icu built with TypeScript and Deno Deploy.

## Features

- **OAuth 2.1 Authentication** with PKCE support for Claude Desktop
- **MCP Protocol Support** with Server-Sent Events (SSE)
- **Intervals.icu API Integration** for fitness data management
- **Deno Deploy** for reliable serverless hosting
- **Type Safety** with full TypeScript support
- **Custom Fields Support** for activities and wellness data

## Based on Memory MCP Success Pattern

This implementation follows the proven Memory MCP architecture that successfully connects with Claude.ai.

## Development

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Run locally
deno task dev

# Deploy to Deno Deploy
# Connect GitHub repository to Deno Deploy dashboard
```

## Environment Variables

Required environment variables for Deno Deploy:

```
ATHLETE_ID=your_intervals_athlete_id
API_KEY=your_intervals_api_key
JWT_SECRET_KEY=your_jwt_secret_minimum_32_chars
ORIGIN=https://your-deno-deploy-url.deno.dev
```

## Deployment

Current deployment:
- URL: https://kpnco-intervals-mcp-77.deno.dev
- Platform: Deno Deploy
- KV Storage: Deno KV (managed)

## Endpoints

- `GET /health` - Health check
- `GET /info` - Server information
- `GET /` - MCP SSE endpoint
- `POST /` - MCP protocol messages
- OAuth 2.1 endpoints:
  - `GET /.well-known/oauth-authorization-server`
  - `POST /oauth/register`
  - `GET /oauth/authorize` 
  - `POST /oauth/token`

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "intervals-remote": {
      "url": "https://your-app.deno.dev",
      "transport": "sse",
      "oauth": {
        "authorization_endpoint": "/oauth/authorize",
        "token_endpoint": "/oauth/token", 
        "registration_endpoint": "/oauth/register",
        "scopes": ["intervals:read", "intervals:write"]
      }
    }
  }
}
```