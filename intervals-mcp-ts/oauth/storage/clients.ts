/**
 * OAuth Client Storage for Intervals MCP Server
 * Using in-memory storage for now (suitable for single-instance deployment)
 */

import type { OAuthClient } from "../types.ts";

export class ClientStorage {
  private clients = new Map<string, OAuthClient>();

  constructor() {
    // In-memory storage for demo
    // Production would use Deno KV or external storage
  }

  async store(client: OAuthClient): Promise<void> {
    this.clients.set(client.client_id, client);
  }

  async get(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) || null;
  }

  async delete(clientId: string): Promise<void> {
    this.clients.delete(clientId);
  }

  async list(): Promise<OAuthClient[]> {
    return Array.from(this.clients.values());
  }

  /**
   * Validate client credentials
   */
  async validateCredentials(clientId: string, clientSecret?: string): Promise<OAuthClient | null> {
    const client = await this.get(clientId);
    if (!client) return null;

    // Public clients don't require secret
    if (client.is_public_client && client.token_endpoint_auth_method === "none") {
      return client;
    }

    // Confidential clients require secret
    if (client.client_secret && client.client_secret === clientSecret) {
      return client;
    }

    return null;
  }

  /**
   * Cleanup expired clients (if needed)
   */
  async cleanup(): Promise<void> {
    // For in-memory storage, no cleanup needed
    // In production, this would clean up old/expired clients
  }
}