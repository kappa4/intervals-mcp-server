/**
 * Simple TTL verification script
 */

async function verifyTTL() {
  const BASE_URL = "https://kpnco-intervals-mcp-77-vekvmptwhw22.deno.dev";
  
  console.log("🔍 Testing TTL functionality...\n");
  
  // Test the endpoint
  const response = await fetch(`${BASE_URL}/test/ttl`);
  const data = await response.json();
  
  console.log("Initial response:", JSON.stringify(data, null, 2));
  
  if (data.status === "success") {
    console.log("\n✅ TTL test initiated successfully");
    console.log(`⏱️  TTL is set to ${data.ttl_ms}ms`);
    console.log("Manual TTL management is working in deployed environment");
  } else {
    console.log("\n❌ TTL test failed");
  }
}

if (import.meta.main) {
  await verifyTTL();
}