/**
 * Test cache integration with UCRIntervalsClient
 */

import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";
import { log } from "./logger.ts";

// Set up test environment
Deno.env.set("CACHE_ENABLED", "true");
Deno.env.set("CACHE_DEBUG", "true");
Deno.env.set("ATHLETE_ID", Deno.env.get("ATHLETE_ID") || "i72555");
Deno.env.set("API_KEY", Deno.env.get("API_KEY") || "test");
Deno.env.set("LOG_LEVEL", "DEBUG");

async function testCacheIntegration() {
  console.log("🧪 Testing cache integration with UCRIntervalsClient...\n");
  
  const client = new CachedUCRIntervalsClient({
    athlete_id: Deno.env.get("ATHLETE_ID")!,
    api_key: Deno.env.get("API_KEY")!,
  });
  
  try {
    const targetDate = "2025-01-01";
    
    // Test 1: First call (should miss cache and fetch from API)
    console.log("1️⃣ First call - expecting cache miss...");
    const start1 = performance.now();
    const data1 = await client.getWellnessDataForUCR(targetDate, 7);
    const time1 = performance.now() - start1;
    console.log(`   Retrieved ${data1.length} entries in ${time1.toFixed(2)}ms`);
    
    // Test 2: Second call (should hit cache)
    console.log("\n2️⃣ Second call - expecting cache hit...");
    const start2 = performance.now();
    const data2 = await client.getWellnessDataForUCR(targetDate, 7);
    const time2 = performance.now() - start2;
    console.log(`   Retrieved ${data2.length} entries in ${time2.toFixed(2)}ms`);
    
    // Compare times
    const speedup = time1 / time2;
    console.log(`\n📊 Cache speedup: ${speedup.toFixed(1)}x faster`);
    
    // Get cache metrics
    const metrics = client.getCacheMetrics();
    console.log("\n📈 Cache Metrics:");
    console.log(`   Hit rate: ${metrics.hitRate.toFixed(1)}%`);
    console.log(`   Total hits: ${metrics.totalHits}`);
    console.log(`   Total misses: ${metrics.totalMisses}`);
    console.log(`   API call reduction: ${metrics.apiCallReduction.toFixed(1)}%`);
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await client.close();
    console.log("\n✨ Cache integration test completed.");
  }
}

// Run the test
if (import.meta.main) {
  await testCacheIntegration();
}