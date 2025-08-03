#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * MCP Tools Comprehensive Test Script
 * 本番環境の全MCPツール疎通テスト
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

interface TestResult {
  endpoint: string;
  method: string;
  success: boolean;
  responseTime: number;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

async function testEndpoint(
  endpoint: string,
  method: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<TestResult> {
  const start = Date.now();
  const url = `${BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });
    
    const responseTime = Date.now() - start;
    const data = await response.json();
    
    const result: TestResult = {
      endpoint,
      method: body.method || method,
      success: response.ok && !data.error,
      responseTime,
      response: data
    };
    
    if (!result.success) {
      result.error = data.error || data.error_description || "Unknown error";
    }
    
    results.push(result);
    return result;
  } catch (error) {
    const result: TestResult = {
      endpoint,
      method: body.method || method,
      success: false,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
    results.push(result);
    return result;
  }
}

async function runTests() {
  console.log("=== MCP Tools Comprehensive Test ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // 1. Health Check
  console.log("1. Testing Health Check...");
  const healthResponse = await fetch(`${BASE_URL}/health`);
  const healthData = await healthResponse.json();
  console.log("Health Status:", healthData.status);
  console.log("Cache Enabled:", healthData.cache_enabled);
  console.log("KV Enabled:", healthData.kv_enabled);
  console.log("");

  // 2. Initialize (認証不要)
  console.log("2. Testing Initialize (No Auth Required)...");
  const initResult = await testEndpoint("/", "initialize", {
    jsonrpc: "2.0",
    id: "init-test",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "mcp-test-client",
        version: "1.0.0"
      }
    }
  });
  console.log(`Result: ${initResult.success ? "✅ Success" : "❌ Failed"}`);
  console.log(`Response Time: ${initResult.responseTime}ms`);
  if (!initResult.success) {
    console.log(`Error: ${initResult.error}`);
  }
  console.log("");

  // 3. Tools List (認証必要 - 失敗想定)
  console.log("3. Testing Tools List (Auth Required - Expected to Fail)...");
  const toolsResult = await testEndpoint("/", "tools/list", {
    jsonrpc: "2.0",
    id: "tools-test",
    method: "tools/list"
  });
  console.log(`Result: ${toolsResult.success ? "✅ Success" : "❌ Failed (Expected)"}`);
  console.log(`Response Time: ${toolsResult.responseTime}ms`);
  console.log(`Error: ${toolsResult.error}`);
  console.log("");

  // 4. OAuth Server Metadata
  console.log("4. Testing OAuth Server Metadata...");
  const oauthMetaResponse = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
  const oauthMeta = await oauthMetaResponse.json();
  console.log("OAuth Issuer:", oauthMeta.issuer);
  console.log("Authorization Endpoint:", oauthMeta.authorization_endpoint);
  console.log("Token Endpoint:", oauthMeta.token_endpoint);
  console.log("");

  // 5. Test Summary
  console.log("=== Test Summary ===");
  console.log(`Total Tests: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  console.log("");

  // 6. Performance Summary
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
  console.log("=== Performance Summary ===");
  console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`Fastest: ${Math.min(...results.map(r => r.responseTime))}ms`);
  console.log(`Slowest: ${Math.max(...results.map(r => r.responseTime))}ms`);
  console.log("");

  // 7. Available Tools (from expected response)
  console.log("=== Expected Available Tools ===");
  console.log("intervals.icu Tools:");
  console.log("  - get_athlete");
  console.log("  - get_activities");
  console.log("  - get_wellness");
  console.log("  - update_wellness");
  console.log("  - get_custom_fields");
  console.log("");
  console.log("UCR Tools:");
  console.log("  - get_ucr_assessment");
  console.log("  - calculate_ucr_trends");
  console.log("  - update_wellness_assessment");
  console.log("  - check_ucr_setup");
  console.log("  - batch_calculate_ucr");
  console.log("");

  // 8. Next Steps
  console.log("=== Next Steps ===");
  console.log("1. Register OAuth client with Claude.ai redirect URI");
  console.log("2. Complete OAuth flow to get access token");
  console.log("3. Test all tools with proper authentication");
  console.log("4. Verify cache functionality with repeated calls");
}

// Run tests
if (import.meta.main) {
  await runTests();
}