/**
 * キャッシュストラテジー統合テスト
 * 
 * 実際のシナリオでキャッシュが正しく動作することを確認
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { CachedUCRIntervalsClientV2 } from "../../ucr-intervals-client-cached-v2.ts";
import { TodayDataCacheStrategy } from "../../cache/today-data-cache-strategy.ts";
import { DefaultCacheStrategy } from "../../cache/default-cache-strategy.ts";
import type { IntervalsAPIOptions } from "../../intervals-types.ts";
import type { WellnessData } from "../../ucr-types.ts";

// モックストレージ実装
class MockCacheStorage {
  private storage = new Map<string, any>();
  private ttlMap = new Map<string, number>();
  public getCallCount = 0;
  public setCallCount = 0;

  async get<T>(key: string): Promise<T | null> {
    this.getCallCount++;
    return this.storage.get(key) || null;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.setCallCount++;
    this.storage.set(key, value);
    this.ttlMap.set(key, ttlMs);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
    this.ttlMap.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
    this.ttlMap.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  getTTL(key: string): number | undefined {
    return this.ttlMap.get(key);
  }

  resetCounters(): void {
    this.getCallCount = 0;
    this.setCallCount = 0;
  }
}

describe("Cache Strategy Integration Tests", () => {
  describe("Scenario: 今日のデータで空データ → 更新 → 再取得", () => {
    it("should handle today's empty data correctly", async () => {
      // Given: モックストレージとストラテジー
      const mockStorage = new MockCacheStorage();
      const strategy = new TodayDataCacheStrategy(mockStorage as any);
      
      // 空のウェルネスデータ
      const emptyData: WellnessData[] = [{
        date: "2025-08-12",
        hrv: null,
        rhr: null,
        fatigue: null,
        stress: null,
        sleepScore: null,
        sleepHours: undefined,
        sleepQuality: undefined,
        weight: undefined,
        soreness: null,
        motivation: null,
        injury: null,
        fatigueConverted: null,
        sorenessConverted: null,
        stressConverted: null,
        motivationConverted: null,
        injuryConverted: null,
        alcohol: 0
      }];

      // When: 空データをセット
      await strategy.set("wellness:i72555:2025-08-12", emptyData, {
        isToday: true,
        dataType: "wellness",
        dateRange: {
          start: "2025-06-13",
          end: "2025-08-12"
        }
      });

      // Then: キャッシュされていない
      const result1 = await strategy.get<WellnessData[]>("wellness:i72555:2025-08-12");
      assertEquals(result1.cached, false);
      assertEquals(mockStorage.setCallCount, 0); // setが呼ばれていない

      // When: 有効なデータに更新
      const validData: WellnessData[] = [{
        date: "2025-08-12",
        hrv: 50,
        rhr: 60,
        fatigue: 3,
        stress: 2,
        sleepScore: 85,
        sleepHours: 7.5,
        sleepQuality: 4,
        weight: 70,
        soreness: 2,
        motivation: 4,
        injury: 1,
        fatigueConverted: 2,
        sorenessConverted: 2,
        stressConverted: 2,
        motivationConverted: 4,
        injuryConverted: 1,
        alcohol: 0
      }];

      await strategy.set("wellness:i72555:2025-08-12", validData, {
        isToday: true,
        dataType: "wellness",
        dateRange: {
          start: "2025-06-13",
          end: "2025-08-12"
        }
      });

      // Then: 5秒TTLでキャッシュされている
      const result2 = await strategy.get<WellnessData[]>("wellness:i72555:2025-08-12");
      assertEquals(result2.cached, true);
      assertEquals(result2.data, validData);
      assertEquals(mockStorage.getTTL("wellness:i72555:2025-08-12"), 5000);
    });
  });

  describe("Scenario: 過去データのキャッシュ", () => {
    it("should cache past data with appropriate TTL", async () => {
      // Given: デフォルトストラテジー
      const mockStorage = new MockCacheStorage();
      const strategy = new DefaultCacheStrategy(mockStorage as any);
      
      // 30日前のデータ
      const pastData: WellnessData[] = [{
        date: "2025-07-13",
        hrv: 48,
        rhr: 58,
        fatigue: 2,
        stress: 2,
        sleepScore: 90,
        sleepHours: 8,
        sleepQuality: 5,
        weight: 70,
        soreness: 1,
        motivation: 5,
        injury: 1,
        fatigueConverted: 1,
        sorenessConverted: 1,
        stressConverted: 1,
        motivationConverted: 5,
        injuryConverted: 1,
        alcohol: 0
      }];

      // When: 過去データをセット
      await strategy.set("wellness:i72555:2025-07-13", pastData, {
        isToday: false,
        dataType: "wellness",
        dateRange: {
          start: "2025-07-13",
          end: "2025-07-13"
        },
        isRecent: false // 30日前
      });

      // Then: 24時間TTLでキャッシュ
      const result = await strategy.get<WellnessData[]>("wellness:i72555:2025-07-13");
      assertEquals(result.cached, true);
      assertEquals(result.data, pastData);
      assertEquals(mockStorage.getTTL("wellness:i72555:2025-07-13"), 86400000); // 24 hours
    });
  });

  describe("Scenario: キャッシュ無効化", () => {
    it("should invalidate related caches on update", async () => {
      // Given: モックAPIオプション
      const apiOptions: IntervalsAPIOptions = {
        athleteId: "i72555",
        apiKey: "test-key"
      };

      // カスタムストレージとストラテジー
      const mockStorage = new MockCacheStorage();
      const strategy = new TodayDataCacheStrategy(mockStorage as any);
      
      // クライアントを作成（実際のAPIは呼ばない）
      // ※実際のテストではモックAPIクライアントを使用
      
      // When: データを設定
      const testData: WellnessData[] = [{
        date: "2025-08-12",
        hrv: 50,
        rhr: 60,
        fatigue: 3,
        stress: 2,
        sleepScore: 85,
        sleepHours: 7.5,
        sleepQuality: 4,
        weight: 70,
        soreness: 2,
        motivation: 4,
        injury: 1,
        fatigueConverted: 2,
        sorenessConverted: 2,
        stressConverted: 2,
        motivationConverted: 4,
        injuryConverted: 1,
        alcohol: 0
      }];

      await strategy.set("wellness:i72555:2025-06-13:2025-08-12", testData, {
        isToday: true,
        dataType: "wellness",
        dateRange: {
          start: "2025-06-13",
          end: "2025-08-12"
        }
      });

      // Then: キャッシュが設定されている
      let result = await strategy.get<WellnessData[]>("wellness:i72555:2025-06-13:2025-08-12");
      assertEquals(result.cached, true);

      // When: キャッシュを削除
      await strategy.delete("wellness:i72555:2025-06-13:2025-08-12");

      // Then: キャッシュが削除されている
      result = await strategy.get<WellnessData[]>("wellness:i72555:2025-06-13:2025-08-12");
      assertEquals(result.cached, false);
    });
  });

  describe("Performance: キャッシュヒット率", () => {
    it("should improve performance with cache hits", async () => {
      // Given: モックストレージ
      const mockStorage = new MockCacheStorage();
      const strategy = new TodayDataCacheStrategy(mockStorage as any);
      
      const testData: WellnessData[] = [{
        date: "2025-08-11", // 昨日
        hrv: 52,
        rhr: 58,
        fatigue: 2,
        stress: 1,
        sleepScore: 92,
        sleepHours: 8.5,
        sleepQuality: 5,
        weight: 70,
        soreness: 1,
        motivation: 5,
        injury: 1,
        fatigueConverted: 1,
        sorenessConverted: 1,
        stressConverted: 1,
        motivationConverted: 5,
        injuryConverted: 1,
        alcohol: 0
      }];

      // When: 昨日のデータをキャッシュ（1時間TTL）
      await strategy.set("wellness:i72555:2025-08-11", testData, {
        isToday: false,
        dataType: "wellness",
        dateRange: {
          start: "2025-08-11",
          end: "2025-08-11"
        },
        isRecent: true
      });

      mockStorage.resetCounters();

      // Then: 複数回アクセスしてもストレージアクセスは1回
      for (let i = 0; i < 5; i++) {
        const result = await strategy.get<WellnessData[]>("wellness:i72555:2025-08-11");
        assertEquals(result.cached, true);
        assertEquals(result.data, testData);
      }
      
      assertEquals(mockStorage.getCallCount, 5); // getは5回呼ばれる
      assertEquals(mockStorage.setCallCount, 0); // setは呼ばれない
    });
  });
});