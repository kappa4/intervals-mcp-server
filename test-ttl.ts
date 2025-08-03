/**
 * TTL test script for Deno KV expireIn functionality
 */

import { WellnessCache } from "./cache/wellness-cache.ts";
import { getWellnessCacheKey } from "./cache/cache-utils.ts";

// Set up test environment
Deno.env.set("CACHE_ENABLED", "true");
Deno.env.set("CACHE_DEBUG", "true");
Deno.env.set("DEPLOY_VERSION", "ttl-test-v1");

async function testTTL() {
  console.log("🧪 Starting TTL test...\n");
  
  const cache = new WellnessCache();
  const key = getWellnessCacheKey("test123", "2025-01-01");
  const testData = { 
    test: "TTL test data", 
    timestamp: new Date().toISOString() 
  };
  
  try {
    // Test 1: Set with 3 second TTL
    console.log("1️⃣ Setting data with 3 second TTL...");
    const ttlMs = 3000; // 3 seconds
    const setResult = await cache.set(key, testData, ttlMs);
    console.log(`   Set result: ${JSON.stringify(setResult, null, 2)}`);
    
    // Test 2: Immediate get (should hit)
    console.log("\n2️⃣ Immediate get (should hit)...");
    const getResult1 = await cache.get(key);
    console.log(`   Get result: cached=${getResult1.cached}, hit=${getResult1.metrics?.cacheHit}`);
    if (getResult1.data) {
      console.log(`   Data retrieved: ${JSON.stringify(getResult1.data)}`);
    }
    
    // Test 3: Wait 2 seconds and get (should still hit)
    console.log("\n3️⃣ Waiting 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const getResult2 = await cache.get(key);
    console.log(`   Get result: cached=${getResult2.cached}, hit=${getResult2.metrics?.cacheHit}`);
    
    // Test 4: Wait another 2 seconds (total 4s, should miss)
    console.log("\n4️⃣ Waiting another 2 seconds (total 4s, TTL should expire)...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const getResult3 = await cache.get(key);
    console.log(`   Get result: cached=${getResult3.cached}, hit=${getResult3.metrics?.cacheHit}`);
    
    // Test 5: Verify data is gone
    if (!getResult3.cached) {
      console.log("   ✅ TTL worked correctly! Data expired after 3 seconds.");
    } else {
      console.log("   ❌ TTL did not work as expected. Data still in cache.");
    }
    
    // Display metrics
    console.log("\n📊 Cache Metrics:");
    const metrics = cache.getMetrics();
    console.log(`   Total hits: ${metrics.totalHits}`);
    console.log(`   Total misses: ${metrics.totalMisses}`);
    console.log(`   Hit rate: ${metrics.hitRate.toFixed(2)}%`);
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await cache.close();
    console.log("\n✨ TTL test completed.");
  }
}

// Run the test
if (import.meta.main) {
  await testTTL();
}