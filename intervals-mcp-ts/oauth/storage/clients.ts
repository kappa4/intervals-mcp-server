/**
 * OAuth Client Storage for Intervals MCP Server
 * Using Deno KV for persistent storage across deployments
 */

import type { OAuthClient } from "../types.ts";
import { KVStorageBase } from "./kv-base.ts";

export class ClientStorage extends KVStorageBase {
  constructor() {
    super("oauth_clients");
  }

  async store(client: OAuthClient): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey(client.client_id);
    await kv.set(key, client);
  }

  async get(clientId: string): Promise<OAuthClient | null> {
    const kv = await this.getKV();
    const key = this.createKey(clientId);
    const result = await kv.get<OAuthClient>(key);
    return result.value;
  }

  async delete(clientId: string): Promise<void> {
    const kv = await this.getKV();
    const key = this.createKey(clientId);
    await kv.delete(key);
  }

  async list(): Promise<OAuthClient[]> {
    const kv = await this.getKV();
    const prefix = this.createKey();
    const entries = kv.list<OAuthClient>({ prefix });
    
    const clients: OAuthClient[] = [];
    for await (const entry of entries) {
      if (entry.value) {
        clients.push(entry.value);
      }
    }
    return clients;
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