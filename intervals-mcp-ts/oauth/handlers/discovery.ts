/**
 * OAuth Discovery Endpoint Handler for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import type { AuthorizationServerMetadata } from "../types.ts";
import { log, info } from "../../logger.ts";

export function createDiscoveryHandler(origin: string) {
  return async function handleDiscovery(req: Request): Promise<Response> {
    info("[OAuth] Discovery endpoint requested");
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders 
      });
    }

    const metadata: AuthorizationServerMetadata = {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    };

    log("[OAuth] Returning discovery metadata:", JSON.stringify(metadata, null, 2));

    return new Response(JSON.stringify(metadata), {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json" 
      },
    });
  };
}

/**
 * Protected Resource Discovery Handler
 */
export function createProtectedResourceHandler(origin: string) {
  return async function handleProtectedResource(req: Request): Promise<Response> {
    info("[OAuth] Protected resource discovery requested");
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders 
      });
    }

    const metadata = {
      resource: origin,
      authorization_servers: [origin],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/docs`,
    };

    return new Response(JSON.stringify(metadata), {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json" 
      },
    });
  };
}