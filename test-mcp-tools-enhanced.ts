#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Enhanced MCP Tools Black Box Test
 * テストフレームワークを使用した改良版ブラックボックステスト
 */

import {
  MCPTestClient,
  TestRunner,
  generateTestCasesFromTools,
  assertExists,
  assertContains
} from "./test-helpers/test-framework.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

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
    console.error("1. Register an OAuth client: ./setup-oauth-test.ts register");
    console.error("2. Complete OAuth flow: ./setup-oauth-test.ts exchange <CODE>");
    console.error("3. Set environment variables");
    Deno.exit(1);
  }
}

// メインテスト関数
async function runEnhancedBlackBoxTests() {
  console.log("=== Enhanced MCP Tools Black Box Test ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  // 環境変数チェック
  checkEnvironment();
  
  const accessToken = Deno.env.get("TEST_ACCESS_TOKEN")!;
  
  // テストクライアント作成
  const client = new MCPTestClient({
    baseUrl: BASE_URL,
    accessToken,
    timeout: 30000,
    retryCount: 3
  });
  
  const runner = new TestRunner(client);
  
  try {
    // 基本的なテストケース
    const basicTests = [
      {
        name: "Initialize (No Auth)",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "enhanced-blackbox-test",
            version: "2.0.0"
          }
        },
        validate: (result: any) => {
          assertExists(result.protocolVersion);
          assertContains(result.protocolVersion, "2024-11-05");
          assertExists(result.serverInfo);
          assertContains(result.serverInfo.name, "intervals-mcp-server");
        }
      },
      {
        name: "Tools List",
        method: "tools/list",
        params: {},
        validate: (result: any) => {
          assertExists(result.tools);
          if (result.tools.length === 0) {
            throw new Error("No tools found");
          }
          console.log(`  Found ${result.tools.length} tools`);
        }
      }
    ];
    
    // 基本テスト実行
    for (const test of basicTests) {
      await runner.run(test);
    }
    
    // 動的にツールテストケースを生成
    console.log("\nGenerating test cases for all tools...");
    const toolTestCases = await generateTestCasesFromTools(client);
    console.log(`Generated ${toolTestCases.length} test cases\n`);
    
    // 全ツールテスト実行
    await runner.runAll(toolTestCases);
    
    // カスタムテストケース（特定のシナリオ）
    console.log("\n=== Custom Scenario Tests ===");
    
    const customTests = [
      {
        name: "UCR Assessment with Caching",
        method: "tools/call",
        params: ["get_ucr_assessment", { date: new Date().toISOString().split('T')[0] }],
        validate: async (result: any) => {
          assertExists(result);
          
          // 2回目の呼び出し（キャッシュヒット確認）
          const start = Date.now();
          const cachedResult = await client.callTool("get_ucr_assessment", {
            date: new Date().toISOString().split('T')[0]
          });
          const duration = Date.now() - start;
          
          console.log(`    Cache hit response time: ${duration}ms`);
          assertExists(cachedResult);
          
          // キャッシュヒットの場合、レスポンスが高速であることを確認
          if (duration > 1000) {
            console.warn(`    ⚠️  Response time seems slow for cached data: ${duration}ms`);
          }
        }
      },
      {
        name: "UCR Trend Analysis (7 days)",
        method: "tools/call",
        params: ["calculate_ucr_trends", {
          start_date: (() => {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            return date.toISOString().split('T')[0];
          })(),
          end_date: new Date().toISOString().split('T')[0]
        }],
        validate: (result: any) => {
          assertExists(result);
          if (result.content && result.content[0]) {
            const text = result.content[0].text;
            assertContains(text, "UCR");
          }
        }
      }
    ];
    
    for (const test of customTests) {
      await runner.run(test);
    }
    
    // 最終サマリー
    runner.printSummary();
    
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    Deno.exit(1);
  }
}

// テスト実行
if (import.meta.main) {
  await runEnhancedBlackBoxTests();
}