/**
 * Background cache update functionality
 * Refreshes cache entries before they expire to ensure fresh data
 */

import { WellnessCache } from "./wellness-cache.ts";
import { log } from "../logger.ts";
import type { CachedUCRIntervalsClient } from "../ucr-intervals-client-cached.ts";
import type { CacheKeyComponents } from "./cache-types.ts";

export interface BackgroundUpdateConfig {
  enabled: boolean;
  updateThreshold: number; // Percentage of TTL remaining before update (e.g., 0.2 = 20%)
  maxConcurrentUpdates: number;
  checkInterval: number; // How often to check for entries needing update (ms)
  retryAttempts: number;
  retryDelay: number; // Delay between retry attempts (ms)
}

interface UpdateTask {
  key: CacheKeyComponents;
  dataType: string;
  athleteId: string;
  dateRange?: { oldest: string; newest: string };
  priority: number;
  retryCount: number;
}

export class BackgroundCacheUpdater {
  private cache: WellnessCache;
  private client: CachedUCRIntervalsClient;
  private config: BackgroundUpdateConfig;
  private updateQueue: UpdateTask[] = [];
  private isRunning = false;
  private updateInProgress = new Set<string>();
  private checkIntervalId?: number;

  constructor(
    cache: WellnessCache,
    client: CachedUCRIntervalsClient,
    config?: Partial<BackgroundUpdateConfig>
  ) {
    this.cache = cache;
    this.client = client;
    this.config = {
      enabled: true,
      updateThreshold: 0.2, // Update when 20% TTL remaining
      maxConcurrentUpdates: 2,
      checkInterval: 60000, // Check every minute
      retryAttempts: 3,
      retryDelay: 5000,
      ...config
    };
  }

  /**
   * Start the background updater
   */
  start(): void {
    if (!this.config.enabled || this.isRunning) {
      log("INFO", "Background updater already running or disabled");
      return;
    }

    this.isRunning = true;
    log("INFO", "Starting background cache updater");

    // Schedule periodic checks
    this.checkIntervalId = setInterval(
      () => this.checkAndUpdateCache(),
      this.config.checkInterval
    );

    // Run initial check after a short delay
    setTimeout(() => this.checkAndUpdateCache(), 5000);
  }

  /**
   * Stop the background updater
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
    }

    log("INFO", "Stopped background cache updater");
  }

  /**
   * Check cache entries and queue updates for those nearing expiration
   */
  private async checkAndUpdateCache(): Promise<void> {
    if (!this.isRunning) return;

    log("DEBUG", "Running background cache check");

    try {
      // Get all cached keys (this would need to be implemented in WellnessCache)
      const cachedEntries = await this.getCachedEntriesNearingExpiry();
      
      // Queue updates for entries nearing expiration
      for (const entry of cachedEntries) {
        this.queueUpdate(entry);
      }

      // Process update queue
      await this.processUpdateQueue();
      
    } catch (error) {
      log("ERROR", "Background cache check failed:", error);
    }
  }

  /**
   * Get cached entries that are nearing expiration
   * Note: This is a simplified implementation. In production, you'd want
   * to track cache entries more efficiently.
   */
  private async getCachedEntriesNearingExpiry(): Promise<UpdateTask[]> {
    const tasks: UpdateTask[] = [];
    
    // For now, we'll check common patterns
    // In a real implementation, you'd track all cached keys
    const today = new Date();
    // @ts-ignore - accessing protected property for cache operations
    const athleteId = (this.client as any).athleteId || this.client.athlete_id;
    
    // Check recent wellness data caches
    const lookbackPeriods = [7, 14, 30, 60];
    for (const days of lookbackPeriods) {
      const key: CacheKeyComponents = {
        version: "1.0.0",
        athleteId,
        dataType: 'wellness',
        dateRange: `${new Date(today.getTime() - days * 86400000).toISOString().split('T')[0]}:${today.toISOString().split('T')[0]}`
      };
      
      // Check if this entry exists and needs update
      const needsUpdate = await this.checkIfNeedsUpdate(key);
      if (needsUpdate) {
        tasks.push({
          key,
          dataType: 'wellness',
          athleteId,
          dateRange: key.dateRange ? {
            oldest: key.dateRange.split(':')[0],
            newest: key.dateRange.split(':')[1]
          } : undefined,
          priority: 10 - (days / 10), // Shorter periods have higher priority
          retryCount: 0
        });
      }
    }
    
    return tasks;
  }

