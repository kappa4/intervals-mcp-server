/**
 * OAuth Authorization Endpoint Handler for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import type { 
  AuthorizationRequest,
  AuthorizationCode,
  OAuthError 
} from "../types.ts";
import { ClientStorage } from "../storage/clients.ts";
import { CodeStorage } from "../storage/codes.ts";
import { 
  generateAuthorizationCode, 
  validateRedirectUri, 
  calculateExpiration,
  OAUTH_CONFIG 
} from "../utils.ts";
import { log, info, warn, error } from "../../logger.ts";

export function createAuthorizationHandler(
  clientStorage: ClientStorage,
  codeStorage: CodeStorage
) {
  return async function handleAuthorization(req: Request): Promise<Response> {
    info("[OAuth] Authorization request received");
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      warn("[OAuth] Invalid method for authorization, expected GET");
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      const url = new URL(req.url);
      const params = url.searchParams;

      // Parse authorization request
      const authRequest: AuthorizationRequest = {
        response_type: params.get("response_type") || "",
        client_id: params.get("client_id") || "",
        redirect_uri: params.get("redirect_uri") || "",
        state: params.get("state") || undefined,
        code_challenge: params.get("code_challenge") || "",
        code_challenge_method: params.get("code_challenge_method") || "",
        scope: params.get("scope") || undefined,
      };

      log("[OAuth] Authorization request:", JSON.stringify(authRequest, null, 2));

      // Validate response_type
      if (authRequest.response_type !== "code") {
        const errorParams = new URLSearchParams({
          error: "unsupported_response_type",
          error_description: "Only 'code' response type is supported",
        });
        if (authRequest.state) errorParams.set("state", authRequest.state);
        
        return Response.redirect(`${authRequest.redirect_uri}?${errorParams}`, 302);
      }

      // Validate client
      const client = await clientStorage.get(authRequest.client_id);
      if (!client) {
        warn(`[OAuth] Client not found: ${authRequest.client_id}`);
        
        // Log all registered clients for debugging
        const allClients = await clientStorage.list();
        log("[OAuth] Registered clients:", allClients.map(c => ({ id: c.client_id, name: c.client_name })));
        
        const errorParams = new URLSearchParams({
          error: "invalid_client", 
          error_description: "Client not found",
        });
        if (authRequest.state) errorParams.set("state", authRequest.state);
        
        // Make sure redirect_uri is valid before redirecting
        if (!authRequest.redirect_uri) {
          warn("[OAuth] No redirect_uri provided with invalid_client error");
          return new Response(JSON.stringify({
            error: "invalid_client",
            error_description: "Client not found and no redirect_uri provided"
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        return Response.redirect(`${authRequest.redirect_uri}?${errorParams}`, 302);
      }

      // Validate redirect URI
      if (!validateRedirectUri(authRequest.redirect_uri, client.redirect_uris)) {
        const oauthError: OAuthError = {
          error: "invalid_redirect_uri",
          error_description: "Redirect URI not registered for this client",
        };
        return new Response(JSON.stringify(oauthError), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate PKCE (required for public clients)
      if (!authRequest.code_challenge || authRequest.code_challenge_method !== "S256") {
        const errorParams = new URLSearchParams({
          error: "invalid_request",
          error_description: "PKCE code_challenge with S256 method is required",
        });
        if (authRequest.state) errorParams.set("state", authRequest.state);
        
        return Response.redirect(`${authRequest.redirect_uri}?${errorParams}`, 302);
      }

      // Generate authorization code
      const code = generateAuthorizationCode();
      const authCode: AuthorizationCode = {
        code,
        client_id: authRequest.client_id,
        redirect_uri: authRequest.redirect_uri,
        code_challenge: authRequest.code_challenge,
        code_challenge_method: authRequest.code_challenge_method,
        state: authRequest.state,
        expires_at: calculateExpiration(OAUTH_CONFIG.AUTHORIZATION_CODE_LIFETIME),
        used: false,
      };

      // Store authorization code
      await codeStorage.store(authCode);

      info(`[OAuth] Authorization code generated for client: ${client.client_name}`);

      // Redirect back to client with authorization code
      const successParams = new URLSearchParams({
        code,
      });
      if (authRequest.state) successParams.set("state", authRequest.state);

      return Response.redirect(`${authRequest.redirect_uri}?${successParams}`, 302);

    } catch (err) {
      error("[OAuth] Authorization error:", err);
      const oauthError: OAuthError = {
        error: "server_error",
        error_description: "Internal server error",
      };
      return new Response(JSON.stringify(oauthError), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}