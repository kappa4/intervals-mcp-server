/**
 * キャッシュ戦略のBDDテスト
 * 
 * Given-When-Thenパターンで記述
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import type { 
  ICacheStrategy, 
  CacheContext, 
  CacheResult 
} from "../../cache/cache-strategy-types.ts";
import { TodayDataCacheStrategy } from "../../cache/today-data-cache-strategy.ts";
import { DefaultCacheStrategy } from "../../cache/default-cache-strategy.ts";

describe("Cache Strategy", () => {
  describe("ICacheStrategy interface", () => {
    it("should define the required methods", () => {
      // Given: キャッシュ戦略インターフェース
      // When: 実装クラスを作成
      // Then: 必要なメソッドが定義されている
      
      const strategy: ICacheStrategy = {
        get: async <T>(key: string): Promise<CacheResult<T>> => {
          return { success: false, cached: false };
        },
        set: async <T>(key: string, value: T, context: CacheContext): Promise<void> => {
          // no-op
        },
        delete: async (key: string): Promise<void> => {
          // no-op
        },
        shouldCache: (context: CacheContext): boolean => {
          return true;
        },
        getTTL: (context: CacheContext): number => {
          return 60000; // 1 minute default
        }
      };
      
      assertExists(strategy.get);
      assertExists(strategy.set);
      assertExists(strategy.shouldCache);
      assertExists(strategy.getTTL);
    });
  });

  describe("TodayDataCacheStrategy", () => {
    let strategy: TodayDataCacheStrategy;
    let mockCache: Map<string, { value: any; ttl: number; timestamp: number }>;

    beforeEach(() => {
      mockCache = new Map();
      strategy = new TodayDataCacheStrategy(mockCache);
    });

    describe("Given: 今日のデータ", () => {
      it("When: shouldCacheを呼ぶ, Then: falseを返すか極短TTLを返す", () => {
        // Given
        const todayContext: CacheContext = {
          isToday: true,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-01",
            end: "2025-01-12" // 今日
          }
        };

        // When
        const shouldCache = strategy.shouldCache(todayContext);
        const ttl = strategy.getTTL(todayContext);

        // Then: キャッシュするが極短TTL（5秒）
        assertEquals(shouldCache, true);
        assertEquals(ttl, 5000); // 5 seconds
      });
    });

    describe("Given: 過去のデータ", () => {
      it("When: shouldCacheを呼ぶ, Then: trueと通常のTTLを返す", () => {
        // Given
        const pastContext: CacheContext = {
          isToday: false,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-01",
            end: "2025-01-10" // 過去
          }
        };

        // When
        const shouldCache = strategy.shouldCache(pastContext);
        const ttl = strategy.getTTL(pastContext);

        // Then
        assertEquals(shouldCache, true);
        assertEquals(ttl, 86400000); // 24 hours for old data (not recent)
      });
    });

    describe("Given: 空のデータ", () => {
      it("When: setを呼ぶ, Then: キャッシュしない", async () => {
        // Given
        const emptyData: any[] = [];
        const context: CacheContext = {
          isToday: false,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-01",
            end: "2025-01-10"
          }
        };

        // When
        await strategy.set("test-key", emptyData, context);

        // Then
        const result = await strategy.get<any[]>("test-key");
        assertEquals(result.cached, false);
      });
    });

    describe("Given: 不完全なウェルネスデータ", () => {
      it("When: setを呼ぶ, Then: キャッシュしない", async () => {
        // Given: HRV、RHR、主観データが全て空
        const incompleteData = [{
          date: "2025-01-12",
          hrv: null,
          rhr: null,
          fatigue: null,
          stress: null
        }];
        const context: CacheContext = {
          isToday: true,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-12",
            end: "2025-01-12"
          }
        };

        // When
        await strategy.set("test-key", incompleteData, context);

        // Then
        const result = await strategy.get<any[]>("test-key");
        assertEquals(result.cached, false);
      });
    });

    describe("Given: 有効なウェルネスデータ", () => {
      it("When: 今日のデータをsetを呼ぶ, Then: 5秒TTLでキャッシュ", async () => {
        // Given
        const validData = [{
          date: "2025-01-12",
          hrv: 50,
          rhr: 60,
          fatigue: 3,
          stress: 2
        }];
        const context: CacheContext = {
          isToday: true,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-12",
            end: "2025-01-12"
          }
        };

        // When
        await strategy.set("test-key", validData, context);

        // Then: 即座に取得可能
        const result = await strategy.get<any[]>("test-key");
        assertEquals(result.cached, true);
        assertEquals(result.data, validData);

        // And: 6秒後は期限切れ（シミュレーション）
        // ※実際のテストでは時間操作が必要
      });
    });
  });

  describe("DefaultCacheStrategy", () => {
    let strategy: DefaultCacheStrategy;

    beforeEach(() => {
      strategy = new DefaultCacheStrategy();
    });

    describe("Given: デフォルト戦略", () => {
      it("When: 過去7日以内のデータ, Then: 1時間TTL", () => {
        // Given
        const recentContext: CacheContext = {
          isToday: false,
          dataType: "wellness",
          dateRange: {
            start: "2025-01-05",
            end: "2025-01-10"
          },
          isRecent: true // 7日以内
        };

        // When
        const ttl = strategy.getTTL(recentContext);

        // Then
        assertEquals(ttl, 3600000); // 1 hour
      });

      it("When: 7日より古いデータ, Then: 24時間TTL", () => {
        // Given
        const oldContext: CacheContext = {
          isToday: false,
          dataType: "wellness",
          dateRange: {
            start: "2024-12-01",
            end: "2024-12-31"
          },
          isRecent: false
        };

        // When
        const ttl = strategy.getTTL(oldContext);

        // Then
        assertEquals(ttl, 86400000); // 24 hours
      });
    });
  });
});

describe("Cache Strategy Integration", () => {
  describe("Given: UCRIntervalsClientにキャッシュ戦略を注入", () => {
    it("When: 今日のデータを取得, Then: 適切なTTLでキャッシュ", async () => {
      // このテストは実装後に追加
      // Mock APIとキャッシュを使用して統合テスト
    });
  });
});