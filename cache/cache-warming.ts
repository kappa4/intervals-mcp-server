/**
 * Cache Warming functionality for intervals-mcp-server
 * Pre-loads frequently used data into cache on server startup
 */

import { WellnessCache } from "./wellness-cache.ts";
import { log } from "../logger.ts";
import type { CachedUCRIntervalsClient } from "../ucr-intervals-client-cached.ts";

export interface CacheWarmingConfig {
  enabled: boolean;
  warmOnStartup: boolean;
  warmingTasks: WarmingTask[];
  maxConcurrentTasks: number;
}

export interface WarmingTask {
  name: string;
  type: "wellness" | "ucr_assessment" | "ucr_trends";
  params: Record<string, any>;
  priority: number; // 1-10, higher = more important
}

export class CacheWarmer {
  private cache: WellnessCache;
  private client: CachedUCRIntervalsClient;
  private config: CacheWarmingConfig;
  private isWarming = false;

  constructor(
    cache: WellnessCache,
    client: CachedUCRIntervalsClient,
    config?: Partial<CacheWarmingConfig>
  ) {
    this.cache = cache;
    this.client = client;
    this.config = {
      enabled: true,
      warmOnStartup: true,
      maxConcurrentTasks: 3,
      warmingTasks: this.getDefaultWarmingTasks(),
      ...config
    };
  }

  /**
   * Get default warming tasks for common UCR operations
   */
  private getDefaultWarmingTasks(): WarmingTask[] {
    const today = new Date();
    const tasks: WarmingTask[] = [];

    // Warm today's UCR assessment (highest priority)
    tasks.push({
      name: "today_ucr_assessment",
      type: "ucr_assessment",
      params: {
        date: today.toISOString().split('T')[0]
      },
      priority: 10
    });

    // Warm recent wellness data (60 days)
    tasks.push({
      name: "recent_wellness_60d",
      type: "wellness",
      params: {
        lookbackDays: 60
      },
      priority: 9
    });

    // Warm UCR trends for different periods
    const trendPeriods = [7, 14, 30];
    for (const days of trendPeriods) {
      tasks.push({
        name: `ucr_trends_${days}d`,
        type: "ucr_trends",
        params: {
          lookbackDays: days
        },
        priority: 8 - (days / 10) // Shorter periods have higher priority
      });
    }

    return tasks;
  }

  /**
   * Start cache warming process
   */
  async warmCache(): Promise<void> {
    if (!this.config.enabled || this.isWarming) {
      log("INFO", "Cache warming skipped (disabled or already in progress)");
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();
    log("INFO", "Starting cache warming process...");

    try {
      // Sort tasks by priority (highest first)
      const sortedTasks = [...this.config.warmingTasks].sort(
        (a, b) => b.priority - a.priority
      );

      // Process tasks in batches
      const results = await this.processTasks(sortedTasks);
      
      const duration = Date.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      log("INFO", `Cache warming completed in ${duration}ms: ${successful} successful, ${failed} failed`);

      // Log cache statistics after warming
      const stats = this.cache.getMetrics();
      log("INFO", `Cache stats after warming: ${stats.totalHits} hits, ${stats.totalMisses} misses, ${stats.hitRate}% hit rate`);
    } catch (error) {
      log("ERROR", "Cache warming failed:", error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Process warming tasks with concurrency control
   */
  private async processTasks(tasks: WarmingTask[]): Promise<WarmingResult[]> {
    const results: WarmingResult[] = [];
    const maxConcurrent = this.config.maxConcurrentTasks;

    // Process tasks in batches
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(task => this.executeWarmingTask(task))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute a single warming task
   */
  private async executeWarmingTask(task: WarmingTask): Promise<WarmingResult> {
    const startTime = Date.now();
    log("DEBUG", `Executing warming task: ${task.name}`);

    try {
      switch (task.type) {
        case "wellness":
          await this.warmWellnessData(task.params);
          break;
        case "ucr_assessment":
          await this.warmUCRAssessment(task.params);
          break;
        case "ucr_trends":
          await this.warmUCRTrends(task.params);
          break;
        default:
          throw new Error(`Unknown warming task type: ${task.type}`);
      }

      const duration = Date.now() - startTime;
      log("DEBUG", `Warming task ${task.name} completed in ${duration}ms`);
      
      return {
        task: task.name,
        success: true,
        duration
      };
    } catch (error) {
      log("WARN", `Warming task ${task.name} failed:`, error);
      return {
        task: task.name,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Warm wellness data for a given period
   */
  private async warmWellnessData(params: Record<string, any>): Promise<void> {
    const lookbackDays = params.lookbackDays || 60;
    const targetDate = params.date || new Date().toISOString().split('T')[0];
    
    // This will fetch and cache the data
    await this.client.getWellnessDataForUCR(targetDate, lookbackDays);
  }

  /**
   * Warm UCR assessment data
   */
  private async warmUCRAssessment(params: Record<string, any>): Promise<void> {
    const date = params.date || new Date().toISOString().split('T')[0];
    
    // Fetch wellness data which will be cached
    const wellnessData = await this.client.getWellnessDataForUCR(date);
    
    // Calculate UCR (this won't be cached but the underlying data will be)
    if (wellnessData.length > 0) {
      const calculator = this.client.getCalculator();
      calculator.calculateUCR(wellnessData, date);
    }
  }

  /**
   * Warm UCR trends data
   */
  private async warmUCRTrends(params: Record<string, any>): Promise<void> {
    const lookbackDays = params.lookbackDays || 30;
    const date = params.date || new Date().toISOString().split('T')[0];
    
    // Batch calculate will cache the wellness data
    await this.client.batchCalculateUCR(date, lookbackDays);
  }

  /**
   * Schedule periodic cache warming
   */
  schedulePeriodicWarming(intervalMs: number = 3600000): void { // Default: 1 hour
    if (!this.config.enabled) {
      log("INFO", "Periodic cache warming disabled");
      return;
    }

    log("INFO", `Scheduling periodic cache warming every ${intervalMs}ms`);
    
    // Initial warming
    if (this.config.warmOnStartup) {
      setTimeout(() => this.warmCache(), 5000); // Wait 5s after startup
    }

    // Periodic warming
    setInterval(() => {
      log("DEBUG", "Running periodic cache warming");
      this.warmCache();
    }, intervalMs);
  }
}

interface WarmingResult {
  task: string;
  success: boolean;
  duration: number;
  error?: string;
}