/**
 * Unit tests for cache utilities
 */

import { assertEquals, assert, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  getWellnessCacheKey,
  getActivitiesCacheKey,
  getAthleteCacheKey,
  getMetadataCacheKey,
  parseDateRange,
  formatDateRange,
  isCacheFresh,
  formatSize,
  batchCacheKeys,
  extractAthleteId,
  isWellnessKey,
  isActivitiesKey,
  getCacheKeyPattern,
} from "../../../cache/cache-utils.ts";

describe("Cache Utils", () => {
  describe("Cache Key Generation", () => {
    it("should generate wellness cache key", () => {
      const key = getWellnessCacheKey("i123456", "2025-01-01");
      assertEquals(key, "wellness:i123456:2025-01-01");
    });

    it("should generate activities cache key", () => {
      const key = getActivitiesCacheKey("i123456", "2025-01-01:2025-01-31");
      assertEquals(key, "activities:i123456:2025-01-01:2025-01-31");
    });

    it("should generate athlete cache key", () => {
      const key = getAthleteCacheKey("i123456");
      assertEquals(key, "athlete:i123456");
    });

    it("should generate metadata cache key", () => {
      const key = getMetadataCacheKey("ucr-config");
      assertEquals(key, "meta:ucr-config");
    });
  });

  describe("Date Range Utilities", () => {
    it("should parse date range", () => {
      const range = parseDateRange("2025-01-01:2025-01-31");
      assertEquals(range, { start: "2025-01-01", end: "2025-01-31" });
    });

    it("should throw on invalid date range", () => {
      assertThrows(
        () => parseDateRange("2025-01-01"),
        Error,
        "Invalid date range format"
      );
    });

    it("should format date range", () => {
      const formatted = formatDateRange("2025-01-01", "2025-01-31");
      assertEquals(formatted, "2025-01-01:2025-01-31");
    });
  });

  describe("Cache Freshness", () => {
    it("should detect fresh cache", () => {
      const now = new Date().toISOString();
      const ttlSeconds = 3600; // 1 hour
      
      assert(isCacheFresh(now, ttlSeconds));
    });

    it("should detect stale cache", () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const ttlSeconds = 3600; // 1 hour
      
      assert(!isCacheFresh(oldDate, ttlSeconds));
    });
  });

  describe("Size Formatting", () => {
    it("should format bytes", () => {
      assertEquals(formatSize(512), "512 B");
    });

    it("should format kilobytes", () => {
      assertEquals(formatSize(2048), "2.00 KB");
    });

    it("should format megabytes", () => {
      assertEquals(formatSize(1024 * 1024 * 1.5), "1.50 MB");
    });
  });

  describe("Batch Operations", () => {
    it("should batch cache keys", () => {
      const keys = Array.from({ length: 25 }, (_, i) => `key${i}`);
      const batches = batchCacheKeys(keys, 10);
      
      assertEquals(batches.length, 3);
      assertEquals(batches[0].length, 10);
      assertEquals(batches[1].length, 10);
      assertEquals(batches[2].length, 5);
    });

    it("should handle empty array", () => {
      const batches = batchCacheKeys([]);
      assertEquals(batches.length, 0);
    });
  });

  describe("Key Parsing", () => {
    it("should extract athlete ID from wellness key", () => {
      const athleteId = extractAthleteId("v1:wellness:i123456:2025-01-01");
      assertEquals(athleteId, "i123456");
    });

    it("should extract athlete ID from activities key", () => {
      const athleteId = extractAthleteId("v1:activities:i789012:2025-01-01:2025-01-31");
      assertEquals(athleteId, "i789012");
    });

    it("should return null for invalid key", () => {
      const athleteId = extractAthleteId("invalid-key");
      assertEquals(athleteId, null);
    });
  });

  describe("Key Type Detection", () => {
    it("should detect wellness keys", () => {
      assert(isWellnessKey("v1:wellness:i123456:2025-01-01"));
      assert(!isWellnessKey("v1:activities:i123456:2025-01-01"));
    });

    it("should detect activities keys", () => {
      assert(isActivitiesKey("v1:activities:i123456:2025-01-01"));
      assert(!isActivitiesKey("v1:wellness:i123456:2025-01-01"));
    });
  });

  describe("Key Pattern Generation", () => {
    it("should generate pattern for wellness data type", () => {
      const pattern = getCacheKeyPattern("wellness");
      assertEquals(pattern, "*:wellness:*");
    });

    it("should generate pattern for specific athlete", () => {
      const pattern = getCacheKeyPattern("activities", "i123456");
      assertEquals(pattern, "*:activities:i123456*");
    });
  });
});