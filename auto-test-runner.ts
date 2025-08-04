#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

/**
 * Automated Test Runner
 * OAuth認証からブラックボックステストまでを完全自動化
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

// 色付きログ出力
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

// Step 1: OAuth認証でトークンを取得
async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  log.info("Starting OAuth authentication...");
  
  // PKCE準備
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // 認証URL生成
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", "http://localhost:8080/callback");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", `auto-test-${Date.now()}`);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  // 自動認証を試みる
  const authResponse = await fetch(authUrl.toString(), {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
  });
  
  const location = authResponse.headers.get("location");
  if (!location || !location.startsWith("http://localhost:8080/callback")) {
    throw new Error("Automatic authorization failed");
  }
  
  const url = new URL(location);
  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("No authorization code received");
  }
  
  log.success(`Authorization code received: ${code.substring(0, 10)}...`);
  
  // トークン交換
  const tokenResponse = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "http://localhost:8080/callback",
      code_verifier: codeVerifier
    }).toString()
  });
  
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
  }
  
  const tokenData = await tokenResponse.json();
  log.success("Access token obtained!");
  
  return tokenData.access_token;
}

// Step 2: MCPツールのテストを実行
async function runTests(accessToken: string): Promise<TestResults> {
  log.info("Running MCP tools tests...");
  
  const results: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    details: []
  };
  
  // ツール一覧を取得
  const toolsResponse = await callMCP("tools/list", {}, accessToken);
  const tools = toolsResponse.tools || [];
  results.total = tools.length;
  
  log.info(`Found ${tools.length} tools to test`);
  
  // 各ツールをテスト
  for (const tool of tools) {
    try {
      const testResult = await testTool(tool, accessToken);
      if (testResult.status === "passed") {
        results.passed++;
      } else if (testResult.status === "skipped") {
        results.skipped++;
      } else {
        results.failed++;
      }
      results.details.push(testResult);
    } catch (error) {
      results.failed++;
      results.details.push({
        tool: tool.name,
        status: "failed",
        error: error.message
      });
    }
  }
  
  return results;
}

// 個別ツールのテスト
async function testTool(tool: any, accessToken: string): Promise<TestDetail> {
  log.info(`Testing ${tool.name}...`);
  
  // テストパラメータを準備
  const testParams = getTestParameters(tool.name);
  
  try {
    const result = await callMCP("tools/call", {
      name: tool.name,
      arguments: testParams
    }, accessToken);
    
    if (result.isError) {
      return {
        tool: tool.name,
        status: "failed",
        error: result.content?.[0]?.text || "Unknown error"
      };
    }
    
    log.success(`✅ ${tool.name} passed`);
    return {
      tool: tool.name,
      status: "passed"
    };
    
  } catch (error) {
    log.error(`❌ ${tool.name} failed: ${error.message}`);
    return {
      tool: tool.name,
      status: "failed",
      error: error.message
    };
  }
}

// MCP APIを呼び出す
async function callMCP(method: string, params: any, accessToken: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || data.error);
  }
  
  return data.result;
}

// テスト用パラメータを取得
function getTestParameters(toolName: string): any {
  const today = new Date().toISOString().split('T')[0];
  const params: Record<string, any> = {
    get_activities: { limit: 5 },
    get_activity: { activity_id: "i89274717" }, // 実際のIDを使用
    get_wellness: { date: today },
    update_wellness: { date: today, weight: 65.0 }, // スキップされる
    get_athlete_info: {},
    get_ucr_assessment: { date: today },
    calculate_ucr_trends: { days: 7 },
    update_wellness_assessment: { date: today, fatigue: 3 }, // スキップされる
    check_ucr_setup: {},
    batch_calculate_ucr: {
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: today
    }
  };
  
  return params[toolName] || {};
}

// Step 3: レポート生成
function generateReport(results: TestResults): string {
  const timestamp = new Date().toISOString();
  const successRate = Math.round((results.passed / results.total) * 100);
  
  let report = `# Automated Test Report

## Summary
- **Date**: ${timestamp}
- **Total Tools**: ${results.total}
- **Passed**: ${results.passed}
- **Failed**: ${results.failed}
- **Skipped**: ${results.skipped}
- **Success Rate**: ${successRate}%

## Details
`;
  
  for (const detail of results.details) {
    const icon = detail.status === "passed" ? "✅" : 
                  detail.status === "skipped" ? "⏭️" : "❌";
    report += `\n### ${icon} ${detail.tool}`;
    report += `\n- Status: ${detail.status}`;
    if (detail.error) {
      report += `\n- Error: ${detail.error}`;
    }
  }
  
  return report;
}

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Types
interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  details: TestDetail[];
}

interface TestDetail {
  tool: string;
  status: "passed" | "failed" | "skipped";
  error?: string;
}

// Main function
async function main() {
  console.log("=== Automated MCP Test Runner ===\n");
  
  // 環境変数またはデフォルト値を使用
  const clientId = Deno.env.get("TEST_CLIENT_ID") || "hjMK7l9wVP5eusS13a7qWA";
  const clientSecret = Deno.env.get("TEST_CLIENT_SECRET") || "SdHpio23ejXPgjdOJK9pXHk7dkHUaeOXe-N-hzvN3YU";
  
  try {
    // Step 1: OAuth認証
    const accessToken = await getAccessToken(clientId, clientSecret);
    
    // Step 2: テスト実行
    const results = await runTests(accessToken);
    
    // Step 3: レポート生成
    const report = generateReport(results);
    
    // レポートを保存
    const reportFile = `test-report-${Date.now()}.md`;
    await Deno.writeTextFile(reportFile, report);
    log.success(`Report saved to ${reportFile}`);
    
    // コンソールにも出力
    console.log("\n" + report);
    
    // 終了コード
    if (results.failed > 0) {
      log.error(`Tests failed: ${results.failed}/${results.total}`);
      Deno.exit(1);
    } else {
      log.success("All tests passed!");
      Deno.exit(0);
    }
    
  } catch (error) {
    log.error(`Test runner failed: ${error.message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}