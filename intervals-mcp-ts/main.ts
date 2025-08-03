/// <reference lib="deno.unstable" />
/**
 * Intervals.icu MCP Server for Deno Deploy
 * Based on Memory MCP successful pattern
 * Implements MCP v2024-11-05 with Streamable HTTP Transport
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";
import { log, info, warn, error } from "./logger.ts";
import { OAuthServer } from "./oauth/auth-server.ts";
import { MCPHandler } from "./mcp-handler.ts";

// Environment validation
function validateEnvironment(): void {
  const required = {
    ATHLETE_ID: "Intervals.icu athlete ID (e.g., i123456)",
    API_KEY: "Intervals.icu API key", 
    JWT_SECRET_KEY: "JWT secret key (minimum 32 characters)",
    ORIGIN: "Server origin URL for OAuth (e.g., https://your-app.deno.dev)"
  };

  const missing: string[] = [];
  
  for (const [key, description] of Object.entries(required)) {
    if (!Deno.env.get(key)) {
      missing.push(`${key}: ${description}`);
    }
  }

  // Validate JWT secret length
  const jwtSecret = Deno.env.get("JWT_SECRET_KEY") || "";
  if (jwtSecret.length < 32) {
    missing.push("JWT_SECRET_KEY: Must be at least 32 characters long");
  }

  if (missing.length > 0) {
    error("Missing required environment variables:");
    missing.forEach(msg => error(`  ${msg}`));
    throw new Error("Missing required environment variables. Please check the logs above.");
  }

  info("Environment validation passed");
}

// Validate environment on startup
validateEnvironment();

// Initialize Intervals API client
const intervalsClient = new IntervalsAPIClient({
  athlete_id: Deno.env.get("ATHLETE_ID")!,
  api_key: Deno.env.get("API_KEY")!,
});

// Initialize OAuth server
const origin = Deno.env.get("ORIGIN")!;
const oauthServer = new OAuthServer(origin);

// Initialize OAuth server (register Claude Web client)
try {
  await oauthServer.initialize();
  info("[Main] OAuth server initialized successfully");
} catch (err) {
  error("[Main] Failed to initialize OAuth server:", err);
  // Continue anyway - the server might still work if clients are already registered
}

// Initialize MCP handler
const mcpHandler = new MCPHandler(intervalsClient, oauthServer);

// CORS headers for browser-based clients
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, Accept",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // Log incoming requests
  const userAgent = req.headers.get("User-Agent") || "Unknown";
  const authHeader = req.headers.get("Authorization") ? "Bearer ***" : "No Auth";
  info(`${req.method} ${path} - UA: ${userAgent} - Auth: ${authHeader}`);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Try OAuth endpoints first
  const oauthResponse = await oauthServer.handleRequest(req, path);
  if (oauthResponse) {
    return oauthResponse;
  }

  // Health check endpoint (no auth required)
  if (path === "/health") {
    return new Response(
      JSON.stringify({ 
        status: "healthy",
        service: "intervals-mcp-server", 
        version: "1.0.0",
        athlete_id: Deno.env.get("ATHLETE_ID"),
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...CORS_HEADERS, 
          "Content-Type": "application/json" 
        } 
      }
    );
  }
  
  // Server info endpoint (no auth required)
  if (path === "/info") {
    try {
      // Test Intervals API connection
      const athlete = await intervalsClient.getAthlete();
      
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          service: "intervals-mcp-server", 
          version: "1.0.0",
          protocol: "2024-11-05",
          athlete: {
            id: athlete.id,
            name: athlete.name,
            activities: athlete.activity_count || 0
          },
          endpoints: {
            mcp: ["GET /", "POST /", "DELETE /"],
            info: ["GET /health", "GET /info"],
            oauth: [
              "GET /.well-known/oauth-authorization-server",
              "POST /oauth/register", 
              "GET /oauth/authorize",
              "POST /oauth/token"
            ]
          }
        }),
        { 
          headers: { 
            ...CORS_HEADERS, 
            "Content-Type": "application/json" 
          } 
        }
      );
    } catch (err) {
      error("Failed to fetch athlete info:", err);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          service: "intervals-mcp-server",
          error: "Failed to connect to Intervals.icu API"
        }),
        { 
          status: 500,
          headers: { 
            ...CORS_HEADERS, 
            "Content-Type": "application/json" 
          } 
        }
      );
    }
  }

  // MCP protocol endpoints (authentication required)
  if (path === "/" || path.startsWith("/mcp")) {
    try {
      return await mcpHandler.handleRequest(req);
    } catch (err) {
      error("MCP handler error:", err);
      return new Response(
        JSON.stringify({ 
          error: "mcp_error",
          message: "Failed to process MCP request"
        }),
        { 
          status: 500,
          headers: { 
            ...CORS_HEADERS, 
            "Content-Type": "application/json" 
          } 
        }
      );
    }
  }
  
  // Default response for unhandled paths
  return new Response(
    JSON.stringify({ 
      error: "Not found",
      message: `Path ${path} not implemented yet`
    }),
    { 
      status: 404,
      headers: { 
        ...CORS_HEADERS, 
        "Content-Type": "application/json" 
      } 
    }
  );
}

// Start server
const port = parseInt(Deno.env.get("PORT") || "8000");
info(`Starting Intervals.icu MCP Server on port ${port}`);
info(`Athlete ID: ${Deno.env.get("ATHLETE_ID")}`);
info(`Origin: ${Deno.env.get("ORIGIN")}`);

await serve(handler, { port });