/**
 * OAuth Authorization Code Storage for Intervals MCP Server
 * Using in-memory storage for now (suitable for single-instance deployment)
 */

import type { AuthorizationCode } from "../types.ts";
import { isExpired } from "../utils.ts";

export class CodeStorage {
  private codes = new Map<string, AuthorizationCode>();

  constructor() {
    // In-memory storage for demo
    // Production would use Deno KV or external storage
  }

  async store(code: AuthorizationCode): Promise<void> {
    this.codes.set(code.code, code);
  }

  async get(codeValue: string): Promise<AuthorizationCode | null> {
    const code = this.codes.get(codeValue);
    if (!code) return null;

    // Check if expired
    if (isExpired(code.expires_at)) {
      this.codes.delete(codeValue);
      return null;
    }

    return code;
  }

  async markUsed(codeValue: string): Promise<void> {
    const code = this.codes.get(codeValue);
    if (code) {
      code.used = true;
      this.codes.set(codeValue, code);
    }
  }

  async delete(codeValue: string): Promise<void> {
    this.codes.delete(codeValue);
  }

  /**
   * Cleanup expired codes
   */
  async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const expiredCodes: string[] = [];

    for (const [codeValue, code] of this.codes) {
      if (isExpired(code.expires_at)) {
        expiredCodes.push(codeValue);
      }
    }

    for (const codeValue of expiredCodes) {
      this.codes.delete(codeValue);
    }
  }
}