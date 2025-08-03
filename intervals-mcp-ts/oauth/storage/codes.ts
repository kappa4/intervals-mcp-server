/**
 * OAuth Authorization Code Storage for Intervals MCP Server
 * Using Deno KV for persistent storage across deployments
 */

import type { AuthorizationCode } from "../types.ts";
import { isExpired, OAUTH_CONFIG } from "../utils.ts";
import { KVStorageBase } from "./kv-base.ts";

export class CodeStorage extends KVStorageBase {
  constructor() {
    super("oauth_codes");
  }

  async store(code: AuthorizationCode): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey(code.code);
    
    // Set with expiration based on code lifetime
    const expireIn = OAUTH_CONFIG.AUTHORIZATION_CODE_LIFETIME * 1000; // Convert to milliseconds
    await kv.set(key, code, { expireIn });
  }

  async get(codeValue: string): Promise<AuthorizationCode | null> {
    const kv = await this.getKV();
    const key = this.createKey(codeValue);
    const result = await kv.get<AuthorizationCode>(key);
    
    if (!result.value) return null;

    const code = result.value;
    
    // Check if expired (additional check, KV should have already expired it)
    if (isExpired(code.expires_at)) {
      await kv.delete(key);
      return null;
    }

    return code;
  }

  async markUsed(codeValue: string): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey(codeValue);
    const result = await kv.get<AuthorizationCode>(key);
    
    if (result.value) {
      const code = result.value;
      code.used = true;
      
      // Re-store with remaining TTL
      const remainingTTL = code.expires_at - Date.now();
      if (remainingTTL > 0) {
        await kv.set(key, code, { expireIn: remainingTTL });
      }
    }
  }

  async delete(codeValue: string): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey(codeValue);
    await kv.delete(key);
  }

  /**
   * Cleanup expired codes
   * Note: Deno KV automatically handles expiration, so this is mostly a no-op
   * Kept for API compatibility
   */
  async cleanupExpired(): Promise<void> {
    // Deno KV handles expiration automatically with expireIn option
    // This method is kept for API compatibility but doesn't need to do anything
  }
}