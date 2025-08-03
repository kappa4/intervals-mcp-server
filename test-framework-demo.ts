#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test Framework Demo
 * 改良版テストフレームワークのデモ（認証不要エンドポイント）
 */

import {
  MCPTestClient,
  TestRunner,
  assertContains,
  assertMatches
} from "./test-helpers/test-framework.ts";
import { assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

async function runFrameworkDemo() {
  console.log("=== Test Framework Demo ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // テストクライアント作成（認証なし）
  const client = new MCPTestClient({
    baseUrl: BASE_URL,
    timeout: 10000,
    retryCount: 2
  });

  const runner = new TestRunner(client);

  // テストケース定義
  const testCases = [
    {
      name: "Initialize with retry simulation",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "framework-demo",
          version: "1.0.0"
        }
      },
      validate: (result: any) => {
        assertExists(result.protocolVersion);
        assertContains(result.protocolVersion, "2024-11-05");
        assertExists(result.serverInfo);
        assertContains(result.serverInfo.name, "intervals-mcp-server");
        console.log(`    Server: ${result.serverInfo.name} v${result.serverInfo.version}`);
      }
    },
    {
      name: "Health Check with custom validation",
      method: "health", // This will fail and demonstrate error handling
      params: {},
      validate: (result: any) => {
        // This test will fail because health is not a valid MCP method
        assertExists(result);
      }
    },
    {
      name: "Tools List (Unauthorized - Expected)",
      method: "tools/list",
      params: {},
      validate: (result: any) => {
        // This should fail with unauthorized
        console.log("    This should fail with unauthorized error");
      }
    }
  ];

  // テスト実行
  await runner.runAll(testCases);

  // カスタムヘルスチェック（HTTP GET）
  console.log("\n=== Custom HTTP Tests ===");
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    console.log("Health Check Response:");
    console.log(`  Status: ${data.status}`);
    console.log(`  Cache Enabled: ${data.cache_enabled}`);
    console.log(`  KV Enabled: ${data.kv_enabled}`);
    console.log(`  Athlete ID: ${data.athlete_id}`);
    
    // カスタムアサーション例
    assertMatches(data.timestamp, /^\d{4}-\d{2}-\d{2}T/, "Timestamp should be ISO format");
    console.log("  ✅ Custom assertions passed");
    
  } catch (error) {
    console.error("  ❌ Custom test failed:", error);
  }

  // 統計情報表示
  const stats = client.getStats();
  console.log("\n=== Client Statistics ===");
  console.log(`Total Requests: ${stats.requestCount}`);
  console.log(`Average Response Time: ${stats.averageDuration.toFixed(2)}ms`);
}

// デモ実行
if (import.meta.main) {
  try {
    await runFrameworkDemo();
  } catch (error) {
    console.error("\nDemo failed:", error);
    Deno.exit(1);
  }
}