/**
 * OAuth Token Endpoint Handler for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import type { 
  TokenRequest,
  TokenResponse,
  AccessToken,
  RefreshToken,
  OAuthError 
} from "../types.ts";
import { ClientStorage } from "../storage/clients.ts";
import { CodeStorage } from "../storage/codes.ts";
import { TokenStorage } from "../storage/tokens.ts";
import { 
  generateAccessToken, 
  generateRefreshToken,
  verifyCodeChallenge,
  calculateExpiration,
  OAUTH_CONFIG 
} from "../utils.ts";
import { log, info, warn, error } from "../../logger.ts";

export function createTokenHandler(
  clientStorage: ClientStorage,
  codeStorage: CodeStorage,
  tokenStorage: TokenStorage
) {
  return async function handleToken(req: Request): Promise<Response> {
    info("[OAuth] Token request received");
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      warn("[OAuth] Invalid method for token endpoint, expected POST");
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      // Parse request body
      let tokenRequest: TokenRequest;
      
      const contentType = req.headers.get("Content-Type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        tokenRequest = {
          grant_type: formData.get("grant_type") as "authorization_code" | "refresh_token",
          code: formData.get("code") as string | undefined,
          redirect_uri: formData.get("redirect_uri") as string | undefined,
          client_id: formData.get("client_id") as string,
          client_secret: formData.get("client_secret") as string | undefined,
          code_verifier: formData.get("code_verifier") as string | undefined,
          refresh_token: formData.get("refresh_token") as string | undefined,
        };
      } else {
        tokenRequest = await req.json();
      }

      log("DEBUG", "[OAuth] Token request:", JSON.stringify({ ...tokenRequest, client_secret: tokenRequest.client_secret ? "***" : undefined }, null, 2));

      // Validate grant type
      if (!["authorization_code", "refresh_token"].includes(tokenRequest.grant_type)) {
        const errorResponse: OAuthError = {
          error: "unsupported_grant_type",
          error_description: "Grant type must be 'authorization_code' or 'refresh_token'",
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate client
      const client = await clientStorage.validateCredentials(
        tokenRequest.client_id,
        tokenRequest.client_secret
      );
      
      if (!client) {
        const errorResponse: OAuthError = {
          error: "invalid_client",
          error_description: "Client authentication failed",
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRequest.grant_type === "authorization_code") {
        return handleAuthorizationCodeGrant(
          tokenRequest, 
          client, 
          codeStorage, 
          tokenStorage, 
          corsHeaders
        );
      } else {
        return handleRefreshTokenGrant(
          tokenRequest, 
          client, 
          tokenStorage, 
          corsHeaders
        );
      }

    } catch (err) {
      error("[OAuth] Token endpoint error:", err);
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

async function handleAuthorizationCodeGrant(
  tokenRequest: TokenRequest,
  client: any,
  codeStorage: CodeStorage,
  tokenStorage: TokenStorage,
  corsHeaders: Record<string, string>
): Promise<Response> {
  info("[OAuth] Processing authorization code grant");

  // Validate required fields
  if (!tokenRequest.code || !tokenRequest.redirect_uri || !tokenRequest.code_verifier) {
    const errorResponse: OAuthError = {
      error: "invalid_request",
      error_description: "Missing required parameters: code, redirect_uri, code_verifier",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get and validate authorization code
  const authCode = await codeStorage.get(tokenRequest.code);
  if (!authCode || authCode.used) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "Authorization code is invalid or has been used",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate client matches
  if (authCode.client_id !== client.client_id) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "Authorization code was not issued to this client",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate redirect URI matches
  if (authCode.redirect_uri !== tokenRequest.redirect_uri) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "Redirect URI does not match authorization request",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify PKCE
  const isValidPKCE = await verifyCodeChallenge(
    tokenRequest.code_verifier,
    authCode.code_challenge,
    authCode.code_challenge_method
  );

  if (!isValidPKCE) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark code as used
  await codeStorage.markUsed(authCode.code);

  // Generate tokens
  const accessTokenValue = generateAccessToken();
  const refreshTokenValue = generateRefreshToken();

  const accessToken: AccessToken = {
    token: accessTokenValue,
    client_id: client.client_id,
    expires_at: calculateExpiration(OAUTH_CONFIG.ACCESS_TOKEN_LIFETIME),
    scope: authCode.state, // Use state as scope for simplicity
  };

  const refreshToken: RefreshToken = {
    token: refreshTokenValue,
    client_id: client.client_id,
    access_token: accessTokenValue,
    expires_at: calculateExpiration(OAUTH_CONFIG.REFRESH_TOKEN_LIFETIME),
    scope: authCode.state,
  };

  // Store tokens
  await tokenStorage.storeAccessToken(accessToken);
  await tokenStorage.storeRefreshToken(refreshToken);

  info(`[OAuth] Tokens generated for client: ${client.client_name}`);

  // Create response
  const tokenResponse: TokenResponse = {
    access_token: accessTokenValue,
    token_type: "Bearer",
    expires_in: OAUTH_CONFIG.ACCESS_TOKEN_LIFETIME,
    refresh_token: refreshTokenValue,
    scope: accessToken.scope,
  };

  return new Response(JSON.stringify(tokenResponse), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleRefreshTokenGrant(
  tokenRequest: TokenRequest,
  client: any,
  tokenStorage: TokenStorage,
  corsHeaders: Record<string, string>
): Promise<Response> {
  info("[OAuth] Processing refresh token grant");

  if (!tokenRequest.refresh_token) {
    const errorResponse: OAuthError = {
      error: "invalid_request",
      error_description: "Missing refresh_token parameter",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get refresh token
  const refreshToken = await tokenStorage.getRefreshToken(tokenRequest.refresh_token);
  if (!refreshToken) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "Refresh token is invalid or expired",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate client matches
  if (refreshToken.client_id !== client.client_id) {
    const errorResponse: OAuthError = {
      error: "invalid_grant",
      error_description: "Refresh token was not issued to this client",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Revoke old access token
  await tokenStorage.deleteAccessToken(refreshToken.access_token);

  // Generate new access token
  const newAccessTokenValue = generateAccessToken();
  const newAccessToken: AccessToken = {
    token: newAccessTokenValue,
    client_id: client.client_id,
    expires_at: calculateExpiration(OAUTH_CONFIG.ACCESS_TOKEN_LIFETIME),
    scope: refreshToken.scope,
  };

  // Update refresh token with new access token
  refreshToken.access_token = newAccessTokenValue;
  await tokenStorage.storeRefreshToken(refreshToken);
  await tokenStorage.storeAccessToken(newAccessToken);

  info(`[OAuth] Access token refreshed for client: ${client.client_name}`);

  // Create response
  const tokenResponse: TokenResponse = {
    access_token: newAccessTokenValue,
    token_type: "Bearer",
    expires_in: OAUTH_CONFIG.ACCESS_TOKEN_LIFETIME,
    refresh_token: tokenRequest.refresh_token, // Same refresh token
    scope: newAccessToken.scope,
  };

  return new Response(JSON.stringify(tokenResponse), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}