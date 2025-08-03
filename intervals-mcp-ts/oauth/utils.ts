/**
 * OAuth 2.1 Utilities for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import { encode } from "https://deno.land/std@0.208.0/encoding/base64url.ts";

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return encode(bytes);
}

/**
 * Generate client credentials
 */
export function generateClientCredentials(): { client_id: string; client_secret: string } {
  return {
    client_id: generateRandomString(16),
    client_secret: generateRandomString(32),
  };
}

/**
 * Generate authorization code
 */
export function generateAuthorizationCode(): string {
  return generateRandomString(32);
}

/**
 * Generate access token
 */
export function generateAccessToken(): string {
  return generateRandomString(32);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(): string {
  return generateRandomString(32);
}

/**
 * Verify PKCE code challenge
 * @param codeVerifier The code verifier sent by the client
 * @param codeChallenge The code challenge stored with the authorization code
 * @param method The challenge method (S256)
 */
export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): Promise<boolean> {
  if (method !== "S256") {
    return false;
  }

  // Calculate SHA256 of the code verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  
  // Base64url encode the hash
  const calculatedChallenge = encode(new Uint8Array(hash));
  
  return calculatedChallenge === codeChallenge;
}

/**
 * Calculate token expiration time
 * @param lifetimeSeconds Token lifetime in seconds
 */
export function calculateExpiration(lifetimeSeconds: number): number {
  return Date.now() + (lifetimeSeconds * 1000);
}

/**
 * Check if a timestamp has expired
 */
export function isExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

/**
 * Validate redirect URI
 */
export function validateRedirectUri(uri: string, allowedUris: string[]): boolean {
  return allowedUris.includes(uri);
}

/**
 * Claude Web specific allowed redirect URIs
 */
export const CLAUDE_ALLOWED_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

/**
 * OAuth configuration
 */
export const OAUTH_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 3600,        // 1 hour
  REFRESH_TOKEN_LIFETIME: 2592000,    // 30 days
  AUTHORIZATION_CODE_LIFETIME: 600,   // 10 minutes
};