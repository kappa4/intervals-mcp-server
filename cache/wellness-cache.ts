/**
 * Wellness data cache implementation using Deno KV
 */

import type {
  ICacheManager,
  CacheOperationResult,
  CacheMetrics,
  InvalidationOptions,
  CacheEntry,
  CacheKeyComponents,
} from "./cache-types.ts";
import { CacheError } from "./cache-types.ts";
import { CacheVersionManager } from "./cache-version-manager.ts";
import { 
  getCacheConfig, 
  buildCacheKey, 
  getTTLMilliseconds,
  validateKeySize,
  validateValueSize,
  formatDebugMessage,
  CACHE_KEY_PREFIX,
} from "./cache-config.ts";
import { log } from "../logger.ts";

export class WellnessCache implements ICacheManager {
  private kv: Deno.Kv | null = null;
  private versionManager: CacheVersionManager;
  private config = getCacheConfig();
  
  // Metrics tracking
  private metrics = {
    totalHits: 0,
    totalMisses: 0,
    totalErrors: 0,
    operationTimes: [] as number[],
  };

  constructor() {
    this.versionManager = new CacheVersionManager();
    if (this.config.debug) {
      log("DEBUG", "WellnessCache initialized with config:", this.config);
    }
  }

  /**
   * Initialize KV connection
   */
  private async ensureKvConnection(): Promise<Deno.Kv> {
    if (!this.kv) {
      try {
        this.kv = await Deno.openKv();
        log("INFO", "Deno KV connection established");
      } catch (error) {
        log("ERROR", `Failed to open Deno KV: ${error instanceof Error ? error.message : String(error)}`);
        throw new CacheError(
          "Failed to establish KV connection",
          "KV_ERROR",
          error
        );
      }
    }
    return this.kv;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<CacheOperationResult<T>> {
    const startTime = performance.now();
    
    try {
      if (!this.config.enabled) {
        return {
          success: false,
          cached: false,
          error: "Cache disabled",
        };
      }

      const kv = await this.ensureKvConnection();
      const keyComponents = this.parseKey(key);
      const kvKey = buildCacheKey({
        ...keyComponents,
        version: this.versionManager.getCurrentVersion(),
      });

      if (!validateKeySize(kvKey)) {
        throw new CacheError("Key size exceeds limit", "KEY_INVALID");
      }

      if (this.config.debug) {
        log("DEBUG", formatDebugMessage("GET", kvKey));
      }

      const result = await kv.get<CacheEntry<T>>(kvKey);
      const operationTime = performance.now() - startTime;
      this.recordOperationTime(operationTime);

      if (result.value) {
        this.metrics.totalHits++;
        
        // Version check is handled by key prefixing, so if we got a result, it's valid

        return {
          success: true,
          data: result.value.value,
          cached: true,
          metrics: {
            operationTime,
            cacheHit: true,
          },
        };
      }

      this.metrics.totalMisses++;
      return {
        success: true,
        cached: false,
        metrics: {
          operationTime,
          cacheHit: false,
        },
      };
    } catch (error) {
      this.metrics.totalErrors++;
      log("ERROR", `Cache get error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Set cached value with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<CacheOperationResult<void>> {
    const startTime = performance.now();
    
    try {
      if (!this.config.enabled) {
        return {
          success: false,
          cached: false,
          error: "Cache disabled",
        };
      }

      const kv = await this.ensureKvConnection();
      const keyComponents = this.parseKey(key);
      const kvKey = buildCacheKey({
        ...keyComponents,
        version: this.versionManager.getCurrentVersion(),
      });

      if (!validateKeySize(kvKey)) {
        throw new CacheError("Key size exceeds limit", "KEY_INVALID");
      }

      if (!validateValueSize(value)) {
        throw new CacheError("Value size exceeds limit", "SIZE_LIMIT");
      }

      const cacheEntry: CacheEntry<T> = {
        value,
        cachedAt: new Date().toISOString(),
        version: this.versionManager.getCurrentVersion(),
        ttl,
      };

      // Calculate TTL in milliseconds
      // Note: ttl parameter is already in milliseconds if provided
      const ttlMs = ttl !== undefined ? ttl : getTTLMilliseconds(keyComponents.dataType, this.config);
      
      if (this.config.debug) {
        log("DEBUG", formatDebugMessage("SET", kvKey, { ttl: ttlMs }));
      }

      // Set with expiration
      await kv.set(kvKey, cacheEntry, { expireIn: ttlMs });

      const operationTime = performance.now() - startTime;
      this.recordOperationTime(operationTime);

      return {
        success: true,
        cached: true,
        metrics: {
          operationTime,
          cacheHit: false,
        },
      };
    } catch (error) {
      this.metrics.totalErrors++;
      log("ERROR", `Cache set error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<CacheOperationResult<void>> {
    const startTime = performance.now();
    
    try {
      if (!this.config.enabled) {
        return {
          success: false,
          cached: false,
          error: "Cache disabled",
        };
      }

      const kv = await this.ensureKvConnection();
      const keyComponents = this.parseKey(key);
      const kvKey = buildCacheKey({
        ...keyComponents,
        version: this.versionManager.getCurrentVersion(),
      });

      if (this.config.debug) {
        log("DEBUG", formatDebugMessage("DELETE", kvKey));
      }

      await kv.delete(kvKey);

      const operationTime = performance.now() - startTime;
      this.recordOperationTime(operationTime);

      return {
        success: true,
        cached: false,
        metrics: {
          operationTime,
          cacheHit: false,
        },
      };
    } catch (error) {
      this.metrics.totalErrors++;
      log("ERROR", `Cache delete error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Invalidate cache entries
   */
  async invalidate(options?: InvalidationOptions): Promise<CacheOperationResult<void>> {
    const startTime = performance.now();
    
    try {
      if (!this.config.enabled) {
        return {
          success: false,
          cached: false,
          error: "Cache disabled",
        };
      }

      const kv = await this.ensureKvConnection();
      
      // Basic invalidation - will be enhanced in Phase 4
      if (options?.pattern) {
        log("WARN", "Pattern-based invalidation not yet implemented (Phase 4)");
      }

      if (options?.cascade) {
        log("WARN", "Cascade invalidation not yet implemented (Phase 4)");
      }

      if (options?.olderThan) {
        log("WARN", "Age-based invalidation not yet implemented (Phase 4)");
      }

      // For now, just log the invalidation request
      log("INFO", `Cache invalidation requested with options: ${JSON.stringify(options)}`);

      const operationTime = performance.now() - startTime;
      
      return {
        success: true,
        cached: false,
        metrics: {
          operationTime,
          cacheHit: false,
        },
      };
    } catch (error) {
      this.metrics.totalErrors++;
      log("ERROR", `Cache invalidate error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    const totalRequests = this.metrics.totalHits + this.metrics.totalMisses;
    const totalOperations = totalRequests + this.metrics.totalErrors;
    const avgResponseTime = this.metrics.operationTimes.length > 0
      ? this.metrics.operationTimes.reduce((a, b) => a + b, 0) / this.metrics.operationTimes.length
      : 0;

    return {
      hitRate: totalRequests > 0 ? (this.metrics.totalHits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (this.metrics.totalMisses / totalRequests) * 100 : 0,
      responseTime: avgResponseTime,
      apiCallReduction: totalRequests > 0 ? (this.metrics.totalHits / totalRequests) * 100 : 0,
      errorRate: totalOperations > 0 ? (this.metrics.totalErrors / totalOperations) * 100 : 0,
      totalHits: this.metrics.totalHits,
      totalMisses: this.metrics.totalMisses,
      totalErrors: this.metrics.totalErrors,
    };
  }

  /**
   * Parse cache key string into components
   */
  private parseKey(key: string): CacheKeyComponents {
    // Expected format: "dataType:athleteId:dateRange" or "dataType:athleteId"
    const parts = key.split(":");
    
    if (parts.length < 2) {
      throw new CacheError("Invalid key format", "KEY_INVALID");
    }

    const [dataType, athleteId, ...rest] = parts;
    
    return {
      version: this.versionManager.getCurrentVersion(),
      dataType: dataType as CacheKeyComponents["dataType"],
      athleteId,
      dateRange: rest.length > 0 ? rest[0] : undefined,
      metaKey: dataType === "metadata" ? rest.join(":") : undefined,
    };
  }

  /**
   * Record operation time for metrics
   */
  private recordOperationTime(time: number): void {
    this.metrics.operationTimes.push(time);
    
    // Keep only last 1000 operation times to prevent memory growth
    if (this.metrics.operationTimes.length > 1000) {
      this.metrics.operationTimes = this.metrics.operationTimes.slice(-1000);
    }
  }

  /**
   * Close KV connection
   */
  async close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
      log("INFO", "Deno KV connection closed");
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = {
      totalHits: 0,
      totalMisses: 0,
      totalErrors: 0,
      operationTimes: [],
    };
    log("INFO", "Cache metrics cleared");
  }
}