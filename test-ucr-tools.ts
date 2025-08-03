#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test UCR tools through direct API calls
 * This helps identify authentication and functionality issues
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";
const ATHLETE_ID = Deno.env.get("ATHLETE_ID") || "i72555";
const API_KEY = Deno.env.get("API_KEY");

if (!API_KEY) {
  console.error("❌ API_KEY environment variable is required");
  Deno.exit(1);
}

console.log("🧪 Testing UCR Tools on production deployment");
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(`🏃 Athlete ID: ${ATHLETE_ID}\n`);

// Test 1: Direct intervals.icu API test
async function testDirectAPI() {
  console.log("1️⃣ Testing direct intervals.icu API access...");
  
  const today = new Date().toISOString().split('T')[0];
  const url = `https://intervals.icu/api/v1/athlete/${ATHLETE_ID}/wellness/${today}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Basic ${btoa(`API_KEY:${API_KEY}`)}`
      }
    });
    
    if (response.ok) {
      console.log("   ✅ Direct API access successful");
      const data = await response.json();
      console.log(`   📊 Today's wellness data exists: ${!!data}`);
    } else {
      console.log(`   ❌ Direct API failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Direct API error: ${error.message}`);
  }
}

// Test 2: Test OAuth registration flow
async function testOAuthRegistration() {
  console.log("\n2️⃣ Testing OAuth client registration...");
  
  try {
    const response = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_name: "UCR Test Client",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      })
    });
    
    if (response.ok) {
      const client = await response.json();
      console.log("   ✅ Client registration successful");
      console.log(`   📝 Client ID: ${client.client_id}`);
      return client;
    } else {
      const error = await response.text();
      console.log(`   ❌ Registration failed: ${response.status} - ${error}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Registration error: ${error.message}`);
    return null;
  }
}

// Test 3: Test MCP endpoints without auth
async function testMCPWithoutAuth() {
  console.log("\n3️⃣ Testing MCP endpoints without authentication...");
  
  const endpoints = [
    { method: "initialize", params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" }
    }},
    { method: "tools/list", params: {} },
  ];
  
  for (const endpoint of endpoints) {
    console.log(`   Testing ${endpoint.method}...`);
    try {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: endpoint.method,
          params: endpoint.params
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ ${endpoint.method} succeeded`);
        if (endpoint.method === "tools/list" && data.result?.tools) {
          const ucrTools = data.result.tools.filter(t => t.name.includes("ucr"));
          console.log(`   📋 Found ${ucrTools.length} UCR tools`);
        }
      } else {
        const error = await response.text();
        console.log(`   ❌ ${endpoint.method} failed: ${response.status} - ${error}`);
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint.method} error: ${error.message}`);
    }
  }
}

// Test 4: Test direct tool handler (simulate internal call)
async function testDirectToolHandler() {
  console.log("\n4️⃣ Testing UCR tool handler directly (if exposed)...");
  
  // This simulates what the MCP handler would do internally
  const toolsToTest = [
    { name: "get_ucr_assessment", args: {} },
    { name: "check_ucr_setup", args: {} },
  ];
  
  console.log("   ⚠️  Direct tool handler testing requires authentication setup");
  console.log("   💡 This would need a valid OAuth token from the authorization flow");
}

// Test 5: Check server info endpoint
async function testServerInfo() {
  console.log("\n5️⃣ Testing server info endpoint...");
  
  try {
    const response = await fetch(`${BASE_URL}/info`);
    if (response.ok) {
      const info = await response.json();
      console.log("   ✅ Server info retrieved");
      console.log(`   🔧 KV enabled: ${info.kv_enabled}`);
      console.log(`   💾 Cache enabled: ${info.cache_enabled}`);
      console.log(`   🏃 Athlete ID: ${info.athlete_id}`);
    } else {
      console.log(`   ❌ Info endpoint failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Info error: ${error.message}`);
  }
}

// Run all tests
async function runTests() {
  await testDirectAPI();
  const client = await testOAuthRegistration();
  await testMCPWithoutAuth();
  await testDirectToolHandler();
  await testServerInfo();
  
  console.log("\n📊 Test Summary:");
  console.log("The UCR tools require OAuth authentication to work properly.");
  console.log("Claude needs to complete the OAuth flow to access the tools.");
  
  if (client) {
    console.log("\n🔑 Next Steps for Claude:");
    console.log("1. Use the client_id to initiate OAuth authorization");
    console.log("2. Complete the authorization flow to get an access token");
    console.log("3. Use the access token to call MCP tools");
  }
}

if (import.meta.main) {
  await runTests();
}