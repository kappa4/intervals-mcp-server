/**
 * Cache version management for deployment-based cache invalidation
 */

import type { IVersionManager } from "./cache-types.ts";
import { getCacheConfig } from "./cache-config.ts";
import { log } from "../logger.ts";

export class CacheVersionManager implements IVersionManager {
  private static VERSION_ENV_KEY = "DEPLOY_VERSION";
  private currentVersion: string;
  private versionStrategy: "auto" | "manual" | "fixed";

  constructor() {
    const config = getCacheConfig();
    this.currentVersion = config.version;
    this.versionStrategy = config.versionStrategy;
    
    if (config.debug) {
      log("DEBUG", `CacheVersionManager initialized with version: ${this.currentVersion}, strategy: ${this.versionStrategy}`);
    }
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    if (this.versionStrategy === "auto") {
      // In auto mode, check environment variable for updates
      const envVersion = Deno.env.get(CacheVersionManager.VERSION_ENV_KEY);
      if (envVersion && envVersion !== this.currentVersion) {
        this.currentVersion = envVersion;
        log("INFO", `Cache version updated to: ${this.currentVersion}`);
      }
    }
    return this.currentVersion;
  }

  /**
   * Generate cache key with version prefix
   */
  getCacheKey(baseKey: string): string {
    const version = this.getCurrentVersion();
    return `${version}:${baseKey}`;
  }

  /**
   * Generate new version identifier
   */
  generateNewVersion(): string {
    if (this.versionStrategy === "fixed") {
      log("WARN", "Cannot generate new version in fixed mode");
      return this.currentVersion;
    }

    const newVersion = `v${Date.now()}`;
    
    if (this.versionStrategy === "manual") {
      log("INFO", `New version generated (manual mode): ${newVersion}. Update DEPLOY_VERSION env var to apply.`);
    } else {
      // Auto mode - update immediately
      this.currentVersion = newVersion;
      log("INFO", `New version generated and applied: ${newVersion}`);
    }
    
    return newVersion;
  }

  /**
   * Clean up old version caches
   * This is a basic implementation - will be enhanced in Phase 4
   */
  async cleanupOldVersions(kv: Deno.Kv, currentVersion: string): Promise<void> {
    log("INFO", `Starting cleanup of old cache versions. Current version: ${currentVersion}`);
    
    const deletedCount = 0;
    const startTime = performance.now();
    
    try {
      // In Phase 4, we'll implement:
      // 1. Scan for keys with different version prefixes
      // 2. Batch delete old version keys
      // 3. Respect TTL for graceful expiration
      // 4. Report metrics
      
      // For now, just log the intention
      log("DEBUG", "Old version cleanup scheduled for Phase 4 implementation");
      
      const duration = performance.now() - startTime;
      log("INFO", `Cache cleanup completed. Deleted ${deletedCount} keys in ${duration.toFixed(2)}ms`);
    } catch (error) {
      log("ERROR", `Cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if a key belongs to the current version
   */
  isCurrentVersion(key: string): boolean {
    const version = this.getCurrentVersion();
    return key.startsWith(`${version}:`);
  }

  /**
   * Extract version from a cache key
   */
  extractVersion(key: string): string | null {
    const match = key.match(/^(v\d+):/);
    return match ? match[1] : null;
  }

  /**
   * Compare versions to determine if one is newer
   */
  isNewerVersion(version1: string, version2: string): boolean {
    const v1Timestamp = this.extractTimestamp(version1);
    const v2Timestamp = this.extractTimestamp(version2);
    
    if (v1Timestamp === null || v2Timestamp === null) {
      return false;
    }
    
    return v1Timestamp > v2Timestamp;
  }

  /**
   * Extract timestamp from version string
   */
  private extractTimestamp(version: string): number | null {
    const match = version.match(/^v(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Get version statistics for monitoring
   */
  async getVersionStats(kv: Deno.Kv): Promise<{
    currentVersion: string;
    strategy: string;
    versionsFound: string[];
    keysPerVersion: Record<string, number>;
  }> {
    const currentVersion = this.getCurrentVersion();
    const versionsFound = new Set<string>();
    const keysPerVersion: Record<string, number> = {};
    
    // This will be fully implemented in Phase 4
    // For now, return basic info
    versionsFound.add(currentVersion);
    keysPerVersion[currentVersion] = 0;
    
    return {
      currentVersion,
      strategy: this.versionStrategy,
      versionsFound: Array.from(versionsFound),
      keysPerVersion,
    };
  }
}