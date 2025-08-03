/**
 * Cache integration tests
 * Tests the complete cache functionality with UCR calculations
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { CachedUCRIntervalsClient } from "../../ucr-intervals-client-cached.ts";
import { WellnessCache } from "../../cache/wellness-cache.ts";
import { getWellnessCacheKey, formatDateRange } from "../../cache/cache-utils.ts";

// Mock API options for testing
const TEST_API_OPTIONS = {
  athlete_id: "test-athlete",
  api_key: "test-key"
};

Deno.test("CachedUCRIntervalsClient - cache integration", async (t) => {
  const client = new CachedUCRIntervalsClient(TEST_API_OPTIONS);
  const cache = new WellnessCache();

  await t.step("should cache wellness data on first fetch", async () => {
    const targetDate = "2024-01-15";
    const lookbackDays = 7;
    
    // Mock the parent class method
    const originalMethod = client.getWellnessDataForUCR;
    let apiCallCount = 0;
    
    // Override to track API calls
    client.getWellnessDataForUCR = async function(date: string, days: number) {
      apiCallCount++;
      // Return mock data
      return [{
        date: targetDate,
        hrv_morning: 50,
        resting_hr: 60,
        sleep_hours: 8,
        sleep_quality: 4,
        fatigue: 3,
        stress: 2,
        motivation: 4,
        soreness: 1,
        injury: 1,
        notes: "Test data"
      }];
    };

    // First call - should hit API
    const data1 = await client.getWellnessDataForUCR(targetDate, lookbackDays);
    assertEquals(apiCallCount, 1);
    assertExists(data1);
    assertEquals(data1.length, 1);

    // Second call - should hit cache
    const data2 = await client.getWellnessDataForUCR(targetDate, lookbackDays);
    assertEquals(apiCallCount, 1); // No additional API call
    assertEquals(data1, data2); // Same data

    // Restore original method
    client.getWellnessDataForUCR = originalMethod;
  });

  await t.step("should invalidate cache on wellness update", async () => {
    const date = "2024-01-15";
    
    // Pre-populate cache
    const cacheKey = getWellnessCacheKey(TEST_API_OPTIONS.athlete_id, date);
    await cache.set(cacheKey, { cached: true }, 60000);

    // Verify cache exists
    const beforeUpdate = await cache.get(cacheKey);
    assertEquals(beforeUpdate.cached, true);

    // Mock the update method
    const originalUpdate = (client as any).updateWellnessEntry;
    (client as any).updateWellnessEntry = async () => ({ date });

    // Update wellness - should invalidate cache
    await client.updateWellnessAndRecalculateUCR(date, { fatigue: 2 });

    // Verify cache was invalidated
    const afterUpdate = await cache.get(cacheKey);
    assertEquals(afterUpdate.cached, false);

    // Restore original method
    (client as any).updateWellnessEntry = originalUpdate;
  });

  await t.step("should get cache metrics", () => {
    const metrics = client.getCacheMetrics();
    assertExists(metrics);
    assertExists(metrics.hitRate);
    assertExists(metrics.missRate);
    assertExists(metrics.responseTime);
  });

  await t.step("should get cache statistics", () => {
    const stats = client.getCacheStatistics();
    assertExists(stats);
    assertExists(stats.totalHits);
    assertExists(stats.totalMisses);
    assertExists(stats.hitRate);
  });

  await t.step("should get cache warmer status", () => {
    const status = client.getCacheWarmerStatus();
    assertExists(status);
    assertExists(status.enabled);
  });

  await t.step("should get background updater status", () => {
    const status = client.getBackgroundUpdaterStatus();
    assertExists(status);
    assertExists(status.isRunning);
    assertExists(status.queueLength);
    assertExists(status.inProgress);
  });

  // Cleanup
  await cache.close();
  await client.close();
});

Deno.test("WellnessCache - TTL handling", async (t) => {
  const cache = new WellnessCache();

  await t.step("should expire entries based on TTL", async () => {
    const key = "wellness:test-athlete:2024-01-15";
    const value = { test: "data" };
    const ttl = 100; // 100ms TTL

    // Set with short TTL
    await cache.set(key, value, ttl);

    // Immediate get should return value
    const result1 = await cache.get(key);
    assertEquals(result1.cached, true);
    assertEquals(result1.data, value);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be expired
    const result2 = await cache.get(key);
    assertEquals(result2.cached, false);
  });

  // Cleanup
  await cache.close();
});

Deno.test("Cache warming functionality", async (t) => {
  const client = new CachedUCRIntervalsClient(TEST_API_OPTIONS);
  const cache = new WellnessCache();

  await t.step("should warm cache for common date ranges", async () => {
    // Mock the API calls
    const originalMethod = client.getWellnessDataForUCR;
    const warmedRanges: string[] = [];
    
    client.getWellnessDataForUCR = async function(date: string, days: number) {
      warmedRanges.push(`${date}:${days}`);
      return [{
        date,
        hrv_morning: 50,
        resting_hr: 60,
        sleep_hours: 8,
        sleep_quality: 4,
        fatigue: 3,
        stress: 2,
        motivation: 4,
        soreness: 1,
        injury: 1,
        notes: "Warmed data"
      }];
    };

    // Warm cache
    const warmer = (client as any).cacheWarmer;
    if (warmer) {
      await warmer.warmCommonDateRanges();
      // Should have warmed multiple ranges
      assertEquals(warmedRanges.length > 0, true);
    }

    // Restore
    client.getWellnessDataForUCR = originalMethod;
  });

  // Cleanup
  await cache.close();
  await client.close();
});