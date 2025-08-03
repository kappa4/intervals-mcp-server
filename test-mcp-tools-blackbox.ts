#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * MCP Tools Black Box Test
 * 本番環境の全MCPツールを実際に実行するブラックボックステスト
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface TestContext {
  accessToken: string;
  tools: MCPTool[];
  originalData: Map<string, any>;
}

// OAuth認証用の環境変数チェック
function checkEnvironment() {
  const required = {
    TEST_CLIENT_ID: "OAuth Client ID for testing",
    TEST_CLIENT_SECRET: "OAuth Client Secret for testing",
    TEST_ACCESS_TOKEN: "Valid access token for testing"
  };

  const missing: string[] = [];
  for (const [key, desc] of Object.entries(required)) {
    if (!Deno.env.get(key)) {
      missing.push(`${key}: ${desc}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach(m => console.error(`  ${m}`));
    console.error("\nTo run this test, you need to:");
    console.error("1. Register an OAuth client");
    console.error("2. Complete OAuth flow to get access token");
    console.error("3. Set environment variables");
    Deno.exit(1);
  }
}

// MCPリクエストを送信
async function makeMCPRequest(
  method: string,
  params: any = {},
  accessToken?: string
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`MCP Error: ${data.error.message || data.error}`);
  }

  return data.result;
}

// ツール一覧を取得
async function getTools(accessToken: string): Promise<MCPTool[]> {
  console.log("Fetching tools list...");
  const result = await makeMCPRequest("tools/list", {}, accessToken);
  
  assertExists(result.tools, "Tools array should exist");
  assert(Array.isArray(result.tools), "Tools should be an array");
  assert(result.tools.length > 0, "Should have at least one tool");
  
  console.log(`Found ${result.tools.length} tools`);
  return result.tools;
}

// ツールを実行
async function callTool(
  toolName: string,
  args: any,
  accessToken: string
): Promise<any> {
  const result = await makeMCPRequest("tools/call", {
    name: toolName,
    arguments: args
  }, accessToken);
  
  return result;
}

// 読み取り専用ツールのテスト
async function testReadOnlyTool(
  tool: MCPTool,
  ctx: TestContext
): Promise<void> {
  console.log(`  Testing ${tool.name} (read-only)...`);
  
  // パラメータを準備
  const args: Record<string, any> = {};
  
  // 必須パラメータに適切なデフォルト値を設定
  if (tool.inputSchema.properties) {
    for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
      // デフォルト値の設定
      if (schema.type === "string") {
        if (key === "date") {
          args[key] = new Date().toISOString().split('T')[0];
        } else if (key === "start_date") {
          const date = new Date();
          date.setDate(date.getDate() - 7);
          args[key] = date.toISOString().split('T')[0];
        } else if (key === "end_date") {
          args[key] = new Date().toISOString().split('T')[0];
        } else {
          args[key] = schema.default || "";
        }
      } else if (schema.type === "boolean") {
        args[key] = schema.default || false;
      } else if (schema.type === "integer" || schema.type === "number") {
        args[key] = schema.default || 0;
      }
    }
  }
  
  const result = await callTool(tool.name, args, ctx.accessToken);
  
  assertExists(result, `${tool.name} should return a result`);
  
  // 結果の基本的な検証
  if (result.content) {
    assert(Array.isArray(result.content), "Content should be an array");
    assert(result.content.length > 0, "Content should not be empty");
    assertEquals(result.content[0].type, "text", "Content type should be text");
  }
  
  console.log(`    ✅ ${tool.name} executed successfully`);
}

// 書き込み可能ツールのテスト
async function testWritableTool(
  tool: MCPTool,
  ctx: TestContext
): Promise<void> {
  console.log(`  Testing ${tool.name} (with rollback)...`);
  
  // まず現在のデータを取得して保存
  let originalData: any = null;
  const today = new Date().toISOString().split('T')[0];
  
  if (tool.name === "update_wellness" || tool.name === "update_wellness_assessment") {
    // 現在のウェルネスデータを取得
    console.log("    Fetching original wellness data...");
    try {
      const wellness = await callTool("get_wellness", {
        date: today
      }, ctx.accessToken);
      
      if (wellness.content && wellness.content[0]) {
        const data = JSON.parse(wellness.content[0].text);
        if (data.length > 0) {
          originalData = data[0];
          ctx.originalData.set(tool.name, originalData);
        }
      }
    } catch (error) {
      console.log(`    ⚠️  Could not fetch original data: ${error}`);
      console.log(`    ⏭️  Skipping ${tool.name} test to avoid data loss`);
      return;
    }
  }
  
  // テスト用の更新を実行
  const testArgs: Record<string, any> = {};
  
  if (tool.name === "update_wellness") {
    testArgs.date = today;
    testArgs.hrv_morning = 50;
    testArgs.resting_hr = 60;
    testArgs.comments = "Black box test - will be reverted";
  } else if (tool.name === "update_wellness_assessment") {
    testArgs.date = today;
    testArgs.fatigue = 3;
    testArgs.stress = 2;
    testArgs.motivation = 3;
    testArgs.soreness = 2;
    testArgs.injury = 1;
  }
  
  // 更新を実行
  console.log("    Executing update...");
  const result = await callTool(tool.name, testArgs, ctx.accessToken);
  assertExists(result, `${tool.name} should return a result`);
  
  // 更新が成功したことを確認
  if (result.content) {
    assert(result.content[0].text.includes("success") || result.content[0].text.includes("updated"), 
      "Update should indicate success");
  }
  
  console.log(`    ✅ ${tool.name} executed successfully`);
  
  // データを元に戻す
  if (originalData) {
    console.log("    Reverting to original data...");
    const revertArgs: Record<string, any> = { date: today };
    
    if (tool.name === "update_wellness") {
      if (originalData.hrv_morning) revertArgs.hrv_morning = originalData.hrv_morning;
      if (originalData.resting_hr) revertArgs.resting_hr = originalData.resting_hr;
      if (originalData.comments) revertArgs.comments = originalData.comments;
    } else if (tool.name === "update_wellness_assessment") {
      if (originalData.fatigue) revertArgs.fatigue = originalData.fatigue;
      if (originalData.stress) revertArgs.stress = originalData.stress;
      if (originalData.motivation) revertArgs.motivation = originalData.motivation;
      if (originalData.soreness) revertArgs.soreness = originalData.soreness;
      if (originalData.injury) revertArgs.injury = originalData.injury;
    }
    
    await callTool(tool.name, revertArgs, ctx.accessToken);
    console.log("    ✅ Data reverted successfully");
  }
}

// ツールが読み取り専用かどうかを判定
function isReadOnlyTool(toolName: string): boolean {
  const readOnlyTools = [
    "get_athlete",
    "get_activities", 
    "get_wellness",
    "get_custom_fields",
    "get_ucr_assessment",
    "calculate_ucr_trends",
    "check_ucr_setup",
    "batch_calculate_ucr"
  ];
  
  return readOnlyTools.includes(toolName);
}

// メインテスト関数
async function runBlackBoxTests() {
  console.log("=== MCP Tools Black Box Test ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  // 環境変数チェック
  checkEnvironment();
  
  const accessToken = Deno.env.get("TEST_ACCESS_TOKEN")!;
  
  const ctx: TestContext = {
    accessToken,
    tools: [],
    originalData: new Map()
  };
  
  try {
    // 1. Initialize (認証不要)
    console.log("1. Testing Initialize...");
    const initResult = await makeMCPRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "blackbox-test",
        version: "1.0.0"
      }
    });
    assertExists(initResult.protocolVersion);
    console.log("  ✅ Initialize successful\n");
    
    // 2. ツール一覧を取得
    console.log("2. Fetching tools list...");
    ctx.tools = await getTools(accessToken);
    console.log(`  ✅ Retrieved ${ctx.tools.length} tools\n`);
    
    // 3. 各ツールをテスト
    console.log("3. Testing each tool...");
    const results = {
      total: ctx.tools.length,
      passed: 0,
      failed: 0,
      skipped: 0
    };
    
    for (const tool of ctx.tools) {
      try {
        if (isReadOnlyTool(tool.name)) {
          await testReadOnlyTool(tool, ctx);
        } else {
          await testWritableTool(tool, ctx);
        }
        results.passed++;
      } catch (error) {
        console.error(`    ❌ ${tool.name} failed: ${error}`);
        results.failed++;
      }
    }
    
    // 4. 結果サマリー
    console.log("\n=== Test Summary ===");
    console.log(`Total Tools: ${results.total}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped: ${results.skipped}`);
    
    if (results.failed === 0) {
      console.log("\n✅ All tests passed!");
      Deno.exit(0);
    } else {
      console.log("\n❌ Some tests failed");
      Deno.exit(1);
    }
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    
    // エラーが発生した場合でも、可能な限りデータを復元
    console.log("\nAttempting to restore original data...");
    for (const [toolName, data] of ctx.originalData) {
      try {
        if (toolName === "update_wellness" || toolName === "update_wellness_assessment") {
          await callTool(toolName, data, accessToken);
          console.log(`  ✅ Restored data for ${toolName}`);
        }
      } catch (restoreError) {
        console.error(`  ❌ Failed to restore ${toolName}:`, restoreError);
      }
    }
    
    Deno.exit(1);
  }
}

// テスト実行
if (import.meta.main) {
  await runBlackBoxTests();
}