/**
 * キャッシュ機能を統合したUCRIntervalsClient v2
 * ストラテジーパターンを使用してキャッシュ制御を改善
 */

import { UCRIntervalsClient } from "./ucr-intervals-client.ts";
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
import type { 
  ICacheStrategy, 
  CacheContext 
} from "./cache/cache-strategy-types.ts";
import { 
  includesToday, 
  isRecentDate 
} from "./cache/cache-strategy-types.ts";
import { TodayDataCacheStrategy } from "./cache/today-data-cache-strategy.ts";
import { DefaultCacheStrategy } from "./cache/default-cache-strategy.ts";
import { 
  getWellnessCacheKey, 
  formatDateRange,
} from "./cache/cache-utils.ts";

/**
 * DI対応の改善されたキャッシュクライアント
 */
export class CachedUCRIntervalsClientV2 extends UCRIntervalsClient {
  private cacheStrategy: ICacheStrategy;
  private cacheEnabled: boolean;
  declare protected ucrCalculator: any;

  constructor(
    options: IntervalsAPIOptions,
    cacheStrategy?: ICacheStrategy
  ) {
    super(options);
    
    // ストラテジーの注入（デフォルトはTodayDataCacheStrategy）
    this.cacheStrategy = cacheStrategy || new TodayDataCacheStrategy();
    this.cacheEnabled = Deno.env.get("CACHE_ENABLED") !== "false";
    
    log("DEBUG", `CachedUCRIntervalsClientV2 initialized with ${this.cacheStrategy.constructor.name}`);
  }

  /**
   * Override getWellnessDataForUCR with improved cache support
   */
  override async getWellnessDataForUCR(
    targetDate: string, 
    lookbackDays: number = 60
  ): Promise<WellnessData[]> {
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    const oldest = startDate.toISOString().split('T')[0];
    const newest = targetDate;
    
    // キャッシュキー生成
    const cacheKey = getWellnessCacheKey(
      this.athleteId, 
      formatDateRange(oldest, newest)
    );
    
    // キャッシュコンテキストの作成
    const context: CacheContext = {
      isToday: includesToday(oldest, newest),
      dataType: "wellness",
      dateRange: {
        start: oldest,
        end: newest
      },
      isRecent: isRecentDate(newest, 7)
    };

    // キャッシュからの取得を試みる
    if (this.cacheEnabled) {
      log("DEBUG", `Checking cache for wellness data: ${oldest} to ${newest}`);
      
      const cacheResult = await this.cacheStrategy.get<WellnessData[]>(cacheKey);
      if (cacheResult.success && cacheResult.cached && cacheResult.data) {
        log("INFO", `Cache hit for wellness data: ${oldest} to ${newest}`);
        return cacheResult.data;
      }
      
      log("DEBUG", "Cache miss, fetching from API");
    }

    try {
      // APIから取得
      const data = await super.getWellnessDataForUCR(targetDate, lookbackDays);
      
      // キャッシュに保存（ストラテジーが判断）
      if (this.cacheEnabled && data.length > 0) {
        await this.cacheStrategy.set(cacheKey, data, context);
        
        const ttl = this.cacheStrategy.getTTL(context);
        log("DEBUG", `Data cached with TTL ${ttl}ms based on strategy`);
      }
      
      return data;
    } catch (error) {
      log("ERROR", `Failed to fetch wellness data: ${getErrorMessage(error)}`);
      
      // エラー時はキャッシュからフォールバック
      if (this.cacheEnabled) {
        log("WARN", "Attempting to use cache as fallback due to API error");
        const fallbackResult = await this.cacheStrategy.get<WellnessData[]>(cacheKey);
        if (fallbackResult.data) {
          log("WARN", "Using cached data as fallback");
          return fallbackResult.data;
        }
      }
      
      throw error;
    }
  }

  /**
   * Override updateWellnessAndRecalculateUCR with improved cache invalidation
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
    // 関連するキャッシュを無効化
    if (this.cacheEnabled) {
      await this.invalidateRelatedCaches(date);
    }

    // 親クラスの実装を呼び出し
    return super.updateWellnessAndRecalculateUCR(date, updates);
  }

  /**
   * 関連するキャッシュを効率的に無効化
   */
  private async invalidateRelatedCaches(date: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    
    // 単一日付のキャッシュを削除
    const singleDateKey = getWellnessCacheKey(this.athleteId, date);
    tasks.push(this.cacheStrategy.delete(singleDateKey));
    
    // 最近の日付範囲のキャッシュのみ削除（最適化）
    // 過去7日〜未来7日の範囲のみチェック
    const targetDate = new Date(date);
    for (let offset = -7; offset <= 7; offset++) {
      const checkDate = new Date(targetDate);
      checkDate.setDate(checkDate.getDate() + offset);
      
      // 60日前からのデータ範囲
      const startDate = new Date(checkDate);
      startDate.setDate(startDate.getDate() - 60);
      
      const rangeKey = getWellnessCacheKey(
        this.athleteId,
        formatDateRange(
          startDate.toISOString().split('T')[0],
          checkDate.toISOString().split('T')[0]
        )
      );
      
      tasks.push(this.cacheStrategy.delete(rangeKey));
    }
    
    await Promise.all(tasks);
    log("DEBUG", `Invalidated caches related to ${date}`);
  }

  /**
   * バッチ計算の最適化版
   */
  override async batchCalculateUCR(
    startDate: string,
    endDate: string,
    updateIntervals: boolean = false
  ): Promise<Map<string, UCRWithTrend>> {
    log("DEBUG", `Batch calculating UCR from ${startDate} to ${endDate}`);

    // バッチ用の拡張データ取得
    const start = new Date(startDate);
    const end = new Date(endDate);
    const lookbackStart = new Date(start);
    lookbackStart.setDate(lookbackStart.getDate() - 60);

    const batchCacheKey = getWellnessCacheKey(
      this.athleteId,
      formatDateRange(lookbackStart.toISOString().split('T')[0], endDate)
    );

    // コンテキスト作成
    const context: CacheContext = {
      isToday: includesToday(lookbackStart.toISOString().split('T')[0], endDate),
      dataType: "wellness",
      dateRange: {
        start: lookbackStart.toISOString().split('T')[0],
        end: endDate
      },
      isRecent: isRecentDate(endDate, 7)
    };

    let wellnessData: WellnessData[] | null = null;

    // キャッシュから取得を試みる
    if (this.cacheEnabled) {
      const cacheResult = await this.cacheStrategy.get<WellnessData[]>(batchCacheKey);
      if (cacheResult.success && cacheResult.cached && cacheResult.data) {
        log("INFO", "Using cached data for batch UCR calculation");
        wellnessData = cacheResult.data;
      }
    }

    // キャッシュになければAPIから取得
    if (!wellnessData) {
      wellnessData = await this.getWellnessDataForUCR(end.toISOString().split('T')[0], 90);
      
      if (this.cacheEnabled && wellnessData.length > 0) {
        await this.cacheStrategy.set(batchCacheKey, wellnessData, context);
        log("DEBUG", "Cached batch wellness data");
      }
    }

    // UCR計算の実行
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
          // 更新したデータのキャッシュを無効化
          if (this.cacheEnabled) {
            await this.invalidateRelatedCaches(dateStr);
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
   * ストラテジーを切り替える
   */
  setStrategy(strategy: ICacheStrategy): void {
    this.cacheStrategy = strategy;
    log("INFO", `Cache strategy changed to ${strategy.constructor.name}`);
  }

  /**
   * 現在のストラテジーを取得
   */
  getStrategy(): ICacheStrategy {
    return this.cacheStrategy;
  }
}