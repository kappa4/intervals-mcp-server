#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Quick MCP Tools Test
 * 各ツールを個別にテスト
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";
const ACCESS_TOKEN = Deno.env.get("TEST_ACCESS_TOKEN") || "IHjPhMwHkH9D6nnaD_QPXUnak1e4O-kV711HZJNEVDw";

async function callTool(name: string, args: any = {}) {
  const response = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `test-${Date.now()}`,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    })
  });
  
  const result = await response.json();
  return result;
}

async function testTool(name: string, args: any = {}) {
  console.log(`\n=== Testing ${name} ===`);
  console.log("Arguments:", JSON.stringify(args, null, 2));
  
  try {
    const result = await callTool(name, args);
    
    if (result.error) {
      console.error("❌ Error:", result.error);
      return false;
    }
    
    if (result.result?.isError) {
      console.error("❌ Tool returned error:", result.result.content[0]?.text);
      return false;
    }
    
    console.log("✅ Success!");
    console.log("Result:", JSON.stringify(result.result, null, 2));
    return true;
    
  } catch (error) {
    console.error("❌ Exception:", error);
    return false;
  }
}

async function main() {
  console.log("=== Quick MCP Tools Test ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Token: ${ACCESS_TOKEN.substring(0, 10)}...`);
  
  // 1. get_activities
  await testTool("get_activities", { limit: 2 });
  
  // 2. get_activity (with valid ID)
  await testTool("get_activity", { activity_id: "i89274717" });
  
  // 3. get_wellness
  const today = new Date().toISOString().split('T')[0];
  await testTool("get_wellness", { date: today });
  
  // 4. get_athlete_info
  await testTool("get_athlete_info", {});
  
  // 5. get_ucr_assessment
  await testTool("get_ucr_assessment", { date: today });
  
  // 6. calculate_ucr_trends
  await testTool("calculate_ucr_trends", { days: 7 });
  
  // 7. check_ucr_setup
  await testTool("check_ucr_setup", {});
  
  // 8. batch_calculate_ucr
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  await testTool("batch_calculate_ucr", {
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0]
  });
  
  console.log("\n=== Test Complete ===");
}

if (import.meta.main) {
  await main();
}