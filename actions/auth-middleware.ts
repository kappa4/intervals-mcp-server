/**
 * ChatGPT Actions - Authentication Middleware
 * Handles API key authentication for ChatGPT Actions endpoints
 */

import { log, debug, warn } from "../logger.ts";

/**
 * Validate API key from request headers
 */
export function validateApiKey(req: Request): boolean {
  const apiKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("API_KEY");
  
  if (!apiKey) {
    debug("No API key provided in request");
    return false;
  }
  
  if (!expectedKey) {
    warn("API_KEY environment variable not set");
    return false;
  }
  
  return apiKey === expectedKey;
}

/**
 * Authentication middleware for ChatGPT Actions
 */
export async function authMiddleware(
  req: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  // Allow OPTIONS requests without authentication (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders()
    });
  }
  
  // Validate API key
  if (!validateApiKey(req)) {
    log("WARN", `Unauthorized access attempt from ${req.headers.get("X-Forwarded-For") || "unknown"}`);
    return new Response(
      JSON.stringify({ 
        error: "Unauthorized",
        message: "Invalid or missing API key. Please provide a valid X-API-Key header."
      }),
      {
        status: 401,
        headers: {
          ...getCorsHeaders(),
          "Content-Type": "application/json"
        }
      }
    );
  }
  
  try {
    // Process the request
    const response = await handler(req);
    
    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    Object.entries(getCorsHeaders()).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    warn(`Error processing request: ${error}`);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "An error occurred while processing your request"
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(),
          "Content-Type": "application/json"
        }
      }
    );
  }
}

/**
 * Get CORS headers for ChatGPT Actions
 */
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*", // ChatGPT needs this
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, x-api-key",
    "Access-Control-Max-Age": "86400" // 24 hours
  };
}