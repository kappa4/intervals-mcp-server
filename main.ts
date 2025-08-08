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
import { createUnauthorizedResponse } from "./oauth/middleware.ts";
import { MCPHandler } from "./mcp-handler.ts";
import { WellnessCache } from "./cache/wellness-cache.ts";
import { getWellnessCacheKey } from "./cache/cache-utils.ts";
import { ActivitiesHandler } from "./actions/activities-handler.ts";
import { WellnessHandler } from "./actions/wellness-handler.ts";
import { UCRHandler } from "./actions/ucr-handler.ts";
import { StreamsHandler } from "./actions/streams-handler.ts";
import { authMiddleware } from "./actions/auth-middleware.ts";

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
const mcpHandler = new MCPHandler(intervalsClient);

// Initialize ChatGPT Actions handlers
const activitiesHandler = new ActivitiesHandler(intervalsClient);
const wellnessHandler = new WellnessHandler(intervalsClient);
const ucrHandler = new UCRHandler();
const streamsHandler = new StreamsHandler(intervalsClient);

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

  // ChatGPT Actions manifest endpoint (no auth required)
  if (path === "/.well-known/ai-plugin.json") {
    try {
      const manifestContent = await Deno.readTextFile("./.well-known/ai-plugin.json");
      return new Response(manifestContent, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      warn("Failed to serve ai-plugin.json:", err);
      return new Response(
        JSON.stringify({ error: "Manifest not found" }),
        { 
          status: 404,
          headers: { 
            ...CORS_HEADERS,
            "Content-Type": "application/json" 
          } 
        }
      );
    }
  }
  
  // OpenAPI specification endpoint (no auth required)
  if (path === "/openapi.yaml") {
    try {
      const openapiContent = await Deno.readTextFile("./openapi.yaml");
      return new Response(openapiContent, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/x-yaml"
        }
      });
    } catch (err) {
      warn("Failed to serve openapi.yaml:", err);
      return new Response(
        JSON.stringify({ error: "OpenAPI specification not found" }),
        { 
          status: 404,
          headers: { 
            ...CORS_HEADERS,
            "Content-Type": "application/json" 
          } 
        }
      );
    }
  }
  
  // ChatGPT Actions API endpoints
  if (path.startsWith("/api/v1/")) {
    // Activities endpoints
    if (path === "/api/v1/activities" && req.method === "GET") {
      return authMiddleware(req, (req) => activitiesHandler.getActivities(req));
    }
    
    // Activity streams endpoint
    if (path.match(/^\/api\/v1\/activities\/[^\/]+\/streams$/) && req.method === "GET") {
      return authMiddleware(req, (req) => streamsHandler.getActivityStreams(req));
    }
    
    // Activity intervals endpoint
    if (path.match(/^\/api\/v1\/activities\/[^\/]+\/intervals$/) && req.method === "GET") {
      return authMiddleware(req, (req) => streamsHandler.getActivityIntervals(req));
    }
    
    // Wellness endpoints
    if (path === "/api/v1/wellness" && req.method === "GET") {
      return authMiddleware(req, (req) => wellnessHandler.getWellness(req));
    }
    if (path === "/api/v1/wellness/update" && req.method === "POST") {
      return authMiddleware(req, (req) => wellnessHandler.updateWellness(req));
    }
    
    // UCR endpoint
    if (path === "/api/v1/ucr" && req.method === "GET") {
      return authMiddleware(req, (req) => ucrHandler.getUCR(req));
    }
    
    // API endpoint not found
    return new Response(
      JSON.stringify({ 
        error: "Not Found",
        message: `API endpoint ${path} not found`
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
  
  // Health check endpoint (no auth required)
  if (path === "/health") {
    // Count available MCP tools
    const intervalToolsCount = 5; // get_activities, get_activity, get_wellness, update_wellness, get_athlete_info
    const ucrToolsCount = 7; // get_ucr_assessment, calculate_ucr_trends, update_wellness_assessment, check_ucr_setup, batch_calculate_ucr, get_ucr_components, analyze_ucr_correlations
    const totalToolsCount = intervalToolsCount + ucrToolsCount;
    
    return new Response(
      JSON.stringify({ 
        status: "healthy",
        service: "intervals-mcp-server", 
        version: "1.0.0",
        athlete_id: Deno.env.get("ATHLETE_ID"),
        timestamp: new Date().toISOString(),
        kv_enabled: true,
        cache_enabled: Deno.env.get("CACHE_ENABLED") !== "false",
        mcp_tools: {
          total: totalToolsCount,
          interval_tools: intervalToolsCount,
          ucr_tools: ucrToolsCount
        },
        mcp_timeout_ms: 60000,
        note: "If tools disappear after reload, try removing and re-adding the server in Claude settings"
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
          kv_enabled: true,
          cache_enabled: Deno.env.get("CACHE_ENABLED") !== "false",
          athlete_id: Deno.env.get("ATHLETE_ID"),
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
  
  // TTL test endpoint (no auth required, for testing only)
  if (path === "/test/ttl") {
    try {
      const cache = new WellnessCache();
      const key = getWellnessCacheKey("test123", "2025-01-01");
      const testData = { 
        test: "TTL test data", 
        timestamp: new Date().toISOString() 
      };
      
      // Set with 5 second TTL
      const ttlMs = 5000;
      await cache.set(key, testData, ttlMs);
      
      // Get immediately
      const result1 = await cache.get(key);
      
      // Schedule check after TTL
      setTimeout(async () => {
        const result2 = await cache.get(key);
        info(`TTL test - after ${ttlMs}ms: cached=${result2.cached}`);
      }, ttlMs + 1000);
      
      await cache.close();
      
      return new Response(
        JSON.stringify({ 
          status: "success",
          message: "TTL test initiated",
          initial_get: {
            cached: result1.cached,
            hit: result1.metrics?.cacheHit
          },
          ttl_ms: ttlMs,
          check_after_ms: ttlMs + 1000
        }),
        { 
          headers: { 
            ...CORS_HEADERS, 
            "Content-Type": "application/json" 
          } 
        }
      );
    } catch (err) {
      error("TTL test error:", err);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          error: err instanceof Error ? err.message : String(err)
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

  // Authenticate all MCP endpoints (following Memory MCP pattern exactly)
  if (path === "/" || path.startsWith("/mcp")) {
    info(`[Auth] Authenticating MCP request to ${path}`);
    const authContext = await oauthServer.authenticate(req);
    info(`[Auth] Authentication result: authenticated=${authContext.authenticated}, client_id=${authContext.client_id || 'none'}`);
    
    if (!authContext.authenticated) {
      warn(`[Auth] Authentication failed for ${path}`);
      return createUnauthorizedResponse("Bearer token required");
    }
    info(`[Auth] Authentication successful for ${path}, client: ${authContext.client_id}`);
    
    const sessionId = crypto.randomUUID();
    
    // GET /mcp endpoint for connection status
    if ((path === "/" || path === "/mcp") && req.method === "GET") {
      return new Response(JSON.stringify({
        status: "connected",
        protocolVersion: "2025-06-18",
        sessionId: sessionId
      }), {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
          "mcp-session-id": sessionId
        }
      });
    }
    
    // DELETE /mcp endpoint for session termination
    if ((path === "/" || path === "/mcp") && req.method === "DELETE") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    
    // Main MCP endpoint (POST)
    if ((path === "/" || path === "/mcp") && req.method === "POST") {
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