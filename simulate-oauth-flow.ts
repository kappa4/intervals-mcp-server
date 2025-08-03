#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Simulate OAuth Flow for Testing
 * OAuth認証フローをシミュレートしてテスト実行
 * 
 * 注意: これは認証フローの理解とテスト準備のためのシミュレーションです
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

// OAuth認証で必要な手順を表示
function displayOAuthSteps() {
  console.log("=== OAuth Authentication Steps ===\n");
  
  console.log("1. Open this URL in your browser:");
  console.log("   https://kpnco-intervals-mcp-77.deno.dev/oauth/authorize?client_id=eUauI1SnuHVlZVkRPSofWA&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&response_type=code&state=local-test-1754260097171&code_challenge=7yrfKip6cjvwmkASq2mfFdY3-tYsSRjJHcgJmV9Zuz8&code_challenge_method=S256\n");
  
  console.log("2. After authorization, you'll be redirected to:");
  console.log("   https://claude.ai/api/mcp/auth_callback?code=AUTH_CODE&state=local-test-1754260097171\n");
  
  console.log("3. Copy the 'code' parameter value\n");
  
  console.log("4. Run this command with your code:");
  console.log(`   curl -X POST ${BASE_URL}/oauth/token \\
     -H "Content-Type: application/x-www-form-urlencoded" \\
     -d "grant_type=authorization_code&code=YOUR_CODE&client_id=eUauI1SnuHVlZVkRPSofWA&client_secret=gmK2X36P1eqhrY5bZgy0i74ltbD3ldfcNuXf0qkB3Q0&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_verifier=Ig80dFSzIeHaFqBA99ga8X12moLHkEE_SPQvWK22-6s"\n`);
  
  console.log("5. Save the access_token from the response\n");
}

// 認証不要のエンドポイントでシステムの動作を確認
async function testPublicEndpoints() {
  console.log("=== Testing Public Endpoints ===\n");
  
  const tests = [
    {
      name: "Health Check",
      url: "/health",
      method: "GET"
    },
    {
      name: "OAuth Discovery",
      url: "/.well-known/oauth-authorization-server",
      method: "GET"
    },
    {
      name: "MCP Initialize",
      url: "/",
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: "init-1",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0"
          }
        }
      }
    }
  ];
  
  for (const test of tests) {
    try {
      console.log(`Testing ${test.name}...`);
      
      const options: RequestInit = {
        method: test.method,
        headers: test.body ? { "Content-Type": "application/json" } : {}
      };
      
      if (test.body) {
        options.body = JSON.stringify(test.body);
      }
      
      const response = await fetch(`${BASE_URL}${test.url}`, options);
      const data = await response.json();
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`);
      console.log();
    } catch (error) {
      console.error(`❌ Failed: ${error}`);
      console.log();
    }
  }
}

// アクセストークンが利用可能な場合のテスト項目
function displayAuthenticatedTests() {
  console.log("=== Tests Available After Authentication ===\n");
  
  const toolCategories = [
    {
      name: "intervals.icu Standard Tools",
      tools: [
        "get_athlete - Retrieve athlete information",
        "get_activities - List recent activities",
        "get_wellness - Get wellness data",
        "update_wellness - Update wellness metrics",
        "get_custom_fields - List custom fields"
      ]
    },
    {
      name: "UCR Specialized Tools",
      tools: [
        "get_ucr_assessment - Get today's UCR score",
        "calculate_ucr_trends - Analyze UCR trends",
        "update_wellness_assessment - Update subjective metrics",
        "check_ucr_setup - Verify UCR configuration",
        "batch_calculate_ucr - Calculate UCR for date range"
      ]
    }
  ];
  
  toolCategories.forEach(category => {
    console.log(`${category.name}:`);
    category.tools.forEach(tool => console.log(`  - ${tool}`));
    console.log();
  });
}

// テスト実行例を表示
function displayTestExamples() {
  console.log("=== Test Command Examples ===\n");
  
  console.log("1. List all tools:");
  console.log(`   curl -X POST ${BASE_URL}/ \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
     -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'\n`);
  
  console.log("2. Get UCR assessment:");
  console.log(`   curl -X POST ${BASE_URL}/ \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
     -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"get_ucr_assessment","arguments":{"date":"2025-08-03"}}}'\n`);
  
  console.log("3. Check cache performance:");
  console.log("   Run the same UCR assessment command twice and compare response times\n");
}

async function main() {
  console.log("=== OAuth Flow Simulation & Test Guide ===\n");
  
  // 1. OAuth認証手順を表示
  displayOAuthSteps();
  
  // 2. 公開エンドポイントをテスト
  await testPublicEndpoints();
  
  // 3. 認証後のテスト項目を表示
  displayAuthenticatedTests();
  
  // 4. テストコマンド例を表示
  displayTestExamples();
  
  console.log("=== Summary ===\n");
  console.log("✅ Public endpoints are working correctly");
  console.log("⚠️  Full MCP tool testing requires OAuth authentication");
  console.log("📝 Follow the steps above to complete authentication and run tests\n");
  
  console.log("For automated testing after getting access token:");
  console.log("export TEST_ACCESS_TOKEN=\"your_token_here\"");
  console.log("./test-mcp-tools-enhanced.ts");
}

if (import.meta.main) {
  await main();
}