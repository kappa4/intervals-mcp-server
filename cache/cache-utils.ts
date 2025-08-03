/**
 * Cache utility functions
 */

import type { CacheKeyComponents } from "./cache-types.ts";
import { CACHE_KEY_PREFIX } from "./cache-config.ts";

/**
 * Generate cache key for wellness data
 */
export function getWellnessCacheKey(athleteId: string, date: string): string {
  return `${CACHE_KEY_PREFIX.WELLNESS}:${athleteId}:${date}`;
}

/**
 * Generate cache key for activities data
 */
export function getActivitiesCacheKey(athleteId: string, dateRange: string): string {
  return `${CACHE_KEY_PREFIX.ACTIVITIES}:${athleteId}:${dateRange}`;
}

/**
 * Generate cache key for athlete data
 */
export function getAthleteCacheKey(athleteId: string): string {
  return `${CACHE_KEY_PREFIX.ATHLETE}:${athleteId}`;
}

/**
 * Generate cache key for metadata
 */
export function getMetadataCacheKey(metaKey: string): string {
  return `${CACHE_KEY_PREFIX.METADATA}:${metaKey}`;
}

/**
 * Parse date range string (e.g., "2025-01-01:2025-01-31")
 */
export function parseDateRange(dateRange: string): { start: string; end: string } {
  const [start, end] = dateRange.split(":");
  if (!start || !end) {
    throw new Error(`Invalid date range format: ${dateRange}`);
  }
  return { start, end };
}

/**
 * Format date range for cache key
 */
export function formatDateRange(start: string, end: string): string {
  return `${start}:${end}`;
}

/**
 * Calculate cache freshness
 */
export function isCacheFresh(cachedAt: string, ttlSeconds: number): boolean {
  const cachedTime = new Date(cachedAt).getTime();
  const now = Date.now();
  const ageMs = now - cachedTime;
  const ttlMs = ttlSeconds * 1000;
  
  return ageMs < ttlMs;
}

/**
 * Format cache size for logging
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Batch cache keys for efficient operations
 */
export function batchCacheKeys(keys: string[], batchSize = 10): string[][] {
  const batches: string[][] = [];
  
  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Extract athlete ID from cache key
 */
export function extractAthleteId(cacheKey: string): string | null {
  const parts = cacheKey.split(":");
  // Format: version:dataType:athleteId:...
  if (parts.length >= 3) {
    return parts[2];
  }
  return null;
}

/**
 * Check if cache key is for wellness data
 */
export function isWellnessKey(cacheKey: string): boolean {
  return cacheKey.includes(`:${CACHE_KEY_PREFIX.WELLNESS}:`);
}

/**
 * Check if cache key is for activities data
 */
export function isActivitiesKey(cacheKey: string): boolean {
  return cacheKey.includes(`:${CACHE_KEY_PREFIX.ACTIVITIES}:`);
}

/**
 * Generate cache key pattern for invalidation
 */
export function getCacheKeyPattern(
  dataType: CacheKeyComponents["dataType"],
  athleteId?: string
): string {
  const basePattern = `*:${CACHE_KEY_PREFIX[dataType.toUpperCase() as keyof typeof CACHE_KEY_PREFIX]}`;
  
  if (athleteId) {
    return `${basePattern}:${athleteId}*`;
  }
  
  return `${basePattern}:*`;
}