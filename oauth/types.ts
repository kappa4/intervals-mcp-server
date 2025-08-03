/**
 * OAuth 2.1 Type Definitions for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

export interface OAuthClient {
  client_id: string;
  client_secret?: string; // Optional for public clients
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  is_public_client?: boolean; // Added for public client support
  created_at: number;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  expires_at: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  client_id: string;
  expires_at: number;
  scope?: string;
}

export interface RefreshToken {
  token: string;
  client_id: string;
  access_token: string;
  expires_at: number;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export interface ClientRegistrationResponse extends OAuthClient {
  client_id_issued_at: number;
  client_secret_expires_at?: number; // Optional for public clients
}

export interface AuthorizationRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
}

export interface TokenRequest {
  grant_type: "authorization_code" | "refresh_token";
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string; // Optional for public clients
  code_verifier?: string;
  refresh_token?: string;
}

export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}