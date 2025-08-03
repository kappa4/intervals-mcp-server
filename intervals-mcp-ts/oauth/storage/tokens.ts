/**
 * OAuth Token Storage for Intervals MCP Server
 * Using Deno KV for persistent storage across deployments
 */

import type { AccessToken, RefreshToken } from "../types.ts";
import { isExpired, OAUTH_CONFIG } from "../utils.ts";
import { KVStorageBase } from "./kv-base.ts";

export class TokenStorage extends KVStorageBase {
  constructor() {
    super("oauth_tokens");
  }

  async storeAccessToken(token: AccessToken): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey("access", token.token);
    
    // Set with expiration based on token lifetime
    const expireIn = OAUTH_CONFIG.ACCESS_TOKEN_LIFETIME * 1000; // Convert to milliseconds
    await kv.set(key, token, { expireIn });
  }

  async getAccessToken(tokenValue: string): Promise<AccessToken | null> {
    const kv = await this.getKV();
    const key = this.createKey("access", tokenValue);
    const result = await kv.get<AccessToken>(key);
    
    if (!result.value) return null;

    const token = result.value;
    
    // Check if expired (additional check, KV should have already expired it)
    if (isExpired(token.expires_at)) {
      await kv.delete(key);
      return null;
    }

    return token;
  }

  async deleteAccessToken(tokenValue: string): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey("access", tokenValue);
    await kv.delete(key);
  }

  async storeRefreshToken(token: RefreshToken): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey("refresh", token.token);
    
    // Set with expiration based on refresh token lifetime
    const expireIn = OAUTH_CONFIG.REFRESH_TOKEN_LIFETIME * 1000; // Convert to milliseconds
    await kv.set(key, token, { expireIn });
  }

  async getRefreshToken(tokenValue: string): Promise<RefreshToken | null> {
    const kv = await this.getKV();
    const key = this.createKey("refresh", tokenValue);
    const result = await kv.get<RefreshToken>(key);
    
    if (!result.value) return null;

    const token = result.value;
    
    // Check if expired (additional check, KV should have already expired it)
    if (isExpired(token.expires_at)) {
      await kv.delete(key);
      return null;
    }

    return token;
  }

  async deleteRefreshToken(tokenValue: string): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey("refresh", tokenValue);
    await kv.delete(key);
  }

  /**
   * Delete all tokens for a specific client
   */
  async deleteClientTokens(clientId: string): Promise<void> {
    const kv = await this.getKV();
    
    // Delete access tokens
    const accessPrefix = this.createKey("access");
    const accessEntries = kv.list<AccessToken>({ prefix: accessPrefix });
    
    for await (const entry of accessEntries) {
      if (entry.value && entry.value.client_id === clientId) {
        await kv.delete(entry.key);
      }
    }

    // Delete refresh tokens
    const refreshPrefix = this.createKey("refresh");
    const refreshEntries = kv.list<RefreshToken>({ prefix: refreshPrefix });
    
    for await (const entry of refreshEntries) {
      if (entry.value && entry.value.client_id === clientId) {
        await kv.delete(entry.key);
      }
    }
  }

  /**
   * Cleanup expired tokens
   * Note: Deno KV automatically handles expiration, so this is mostly a no-op
   * Kept for API compatibility
   */
  async cleanupExpired(): Promise<void> {
    // Deno KV handles expiration automatically with expireIn option
    // This method is kept for API compatibility but doesn't need to do anything
  }
}