/**
 * OAuth Bearer Token Authentication Middleware for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import { TokenStorage } from "./storage/tokens.ts";
import { log, info, warn } from "../logger.ts";

export interface AuthContext {
  authenticated: boolean;
  client_id?: string;
  token?: string;
}

export function createAuthMiddleware(tokenStorage: TokenStorage) {
  return async function authenticate(req: Request): Promise<AuthContext> {
    const authHeader = req.headers.get("Authorization");
    log("DEBUG", "[Auth] Authorization header:", authHeader ? "Bearer ***" : "None");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      log("DEBUG", "[Auth] No Bearer token found");
      return { authenticated: false };
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    log("DEBUG", "[Auth] Extracted token (first 20 chars):", token.substring(0, 20) + "...");
    
    // Validate token
    const accessToken = await tokenStorage.getAccessToken(token);
    log("DEBUG", "[Auth] Token lookup result:", accessToken ? "Found" : "Not found");
    
    if (!accessToken) {
      warn("[Auth] Token validation failed - token not found in storage");
      return { authenticated: false };
    }

    info("[Auth] Token validation successful for client:", accessToken.client_id);
    return {
      authenticated: true,
      client_id: accessToken.client_id,
      token: accessToken.token,
    };
  };
}

/**
 * Create WWW-Authenticate header for 401 responses
 */
export function createWWWAuthenticateHeader(realm: string = "Intervals MCP Server"): string {
  return `Bearer realm="${realm}"`;
}

/**
 * Create unauthorized response
 */
export function createUnauthorizedResponse(
  message: string = "Unauthorized",
  includeWWWAuthenticate: boolean = true
): Response {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, Accept",
  };

  if (includeWWWAuthenticate) {
    headers["WWW-Authenticate"] = createWWWAuthenticateHeader();
  }

  return new Response(
    JSON.stringify({
      error: "unauthorized",
      error_description: message,
    }),
    {
      status: 401,
      headers,
    }
  );
}