  /**
   * Check if a cache entry needs to be updated
   */
  private async checkIfNeedsUpdate(key: CacheKeyComponents): Promise<boolean> {
    const entry = await this.cache.getWithMetadata(key);
    if (!entry || !entry.value) return false;
    
    const now = Date.now();
    const cachedAtMs = new Date(entry.cachedAt).getTime();
    const age = now - cachedAtMs;
    const ttl = entry.ttl || this.cache.getTTL(key.dataType);
    const remainingTTL = ttl - age;
    
    // Update if less than threshold of TTL remains
    return remainingTTL < (ttl * this.config.updateThreshold);
  }

  /**
   * Queue an update task
   */
  private queueUpdate(task: UpdateTask): void {
    const taskKey = this.getTaskKey(task);
    
    // Don't queue if already updating or queued
    if (this.updateInProgress.has(taskKey)) return;
    
    const existingIndex = this.updateQueue.findIndex(
      t => this.getTaskKey(t) === taskKey
    );
    
    if (existingIndex === -1) {
      this.updateQueue.push(task);
      // Sort by priority
      this.updateQueue.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Process the update queue
   */
  private async processUpdateQueue(): Promise<void> {
    const concurrent = Math.min(
      this.config.maxConcurrentUpdates,
      this.updateQueue.length
    );
    
    if (concurrent === 0) return;
    
    const tasks = this.updateQueue.splice(0, concurrent);
    const updatePromises = tasks.map(task => this.updateCacheEntry(task));
    
    await Promise.allSettled(updatePromises);
  }

  /**
   * Update a single cache entry
   */
  private async updateCacheEntry(task: UpdateTask): Promise<void> {
    const taskKey = this.getTaskKey(task);
    this.updateInProgress.add(taskKey);
    
    try {
      log("DEBUG", `Updating cache entry: ${task.dataType} for ${task.athleteId}`);
      
      // Disable cache for this request to force fresh data
      const originalCacheEnabled = this.client.cacheEnabled;
      this.client.cacheEnabled = false;
      
      try {
        if (task.dataType === 'wellness' && task.dateRange) {
          // Fetch fresh wellness data
          const lookbackDays = this.calculateLookbackDays(
            task.dateRange.oldest,
            task.dateRange.newest
          );
          await this.client.getWellnessDataForUCR(
            task.dateRange.newest,
            lookbackDays
          );
          
          log("DEBUG", `Successfully updated wellness cache for ${lookbackDays} days`);
        }
        
        // Re-enable cache
        this.client.cacheEnabled = originalCacheEnabled;
        
      } catch (error) {
        // Re-enable cache even on error
        this.client.cacheEnabled = originalCacheEnabled;
        throw error;
      }
      
    } catch (error) {
      log("WARN", `Failed to update cache entry: ${taskKey}`, error);
      
      // Retry logic
      if (task.retryCount < this.config.retryAttempts) {
        task.retryCount++;
        setTimeout(() => {
          this.queueUpdate(task);
        }, this.config.retryDelay * task.retryCount);
      }
    } finally {
      this.updateInProgress.delete(taskKey);
    }
  }

  /**
   * Calculate lookback days from date range
   */
  private calculateLookbackDays(oldest: string, newest: string): number {
    const oldestDate = new Date(oldest);
    const newestDate = new Date(newest);
    const diffTime = Math.abs(newestDate.getTime() - oldestDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get unique key for a task
   */
  private getTaskKey(task: UpdateTask): string {
    if (task.dateRange) {
      return `${task.athleteId}:${task.dataType}:${task.dateRange.oldest}:${task.dateRange.newest}`;
    }
    return `${task.athleteId}:${task.dataType}`;
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    isRunning: boolean;
    queueLength: number;
    inProgress: number;
  } {
    return {
      isRunning: this.isRunning,
      queueLength: this.updateQueue.length,
      inProgress: this.updateInProgress.size
    };
  }
}