/**
 * Dynamic Client Registration Handler for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import type { 
  ClientRegistrationRequest, 
  ClientRegistrationResponse,
  OAuthClient,
  OAuthError 
} from "../types.ts";
import { ClientStorage } from "../storage/clients.ts";
import { generateClientCredentials, CLAUDE_ALLOWED_REDIRECT_URIS } from "../utils.ts";
import { log, info, warn, error } from "../../logger.ts";

export function createRegistrationHandler(clientStorage: ClientStorage) {
  return async function handleRegistration(req: Request): Promise<Response> {
    info("[OAuth] Client registration request received");
    log("[OAuth] Method:", req.method);
    log("[OAuth] Content-Type:", req.headers.get("Content-Type"));
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      log("[OAuth] Responding to OPTIONS preflight");
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      warn("[OAuth] Invalid method, expected POST");
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      const body: ClientRegistrationRequest = await req.json();
      info("[OAuth] Registration request:", JSON.stringify(body, null, 2));

      // Validate redirect URIs
      if (!body.redirect_uris || body.redirect_uris.length === 0) {
        const errorResponse: OAuthError = {
          error: "invalid_request",
          error_description: "redirect_uris is required",
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filter allowed redirect URIs
      const validRedirectUris = body.redirect_uris.filter(uri => 
        CLAUDE_ALLOWED_REDIRECT_URIS.includes(uri)
      );

      if (validRedirectUris.length === 0) {
        const errorResponse: OAuthError = {
          error: "invalid_redirect_uri",
          error_description: "No valid redirect URIs provided. Allowed URIs: " + 
            CLAUDE_ALLOWED_REDIRECT_URIS.join(", "),
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if this is a public client
      const isPublicClient = body.token_endpoint_auth_method === "none";
      
      // Generate client credentials
      const { client_id, client_secret } = isPublicClient 
        ? { client_id: generateClientCredentials().client_id, client_secret: undefined }
        : generateClientCredentials();

      // Create client
      const client: OAuthClient = {
        client_id,
        client_secret,
        client_name: body.client_name || "Unknown",
        redirect_uris: validRedirectUris,
        grant_types: body.grant_types || ["authorization_code", "refresh_token"],
        response_types: body.response_types || ["code"],
        token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
        is_public_client: isPublicClient,
        created_at: Date.now(),
      };

      // Store client
      await clientStorage.store(client);

      // Log registration for debugging
      info(`[OAuth] Client registered: ${client.client_name} (${client.client_id})`);
      info(`[OAuth] Client type: ${isPublicClient ? 'public' : 'confidential'} (auth method: ${client.token_endpoint_auth_method})`);

      // Create response
      const response: ClientRegistrationResponse = {
        ...client,
        client_id_issued_at: Math.floor(client.created_at / 1000),
        client_secret_expires_at: isPublicClient ? undefined : 0, // Never expires for confidential clients
      };

      return new Response(JSON.stringify(response), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      error("[OAuth] Registration error:", err);
      const errorResponse: OAuthError = {
        error: "server_error",
        error_description: "Internal server error",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}