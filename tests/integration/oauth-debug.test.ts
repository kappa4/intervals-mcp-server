#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * OAuth認証問題のデバッグスクリプト
 * Claude.aiのトークンがなぜ残っているかを調査
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

// 色付きログ
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

async function testInitializeFlow() {
  log.info("Testing MCP initialize flow without authentication...");
  
  // 1. Initialize without token
  const initResponse = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "debug-client",
          version: "1.0.0"
        }
      }
    })
  });
  
  const initData = await initResponse.json();
  log.info(`Initialize response: ${JSON.stringify(initData, null, 2)}`);
  
  // 2. Try to call a protected method without token
  log.info("\nTesting protected method without authentication...");
  const toolsResponse = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "tools-1",
      method: "tools/list"
    })
  });
  
  const toolsData = await toolsResponse.json();
  if (toolsData.error) {
    log.warning(`Expected error: ${JSON.stringify(toolsData.error)}`);
  } else {
    log.error(`Unexpected success: ${JSON.stringify(toolsData)}`);
  }
}

async function testOAuthDiscovery() {
  log.info("\nTesting OAuth discovery endpoints...");
  
  // Check discovery
  const discoveryResponse = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
  const discovery = await discoveryResponse.json();
  log.info(`Discovery: ${JSON.stringify(discovery, null, 2)}`);
  
  // Check if Claude.ai might have a token stored
  log.info("\nClaude.ai might have a token stored in browser localStorage or sessionStorage");
  log.info("To debug this issue:");
  log.info("1. Open Claude.ai in your browser");
  log.info("2. Open Developer Tools (F12)");
  log.info("3. Go to Application/Storage tab");
  log.info("4. Check localStorage and sessionStorage for any tokens");
  log.info("5. Look for keys containing 'oauth', 'token', or 'mcp'");
}

async function suggestFix() {
  log.info("\n=== 解決策の提案 ===");
  log.info("1. ブラウザのキャッシュとCookieをクリア");
  log.info("2. Claude.aiのローカルストレージをクリア:");
  log.info("   - Developer Tools > Application > Storage > Clear site data");
  log.info("3. MCPコネクタを完全に削除して再登録");
  log.info("4. サーバー側でトークンをクリアするエンドポイントを追加");
}

async function main() {
  console.log("=== OAuth認証問題デバッグ ===\n");
  
  await testInitializeFlow();
  await testOAuthDiscovery();
  await suggestFix();
  
  log.info("\n完了しました。");
}

if (import.meta.main) {
  await main();
}