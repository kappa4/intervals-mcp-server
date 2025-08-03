/**
 * Cache configuration and constants
 */

import type { CacheConfig, CacheKeyComponents } from "./cache-types.ts";

/**
 * Default TTL values in seconds
 */
export const DEFAULT_TTL = {
  WELLNESS: 3600, // 1 hour
  ACTIVITIES: 1800, // 30 minutes
  ATHLETE: 86400, // 24 hours
  METADATA: 43200, // 12 hours
} as const;

/**
 * Cache size limits based on Deno KV restrictions
 */
export const CACHE_LIMITS = {
  MAX_KEY_SIZE: 2048, // 2 KiB in bytes
  MAX_VALUE_SIZE: 65536, // 64 KiB in bytes
  MAX_TRANSACTION_SIZE: 819200, // 800 KiB in bytes
  MAX_MUTATIONS_PER_TRANSACTION: 1000,
} as const;

/**
 * Cache key prefixes
 */
export const CACHE_KEY_PREFIX = {
  WELLNESS: "wellness",
  ACTIVITIES: "activities",
  ATHLETE: "athlete",
  METADATA: "meta",
  METRICS: "metrics",
} as const;

/**
 * Get cache configuration from environment variables
 */
export function getCacheConfig(): CacheConfig {
  const enabled = Deno.env.get("CACHE_ENABLED") !== "false";
  const debug = Deno.env.get("CACHE_DEBUG") === "true";
  
  return {
    enabled,
    ttlWellness: parseInt(Deno.env.get("CACHE_TTL_WELLNESS") || String(DEFAULT_TTL.WELLNESS)),
    ttlActivities: parseInt(Deno.env.get("CACHE_TTL_ACTIVITIES") || String(DEFAULT_TTL.ACTIVITIES)),
    ttlAthlete: parseInt(Deno.env.get("CACHE_TTL_ATHLETE") || String(DEFAULT_TTL.ATHLETE)),
    ttlMetadata: parseInt(Deno.env.get("CACHE_TTL_METADATA") || String(DEFAULT_TTL.METADATA)),
    debug,
    version: Deno.env.get("DEPLOY_VERSION") || "v1",
    versionStrategy: (Deno.env.get("CACHE_VERSION_STRATEGY") || "auto") as CacheConfig["versionStrategy"],
  };
}

/**
 * Build cache key from components
 */
export function buildCacheKey(components: CacheKeyComponents): string[] {
  const { version, dataType, athleteId, dateRange, metaKey } = components;
  const keyParts: string[] = [version, dataType, athleteId];
  
  if (dateRange) {
    keyParts.push(dateRange);
  }
  
  if (metaKey) {
    keyParts.push(metaKey);
  }
  
  return keyParts;
}

/**
 * Parse cache key into components
 */
export function parseCacheKey(key: string[]): Partial<CacheKeyComponents> {
  const [version, dataType, athleteId, ...rest] = key;
  
  const components: Partial<CacheKeyComponents> = {
    version,
    dataType: dataType as CacheKeyComponents["dataType"],
    athleteId,
  };
  
  if (rest.length > 0) {
    if (dataType === "metadata") {
      components.metaKey = rest.join(":");
    } else {
      components.dateRange = rest[0];
    }
  }
  
  return components;
}

/**
 * Calculate TTL in milliseconds based on data type
 */
export function getTTLMilliseconds(dataType: CacheKeyComponents["dataType"], config: CacheConfig): number {
  const ttlSeconds = {
    wellness: config.ttlWellness,
    activities: config.ttlActivities,
    athlete: config.ttlAthlete,
    metadata: config.ttlMetadata,
  }[dataType];
  
  return ttlSeconds * 1000;
}

/**
 * Validate cache key size
 */
export function validateKeySize(key: string[]): boolean {
  const keyString = key.join(":");
  const keySize = new TextEncoder().encode(keyString).length;
  return keySize <= CACHE_LIMITS.MAX_KEY_SIZE;
}

/**
 * Validate cache value size
 */
export function validateValueSize(value: unknown): boolean {
  const valueString = JSON.stringify(value);
  const valueSize = new TextEncoder().encode(valueString).length;
  return valueSize <= CACHE_LIMITS.MAX_VALUE_SIZE;
}

/**
 * Format cache debug message
 */
export function formatDebugMessage(operation: string, key: string[], details?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const keyString = key.join(":");
  const detailsString = details ? ` ${JSON.stringify(details)}` : "";
  return `[CACHE ${timestamp}] ${operation} ${keyString}${detailsString}`;
}