/**
 * TTL test script via API endpoints
 */

const BASE_URL = "https://kpnco-intervals-mcp-77-5vksqn5hph23.deno.dev";

async function testTTLViaAPI() {
  console.log("🧪 Testing TTL via deployed API...\n");
  
  try {
    // Test health endpoint first
    console.log("1️⃣ Testing health endpoint...");
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log(`   Health: ${healthData.status}, KV: ${healthData.kv_enabled}`);
    
    if (!healthData.kv_enabled) {
      console.log("❌ KV is not enabled in deployment!");
      return;
    }
    
    // Test info endpoint
    console.log("\n2️⃣ Testing info endpoint...");
    const infoRes = await fetch(`${BASE_URL}/info`);
    const infoData = await infoRes.json();
    console.log(`   Server: ${infoData.name} v${infoData.version}`);
    console.log(`   Cache Config: ${JSON.stringify(infoData.cache_config)}`);
    
    console.log("\n✅ API endpoints are working!");
    console.log("ℹ️  Note: Direct cache testing requires MCP interface or custom test endpoints");
    
  } catch (error) {
    console.error("❌ API test failed:", error);
  }
}

// Run the test
if (import.meta.main) {
  await testTTLViaAPI();
}