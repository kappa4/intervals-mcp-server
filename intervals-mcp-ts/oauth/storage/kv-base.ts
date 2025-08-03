/**
 * Base class for Deno KV storage
 * Provides common functionality for all storage classes
 */

export abstract class KVStorageBase {
  protected kv: Deno.Kv | null = null;
  protected namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  /**
   * Initialize KV connection
   * In Deno Deploy, this automatically connects to the managed KV service
   * In local development, creates a local KV database
   */
  protected async initKV(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  /**
   * Get KV instance, initializing if needed
   */
  protected async getKV(): Promise<Deno.Kv> {
    if (!this.kv) {
      return await this.initKV();
    }
    return this.kv;
  }

  /**
   * Create a namespaced key
   */
  protected createKey(...parts: string[]): string[] {
    return [this.namespace, ...parts];
  }

  /**
   * Close KV connection (for cleanup)
   */
  async close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
  }
}