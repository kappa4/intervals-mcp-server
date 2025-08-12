/**
 * デフォルトキャッシュストラテジー
 * 
 * 従来のキャッシュ動作を維持する標準実装
 */

import type { 
  ICacheStrategy, 
  CacheContext, 
  CacheResult,
  ICacheStorage 
} from "./cache-strategy-types.ts";
import { 
  isValidWellnessData,
  isRecentDate 
} from "./cache-strategy-types.ts";
import { log } from "../logger.ts";

/**
 * デフォルトのキャッシュストラテジー
 * 過去データは長期キャッシュ、最近のデータは短期キャッシュ
 */
export class DefaultCacheStrategy implements ICacheStrategy {
  private storage: ICacheStorage;

  constructor(storage?: ICacheStorage) {
    // 実際のストレージ実装が必要
    this.storage = storage || createDefaultStorage();
  }

  async get<T>(key: string): Promise<CacheResult<T>> {
    const startTime = performance.now();
    
    try {
      const value = await this.storage.get<T>(key);
      
      if (value !== null) {
        return {
          success: true,
          cached: true,
          data: value,
          metrics: {
            operationTime: performance.now() - startTime,
            cacheHit: true
          }
        };
      }
      
      return {
        success: true,
        cached: false,
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false
        }
      };
    } catch (error) {
      log("ERROR", `Cache get error: ${error}`);
      return {
        success: false,
        cached: false,
        error: String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false
        }
      };
    }
  }

  async set<T>(key: string, value: T, context: CacheContext): Promise<void> {
    // データ検証
    if (!this.isValidData(value, context)) {
      log("DEBUG", `Skipping cache for invalid data: ${key}`);
      return;
    }

    // キャッシュすべきか判定
    if (!this.shouldCache(context)) {
      log("DEBUG", `Skipping cache based on context: ${key}`);
      return;
    }

    const ttl = this.getTTL(context);
    
    try {
      await this.storage.set(key, value, ttl);
      log("DEBUG", `Cached ${key} with TTL ${ttl}ms`);
    } catch (error) {
      log("ERROR", `Cache set error: ${error}`);
    }
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  shouldCache(context: CacheContext): boolean {
    // デフォルトでは全てキャッシュ（ただしisValidDataでフィルタ）
    return true;
  }

  getTTL(context: CacheContext): number {
    // 最近のデータ（7日以内）
    if (context.isRecent || (context.dateRange && isRecentDate(context.dateRange.end))) {
      return 3600000; // 1時間
    }
    
    // 古いデータ
    return 86400000; // 24時間
  }

  isValidData(data: any, context: CacheContext): boolean {
    // 空データのチェック
    if (!data) {
      return false;
    }

    // ウェルネスデータの場合
    if (context.dataType === "wellness") {
      return isValidWellnessData(data);
    }

    // その他のデータタイプ
    if (Array.isArray(data)) {
      return data.length > 0;
    }

    return true;
  }
}

/**
 * デフォルトストレージの作成（Deno KVラッパー）
 */
function createDefaultStorage(): ICacheStorage {
  let kv: Deno.Kv | null = null;

  const ensureKv = async () => {
    if (!kv) {
      kv = await Deno.openKv();
    }
    return kv;
  };

  return {
    async get<T>(key: string): Promise<T | null> {
      const kvInstance = await ensureKv();
      const result = await kvInstance.get<T>([key]);
      return result.value;
    },

    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      const kvInstance = await ensureKv();
      await kvInstance.set([key], value, { expireIn: ttlMs });
    },

    async delete(key: string): Promise<void> {
      const kvInstance = await ensureKv();
      await kvInstance.delete([key]);
    },

    async clear(): Promise<void> {
      const kvInstance = await ensureKv();
      // Deno KVには一括削除がないため、実装が必要
      log("WARN", "Clear operation not fully implemented for Deno KV");
    },

    async has(key: string): Promise<boolean> {
      const kvInstance = await ensureKv();
      const result = await kvInstance.get([key]);
      return result.value !== null;
    }
  };
}