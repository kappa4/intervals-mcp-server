#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * OAuth Setup Helper for Black Box Testing
 * ブラックボックステスト用のOAuth設定ヘルパー
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

async function registerClient() {
  console.log("=== OAuth Client Registration ===");
  
  // テスト用のランダムなクライアント名を生成
  const clientName = `Test Client ${Date.now()}`;
  
  const response = await fetch(`${BASE_URL}/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Registration failed:", error);
    console.error("\nNote: Currently only https://claude.ai/oauth/callback is whitelisted");
    return;
  }

  const data = await response.json();
  
  console.log("\n✅ Client registered successfully!");
  console.log("\nSave these credentials in your environment:");
  console.log(`export TEST_CLIENT_ID="${data.client_id}"`);
  console.log(`export TEST_CLIENT_SECRET="${data.client_secret}"`);
  
  // 認証URLを生成
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", data.client_id);
  authUrl.searchParams.set("redirect_uri", "https://claude.ai/oauth/callback");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", "test-state-" + Date.now());
  
  console.log("\n=== Next Steps ===");
  console.log("1. Open this URL in your browser:");
  console.log(authUrl.toString());
  
  console.log("\n2. After authorization, you'll be redirected to Claude.ai");
  console.log("   Copy the 'code' parameter from the redirect URL");
  
  console.log("\n3. Exchange the code for an access token:");
  console.log("   Run: ./setup-oauth-test.ts exchange <AUTH_CODE>");
}

async function exchangeCode(authCode: string) {
  const clientId = Deno.env.get("TEST_CLIENT_ID");
  const clientSecret = Deno.env.get("TEST_CLIENT_SECRET");
  
  if (!clientId || !clientSecret) {
    console.error("Missing TEST_CLIENT_ID or TEST_CLIENT_SECRET");
    console.error("Run registration first: ./setup-oauth-test.ts register");
    return;
  }

  console.log("=== Token Exchange ===");
  
  const formData = new URLSearchParams({
    grant_type: "authorization_code",
    code: authCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: "https://claude.ai/oauth/callback"
  });

  const response = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formData.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token exchange failed:", error);
    return;
  }

  const data = await response.json();
  
  console.log("\n✅ Access token obtained successfully!");
  console.log("\nSave this in your environment:");
  console.log(`export TEST_ACCESS_TOKEN="${data.access_token}"`);
  console.log(`\nToken expires in: ${data.expires_in} seconds`);
  
  console.log("\n=== Ready for Testing ===");
  console.log("You can now run the black box tests:");
  console.log("./test-mcp-tools-blackbox.ts");
}

async function testToken() {
  const accessToken = Deno.env.get("TEST_ACCESS_TOKEN");
  
  if (!accessToken) {
    console.error("Missing TEST_ACCESS_TOKEN");
    console.error("Complete OAuth flow first");
    return;
  }

  console.log("=== Testing Access Token ===");
  
  const response = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "test-1",
      method: "tools/list"
    })
  });

  const data = await response.json();
  
  if (data.error) {
    console.error("❌ Token test failed:", data.error);
    console.error("You may need to get a new access token");
  } else {
    console.log("✅ Access token is valid!");
    console.log(`Found ${data.result.tools.length} tools`);
  }
}

// Main
const command = Deno.args[0];
const authCode = Deno.args[1];

console.log("OAuth Setup Helper for MCP Black Box Testing");
console.log("============================================\n");

switch (command) {
  case "register":
    await registerClient();
    break;
    
  case "exchange":
    if (!authCode) {
      console.error("Usage: ./setup-oauth-test.ts exchange <AUTH_CODE>");
      Deno.exit(1);
    }
    await exchangeCode(authCode);
    break;
    
  case "test":
    await testToken();
    break;
    
  default:
    console.log("Usage:");
    console.log("  ./setup-oauth-test.ts register    - Register new OAuth client");
    console.log("  ./setup-oauth-test.ts exchange <CODE> - Exchange auth code for token");
    console.log("  ./setup-oauth-test.ts test        - Test current access token");
    console.log("\nCurrent environment:");
    console.log(`  TEST_CLIENT_ID: ${Deno.env.get("TEST_CLIENT_ID") ? "✓ Set" : "✗ Not set"}`);
    console.log(`  TEST_CLIENT_SECRET: ${Deno.env.get("TEST_CLIENT_SECRET") ? "✓ Set" : "✗ Not set"}`);
    console.log(`  TEST_ACCESS_TOKEN: ${Deno.env.get("TEST_ACCESS_TOKEN") ? "✓ Set" : "✗ Not set"}`);
}