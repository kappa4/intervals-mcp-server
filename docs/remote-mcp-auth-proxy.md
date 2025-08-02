# Remote MCP Authentication Proxy Setup Guide

This guide explains how to set up authentication for the Intervals.icu MCP Server when deploying as a Remote MCP server.

## Overview

Due to current limitations in the MCP framework (specifically FastMCP), authentication cannot be implemented directly within the MCP server. The recommended approach is to use a reverse proxy that handles authentication before forwarding requests to the MCP server.

## Architecture

```
[Claude Desktop] ---> [Auth Proxy] ---> [MCP Server]
                         ↑
                    Authentication
                    happens here
```

## Implementation Examples

### 1. Cloudflare Workers (Recommended for Production)

Create a new Cloudflare Worker with the following code:

```javascript
export default {
  async fetch(request, env, ctx) {
    // Check API Key
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== env.MCP_API_KEY) {
      return new Response('Unauthorized', { 
        status: 401,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }

    // Check Origin (optional)
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [];
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      return new Response('Forbidden', { 
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }

    // Forward request to MCP server
    const url = new URL(request.url);
    url.hostname = new URL(env.MCP_SERVER_URL).hostname;
    url.port = new URL(env.MCP_SERVER_URL).port;
    
    const modifiedRequest = new Request(url, request);
    
    // Add CORS headers if needed
    const response = await fetch(modifiedRequest);
    const modifiedResponse = new Response(response.body, response);
    
    if (origin && allowedOrigins.includes(origin)) {
      modifiedResponse.headers.set('Access-Control-Allow-Origin', origin);
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
    }
    
    return modifiedResponse;
  }
}
```

Environment variables to set in Cloudflare:
- `MCP_API_KEY`: Your secure API key
- `MCP_SERVER_URL`: URL of your MCP server (e.g., http://your-server.com:8000)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins

### 2. Nginx Configuration

```nginx
upstream mcp_server {
    server localhost:8000;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        # Check API Key
        if ($http_x_api_key != "your_secure_api_key") {
            return 401 'Unauthorized';
        }

        # Check Origin (optional)
        set $cors_origin "";
        if ($http_origin ~* ^(https://claude\.ai|https://app\.claude\.ai)$) {
            set $cors_origin $http_origin;
        }

        # CORS headers
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "*" always;

        # Handle preflight requests
        if ($request_method = OPTIONS) {
            return 204;
        }

        # Proxy settings
        proxy_pass http://mcp_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE specific settings
        proxy_set_header Accept "application/json, text/event-stream";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }
}
```

### 3. Node.js Express Proxy

```javascript
const express = require('express');
const httpProxy = require('http-proxy-middleware');

const app = express();

// Configuration
const MCP_API_KEY = process.env.MCP_API_KEY;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8000';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',');

// Authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== MCP_API_KEY) {
    return res.status(401).send('Unauthorized');
  }
  next();
};

// CORS middleware
const cors = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
};

// Apply middleware
app.use(cors);
app.use(authenticate);

// Proxy configuration
const proxyOptions = {
  target: MCP_SERVER_URL,
  changeOrigin: true,
  ws: true,
  onProxyReq: (proxyReq, req, res) => {
    // Ensure proper headers for SSE
    proxyReq.setHeader('Accept', 'application/json, text/event-stream');
  },
};

// Create proxy
app.use('/', httpProxy.createProxyMiddleware(proxyOptions));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth proxy listening on port ${PORT}`);
});
```

## Claude Desktop Configuration

When connecting through an authentication proxy, configure Claude Desktop as follows:

```json
{
  "mcpServers": {
    "intervals-remote": {
      "url": "https://your-proxy-domain.com/sse",
      "transport": "sse",
      "headers": {
        "X-API-Key": "your_secure_api_key"
      }
    }
  }
}
```

## Security Best Practices

1. **Use HTTPS**: Always use HTTPS in production to encrypt API keys in transit
2. **Strong API Keys**: Generate long, random API keys (e.g., 32+ characters)
3. **Rate Limiting**: Implement rate limiting in your proxy to prevent abuse
4. **Logging**: Log authentication attempts for security monitoring
5. **Key Rotation**: Regularly rotate API keys
6. **Environment Variables**: Never hardcode API keys; use environment variables

## Testing Your Setup

1. Test authentication with curl:
```bash
# Should fail (401)
curl -v https://your-proxy.com/health

# Should succeed
curl -v https://your-proxy.com/health \
  -H "X-API-Key: your_secure_api_key"
```

2. Test SSE endpoint:
```bash
curl -v https://your-proxy.com/sse \
  -H "X-API-Key: your_secure_api_key" \
  -H "Accept: text/event-stream"
```

## Troubleshooting

### Common Issues

1. **"Unauthorized" errors**: Check that the API key is correctly set in both the proxy and Claude Desktop configuration
2. **CORS errors**: Ensure the Origin header from Claude Desktop is in your allowed origins list
3. **SSE connection drops**: Check proxy timeout settings and ensure buffering is disabled
4. **"Cannot connect" errors**: Verify the MCP server is running and accessible from the proxy

### Debug Tips

- Enable verbose logging in your proxy to see incoming requests
- Use browser developer tools to inspect network requests from Claude Desktop
- Test each component independently (proxy → MCP server, then Claude → proxy)