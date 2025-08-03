/**
 * OAuth Token Storage for Intervals MCP Server
 * Using in-memory storage for now (suitable for single-instance deployment)
 */

import type { AccessToken, RefreshToken } from "../types.ts";
import { isExpired } from "../utils.ts";

export class TokenStorage {
  private accessTokens = new Map<string, AccessToken>();
  private refreshTokens = new Map<string, RefreshToken>();

  constructor() {
    // In-memory storage for demo
    // Production would use Deno KV or external storage
  }

  async storeAccessToken(token: AccessToken): Promise<void> {
    this.accessTokens.set(token.token, token);
  }

  async getAccessToken(tokenValue: string): Promise<AccessToken | null> {
    const token = this.accessTokens.get(tokenValue);
    if (!token) return null;

    // Check if expired
    if (isExpired(token.expires_at)) {
      this.accessTokens.delete(tokenValue);
      return null;
    }

    return token;
  }

  async deleteAccessToken(tokenValue: string): Promise<void> {
    this.accessTokens.delete(tokenValue);
  }

  async storeRefreshToken(token: RefreshToken): Promise<void> {
    this.refreshTokens.set(token.token, token);
  }

  async getRefreshToken(tokenValue: string): Promise<RefreshToken | null> {
    const token = this.refreshTokens.get(tokenValue);
    if (!token) return null;

    // Check if expired
    if (isExpired(token.expires_at)) {
      this.refreshTokens.delete(tokenValue);
      return null;
    }

    return token;
  }

  async deleteRefreshToken(tokenValue: string): Promise<void> {
    this.refreshTokens.delete(tokenValue);
  }

  /**
   * Delete all tokens for a specific client
   */
  async deleteClientTokens(clientId: string): Promise<void> {
    // Delete access tokens
    const accessTokensToDelete: string[] = [];
    for (const [tokenValue, token] of this.accessTokens) {
      if (token.client_id === clientId) {
        accessTokensToDelete.push(tokenValue);
      }
    }
    for (const tokenValue of accessTokensToDelete) {
      this.accessTokens.delete(tokenValue);
    }

    // Delete refresh tokens
    const refreshTokensToDelete: string[] = [];
    for (const [tokenValue, token] of this.refreshTokens) {
      if (token.client_id === clientId) {
        refreshTokensToDelete.push(tokenValue);
      }
    }
    for (const tokenValue of refreshTokensToDelete) {
      this.refreshTokens.delete(tokenValue);
    }
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpired(): Promise<void> {
    const now = Date.now();

    // Cleanup access tokens
    const expiredAccessTokens: string[] = [];
    for (const [tokenValue, token] of this.accessTokens) {
      if (isExpired(token.expires_at)) {
        expiredAccessTokens.push(tokenValue);
      }
    }
    for (const tokenValue of expiredAccessTokens) {
      this.accessTokens.delete(tokenValue);
    }

    // Cleanup refresh tokens
    const expiredRefreshTokens: string[] = [];
    for (const [tokenValue, token] of this.refreshTokens) {
      if (isExpired(token.expires_at)) {
        expiredRefreshTokens.push(tokenValue);
      }
    }
    for (const tokenValue of expiredRefreshTokens) {
      this.refreshTokens.delete(tokenValue);
    }
  }
}