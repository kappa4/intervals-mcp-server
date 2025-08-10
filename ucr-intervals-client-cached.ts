/**
 * キャッシュ機能を統合したUCRIntervalsClient
 * WellnessCacheを利用してAPI呼び出しを最適化
 */

import { UCRIntervalsClient } from "./ucr-intervals-client.ts";
import { WellnessCache } from "./cache/wellness-cache.ts";
import { CacheWarmer } from "./cache/cache-warming.ts";
import { BackgroundCacheUpdater } from "./cache/background-updater.ts";
import { 
  getWellnessCacheKey, 
  formatDateRange,
  parseDateRange,
} from "./cache/cache-utils.ts";
import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import type {
  IntervalsAPIOptions,
  IntervalsWellness,
  IntervalsListResponse,
} from "./intervals-types.ts";
import type {
  WellnessData,
  UCRWithTrend,
} from "./ucr-types.ts";

export class CachedUCRIntervalsClient extends UCRIntervalsClient {
  private cache: WellnessCache;
  private cacheWarmer?: CacheWarmer;
  private backgroundUpdater?: BackgroundCacheUpdater;
  cacheEnabled: boolean; // Make public for background updater
  declare protected ucrCalculator: any; // Access parent's protected property

  constructor(options: IntervalsAPIOptions) {
    super(options);
    this.cache = new WellnessCache();
    this.cacheEnabled = Deno.env.get("CACHE_ENABLED") !== "false";
    
    // Initialize cache optimization features if enabled
    if (this.cacheEnabled) {
      this.cacheWarmer = new CacheWarmer(this.cache, this);
      this.backgroundUpdater = new BackgroundCacheUpdater(this.cache, this);
      
      // Start cache warming and background updates
      // Changed to opt-in for serverless environments
      if (Deno.env.get("CACHE_WARMING_ON_STARTUP") === "true") {
        this.cacheWarmer.schedulePeriodicWarming();
      }
      
      if (Deno.env.get("CACHE_BACKGROUND_UPDATE") === "true") {
        this.backgroundUpdater.start();
      }
      
      // Start statistics logging
      this.cache.startStatsLogging();
    }
    
    log("DEBUG", `CachedUCRIntervalsClient initialized, cache ${this.cacheEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Override getWellnessDataForUCR with cache support
   */
  override async getWellnessDataForUCR(targetDate: string, lookbackDays: number = 60): Promise<WellnessData[]> {
    // Generate cache key for the date range
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    const oldest = startDate.toISOString().split('T')[0];
    const newest = targetDate;
    const today = new Date().toISOString().split('T')[0];
    const isRequestingToday = newest === today;
    
    const cacheKey = getWellnessCacheKey(
      this.athleteId, 
      formatDateRange(oldest, newest)
    );

    // Try cache first if enabled, but skip cache for today's data
    if (this.cacheEnabled && !isRequestingToday) {
      log("DEBUG", `Checking cache for wellness data: ${oldest} to ${newest}`);
      
      const cacheResult = await this.cache.get<WellnessData[]>(cacheKey);
      if (cacheResult.success && cacheResult.cached && cacheResult.data) {
        log("INFO", `Cache hit for wellness data: ${oldest} to ${newest}`);
        return cacheResult.data;
      }
      
      log("DEBUG", "Cache miss, fetching from API");
    } else if (isRequestingToday) {
      log("DEBUG", `Skipping cache for today's data (${today}), fetching fresh from API`);
    }

    try {
      // Fetch from parent implementation (API)
      const data = await super.getWellnessDataForUCR(targetDate, lookbackDays);
      
      // Cache the result if enabled (but still cache today's data for background reference)
      if (this.cacheEnabled && data.length > 0) {
        // Cache for 1 minute for today's data (mainly for deduplication), 1 hour for recent data, 24 hours for older data
        const ttlMs = isRequestingToday ? 60 * 1000 : (new Date(newest).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
        
        await this.cache.set(cacheKey, data, ttlMs);
        log("DEBUG", `Cached wellness data with TTL ${ttlMs}ms${isRequestingToday ? ' (today\'s data - will fetch fresh next time)' : ''}`);
      }
      
      return data;
    } catch (error) {
      log("ERROR", `Failed to fetch wellness data: ${getErrorMessage(error)}`);
      
      // Try cache as fallback even if expired
      if (this.cacheEnabled) {
        log("WARN", "Attempting to use expired cache due to API error");
        const fallbackResult = await this.cache.get<WellnessData[]>(cacheKey);
        if (fallbackResult.data) {
          log("WARN", "Using expired cache data as fallback");
          return fallbackResult.data;
        }
      }
      
      throw error;
    }
  }

  /**
   * Override batchCalculateUCR with optimized caching
   */
  override async batchCalculateUCR(
    startDate: string,
    endDate: string,
    updateIntervals: boolean = false
  ): Promise<Map<string, UCRWithTrend>> {
    log("DEBUG", `Batch calculating UCR with cache optimization from ${startDate} to ${endDate}`);

    // For batch operations, we'll cache the entire dataset
    const start = new Date(startDate);
    const end = new Date(endDate);
    const lookbackStart = new Date(start);
    lookbackStart.setDate(lookbackStart.getDate() - 60);

    const batchCacheKey = getWellnessCacheKey(
      this.athleteId,
      formatDateRange(lookbackStart.toISOString().split('T')[0], endDate)
    );

    let wellnessData: WellnessData[] | null = null;

    // Try to get cached batch data
    if (this.cacheEnabled) {
      const cacheResult = await this.cache.get<WellnessData[]>(batchCacheKey);
      if (cacheResult.success && cacheResult.cached && cacheResult.data) {
        log("INFO", "Using cached data for batch UCR calculation");
        wellnessData = cacheResult.data;
      }
    }

    // If not cached, fetch and cache
    if (!wellnessData) {
      wellnessData = await this.getWellnessDataForUCR(end.toISOString().split('T')[0], 90);
      
      if (this.cacheEnabled && wellnessData.length > 0) {
        // Cache batch data for 24 hours
        await this.cache.set(batchCacheKey, wellnessData, 24 * 60 * 60 * 1000);
        log("DEBUG", "Cached batch wellness data");
      }
    }

    // Use parent's batch calculation logic with cached data
    const results = new Map<string, UCRWithTrend>();
    
    for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      try {
        const currentData = wellnessData.find(d => d.date === dateStr);
        if (!currentData) {
          log("WARN", `No wellness data found for ${dateStr}, skipping`);
          continue;
        }

        const historicalData = wellnessData.filter(d => d.date <= dateStr);
        
        const input = {
          current: currentData,
          historical: historicalData
        };

        const result = this.ucrCalculator.calculateWithTrends(input);
        results.set(dateStr, result);

        if (updateIntervals) {
          await this.updateWellnessWithUCR(dateStr, result);
          // Invalidate cache for this specific date since we updated it
          if (this.cacheEnabled) {
            const dateCacheKey = getWellnessCacheKey(this.athleteId, dateStr);
            await this.cache.delete(dateCacheKey);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        log("DEBUG", `UCR calculated for ${dateStr}: score=${result.score}`);
      } catch (error) {
        log("ERROR", `Failed to calculate UCR for ${dateStr}: ${getErrorMessage(error)}`);
      }
    }

    log("INFO", `Batch UCR calculation completed: ${results.size} entries processed`);
    return results;
  }

  /**
   * Override updateWellnessAndRecalculateUCR to invalidate cache
   */
  override async updateWellnessAndRecalculateUCR(
    date: string,
    updates: {
      fatigue?: number;
      stress?: number;
      motivation?: number;
      soreness?: number;
      injury?: number;
    }
  ): Promise<UCRWithTrend> {
    // Invalidate cache for this date before update
    if (this.cacheEnabled) {
      const dateCacheKey = getWellnessCacheKey(this.athleteId, date);
      await this.cache.delete(dateCacheKey);
      
      // Also invalidate any date ranges that include this date
      // This is a simple implementation - Phase 4 will have pattern-based invalidation
      log("DEBUG", `Invalidated cache for ${date} due to wellness update`);
    }

    // Call parent implementation
    return super.updateWellnessAndRecalculateUCR(date, updates);
  }

  /**
   * Get cache metrics for monitoring
   */
  getCacheMetrics() {
    return this.cache.getMetrics();
  }

  /**
   * Clear cache metrics
   */
  clearCacheMetrics() {
    this.cache.clearMetrics();
  }

  /**
   * Get calculator for cache warmer
   */
  getCalculator() {
    return this.ucrCalculator;
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return this.cache.getStatistics();
  }

  /**
   * Get cache warmer status
   */
  getCacheWarmerStatus() {
    return {
      enabled: !!this.cacheWarmer,
      isWarming: false // Would need to expose from CacheWarmer
    };
  }

  /**
   * Get background updater status
   */
  getBackgroundUpdaterStatus() {
    return this.backgroundUpdater?.getStatus() || {
      isRunning: false,
      queueLength: 0,
      inProgress: 0
    };
  }

  /**
   * Close cache connection
   */
  async close() {
    await this.cache.close();
  }
}