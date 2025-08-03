/**
 * Cache system type definitions for wellness data caching
 */

/**
 * Cache key components for type-safe key generation
 */
export interface CacheKeyComponents {
  version: string;
  dataType: 'wellness' | 'activities' | 'athlete' | 'metadata';
  athleteId: string;
  dateRange?: string;
  metaKey?: string;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = unknown> {
  value: T;
  cachedAt: string; // ISO timestamp
  version: string;
  ttl?: number; // milliseconds
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  enabled: boolean;
  ttlWellness: number; // seconds
  ttlActivities: number; // seconds
  ttlAthlete: number; // seconds
  ttlMetadata: number; // seconds
  debug: boolean;
  version: string;
  versionStrategy: 'auto' | 'manual' | 'fixed';
}

/**
 * Cache metrics for monitoring
 */
export interface CacheMetrics {
  hitRate: number; // 0-100%
  missRate: number; // 0-100%
  responseTime: number; // milliseconds
  apiCallReduction: number; // 0-100%
  errorRate: number; // 0-100%
  totalHits: number;
  totalMisses: number;
  totalErrors: number;
}

/**
 * Cache invalidation options
 */
export interface InvalidationOptions {
  cascade?: boolean; // Invalidate related keys
  pattern?: string; // Regex pattern for key matching
  olderThan?: number; // Invalidate entries older than X milliseconds
}

/**
 * Cache operation result
 */
export interface CacheOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  metrics?: {
    operationTime: number; // milliseconds
    cacheHit: boolean;
  };
}

/**
 * Version manager interface
 */
export interface IVersionManager {
  getCacheKey(baseKey: string): string;
  generateNewVersion(): string;
  getCurrentVersion(): string;
  cleanupOldVersions(kv: Deno.Kv, currentVersion: string): Promise<void>;
}

/**
 * Cache manager interface
 */
export interface ICacheManager {
  get<T>(key: string): Promise<CacheOperationResult<T>>;
  set<T>(key: string, value: T, ttl?: number): Promise<CacheOperationResult<void>>;
  delete(key: string): Promise<CacheOperationResult<void>>;
  invalidate(options?: InvalidationOptions): Promise<CacheOperationResult<void>>;
  getMetrics(): CacheMetrics;
}

/**
 * Wellness data cache-specific types
 */
export interface WellnessCacheEntry {
  athleteId: string;
  date: string;
  data: unknown; // IntervalsWellness type
  hrvData?: unknown; // HRV-specific data
  rhrData?: unknown; // RHR-specific data
}

/**
 * Activity cache-specific types
 */
export interface ActivityCacheEntry {
  athleteId: string;
  dateRange: string;
  activities: unknown[]; // IntervalsActivity[] type
}

/**
 * Error types for cache operations
 */
export class CacheError extends Error {
  constructor(
    message: string,
    public readonly code: 'SIZE_LIMIT' | 'KEY_INVALID' | 'KV_ERROR' | 'TTL_INVALID' | 'VERSION_ERROR',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CacheError';
  }
}