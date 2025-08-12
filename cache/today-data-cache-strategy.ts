/**
 * 今日のデータ用キャッシュ戦略
 * 
 * 今日のデータは極短TTL、空データはキャッシュしない
 */

import type { 
  ICacheStrategy, 
  CacheContext, 
  CacheResult,
  ICacheStorage 
} from "./cache-strategy-types.ts";
import { 
  isValidWellnessData, 
  includesToday,
  isRecentDate 
} from "./cache-strategy-types.ts";
import { log } from "../logger.ts";

/**
 * 今日のデータに特化したキャッシュ戦略
 */
export class TodayDataCacheStrategy implements ICacheStrategy {
  private cache: Map<string, { value: any; ttl: number; timestamp: number }>;
  private storage?: ICacheStorage;

  constructor(
    cacheOrStorage?: Map<string, any> | ICacheStorage
  ) {
    if (cacheOrStorage && typeof cacheOrStorage === 'object' && 'get' in cacheOrStorage && 'set' in cacheOrStorage) {
      // ICacheStorage
      this.storage = cacheOrStorage as ICacheStorage;
      this.cache = new Map();
    } else if (cacheOrStorage instanceof Map) {
      // Map for testing
      this.cache = cacheOrStorage;
    } else {
      // Default empty Map
      this.cache = new Map();
    }
  }

  async get<T>(key: string): Promise<CacheResult<T>> {
    const startTime = performance.now();
    
    try {
      // ストレージがある場合はそちらを使用
      if (this.storage) {
        const value = await this.storage.get<T>(key);
        if (value) {
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
      } else {
        // テスト用のMapキャッシュ
        const entry = this.cache.get(key);
        if (entry) {
          const now = Date.now();
          if (now - entry.timestamp < entry.ttl) {
            return {
              success: true,
              cached: true,
              data: entry.value,
              metrics: {
                operationTime: performance.now() - startTime,
                cacheHit: true,
                ttl: entry.ttl
              }
            };
          } else {
            // TTL expired
            this.cache.delete(key);
          }
        }
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
      if (this.storage) {
        await this.storage.set(key, value, ttl);
      } else {
        // テスト用のMapキャッシュ
        this.cache.set(key, {
          value,
          ttl,
          timestamp: Date.now()
        });
      }
      
      log("DEBUG", `Cached ${key} with TTL ${ttl}ms`);
    } catch (error) {
      log("ERROR", `Cache set error: ${error}`);
    }
  }

  async delete(key: string): Promise<void> {
    if (this.storage) {
      await this.storage.delete(key);
    } else {
      this.cache.delete(key);
    }
  }

  shouldCache(context: CacheContext): boolean {
    // 空データはキャッシュしない
    // ※isValidDataで詳細チェックするため、ここでは常にtrue
    return true;
  }

  getTTL(context: CacheContext): number {
    // 今日のデータまたは今日を含む範囲
    if (context.isToday || (context.dateRange && includesToday(context.dateRange.start, context.dateRange.end))) {
      return 5000; // 5秒
    }
    
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