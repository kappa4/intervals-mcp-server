#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * MCP Tools Comprehensive Test Script
 * 本番環境の全MCPツール疎通テスト
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const testResults: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    testResults.push({
      name,
      passed: true,
      message: "Passed",
      duration: Date.now() - start
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start
    });
    console.log(`❌ ${name} (${Date.now() - start}ms): ${error}`);
  }
}

async function makeRequest(
  endpoint: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return response;
}

async function runAllTests() {
  console.log("=== MCP Tools Comprehensive Test Suite ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Test 1: Health Check
  await runTest("Health Check Endpoint", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    assertEquals(response.status, 200, "Health check should return 200");
    
    const data = await response.json();
    assertEquals(data.status, "healthy", "Status should be healthy");
    assertEquals(data.cache_enabled, true, "Cache should be enabled");
    assertEquals(data.kv_enabled, true, "KV should be enabled");
    assertExists(data.athlete_id, "Athlete ID should exist");
    assertExists(data.timestamp, "Timestamp should exist");
  });

  // Test 2: Info Endpoint
  await runTest("Info Endpoint", async () => {
    const response = await fetch(`${BASE_URL}/info`);
    assertEquals(response.status, 200, "Info endpoint should return 200");
    
    const data = await response.json();
    assertEquals(data.status, "ok", "Status should be ok");
    assertEquals(data.protocol, "2024-11-05", "Protocol version should match");
    assertExists(data.athlete, "Athlete info should exist");
    assertExists(data.athlete.name, "Athlete name should exist");
    assertExists(data.endpoints, "Endpoints list should exist");
  });

  // Test 3: OAuth Metadata
  await runTest("OAuth Metadata Endpoint", async () => {
    const response = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
    assertEquals(response.status, 200, "OAuth metadata should return 200");
    
    const data = await response.json();
    assertEquals(data.issuer, BASE_URL, "Issuer should match base URL");
    assertExists(data.authorization_endpoint, "Authorization endpoint should exist");
    assertExists(data.token_endpoint, "Token endpoint should exist");
    assertExists(data.registration_endpoint, "Registration endpoint should exist");
    assert(data.response_types_supported.includes("code"), "Should support authorization code flow");
  });

  // Test 4: MCP Initialize (No Auth Required)
  await runTest("MCP Initialize", async () => {
    const response = await makeRequest("/", {
      jsonrpc: "2.0",
      id: "init-test",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      }
    });
    
    assertEquals(response.status, 200, "Initialize should return 200");
    const data = await response.json();
    
    assertExists(data.result, "Result should exist");
    assertEquals(data.result.protocolVersion, "2024-11-05", "Protocol version should match");
    assertExists(data.result.capabilities, "Capabilities should exist");
    assertExists(data.result.serverInfo, "Server info should exist");
    assertEquals(data.result.serverInfo.name, "intervals-mcp-server", "Server name should match");
  });

  // Test 5: MCP Tools List (Auth Required - Should Fail)
  await runTest("MCP Tools List (Unauthorized)", async () => {
    const response = await makeRequest("/", {
      jsonrpc: "2.0",
      id: "tools-test",
      method: "tools/list"
    });
    
    assertEquals(response.status, 401, "Should return 401 Unauthorized");
    const data = await response.json();
    assertEquals(data.error, "unauthorized", "Should return unauthorized error");
    assertExists(data.error_description, "Error description should exist");
  });

  // Test 6: OAuth Client Registration
  await runTest("OAuth Client Registration", async () => {
    const response = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_name: "Test Suite Client",
        redirect_uri: "https://claude.ai/oauth/callback"
      })
    });
    
    // Registration might return 400 if redirect_uri is not whitelisted
    assert(response.status === 201 || response.status === 400, `Registration should return 201 or 400, got ${response.status}`);
    const data = await response.json();
    
    if (response.status === 201) {
      assertExists(data.client_id, "Client ID should exist");
      assert(data.client_id.startsWith("cli_"), "Client ID should have correct prefix");
      assertExists(data.client_secret, "Client secret should exist");
      assertEquals(data.client_name, "Test Suite Client", "Client name should match");
      assertEquals(data.redirect_uri, "https://claude.ai/oauth/callback", "Redirect URI should match");
    } else {
      // If 400, verify it's a validation error
      assertExists(data.error, "Error should exist for 400 response");
      assertEquals(response.status, 400, "Should return 400 for invalid request");
    }
  });

  // Test 7: Invalid Method Handling
  await runTest("Invalid MCP Method", async () => {
    const response = await makeRequest("/", {
      jsonrpc: "2.0",
      id: "invalid-test",
      method: "invalid/method"
    });
    
    // Invalid method should return 401 (unauthorized) without auth
    assertEquals(response.status, 401, "Invalid method should return 401 without auth");
    const data = await response.json();
    // The response might not be JSON-RPC format for unauthorized requests
    assertExists(data.error || data.jsonrpc, "Should have error or be JSON-RPC format");
  });

  // Test 8: CORS Headers
  await runTest("CORS Headers Present", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    
    const corsOrigin = response.headers.get("Access-Control-Allow-Origin");
    assertEquals(corsOrigin, "*", "CORS origin should be *");
    
    const corsMethods = response.headers.get("Access-Control-Allow-Methods");
    assertExists(corsMethods, "CORS methods should be present");
    assert(corsMethods.includes("POST"), "Should allow POST");
    assert(corsMethods.includes("GET"), "Should allow GET");
  });

  // Test Summary
  console.log("\n=== Test Summary ===");
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log(`Average Duration: ${(totalDuration / testResults.length).toFixed(2)}ms`);
  
  // Print failed tests details
  if (failed > 0) {
    console.log("\n=== Failed Tests ===");
    testResults.filter(r => !r.passed).forEach(result => {
      console.log(`❌ ${result.name}: ${result.message}`);
    });
  }
  
  // Exit with appropriate code
  if (failed > 0) {
    console.log("\n❌ Test suite failed");
    Deno.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    Deno.exit(0);
  }
}

// Run tests
if (import.meta.main) {
  await runAllTests();
}