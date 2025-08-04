#!/usr/bin/env -S deno run --allow-net --allow-env --unstable-kv

/**
 * Development Token Setup
 * 開発環境用にアクセストークンを直接KVに保存
 */

import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const BASE_URL = Deno.env.get("BASE_URL") || "https://kpnco-intervals-mcp-77.deno.dev";
// 本番環境と同じキーを使用する必要がある
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET_KEY") || "test_jwt_secret_key_minimum_32_chars";

// 本番環境のJWT_SECRET_KEYを使用するよう案内
if (!Deno.env.get("JWT_SECRET_KEY")) {
  console.log("⚠️  WARNING: Using default JWT_SECRET_KEY");
  console.log("   For production testing, set the actual JWT_SECRET_KEY:");
  console.log("   export JWT_SECRET_KEY=<your_production_jwt_secret>");
  console.log("");
}

// トークンの有効期限（日数）
const TOKEN_VALIDITY_DAYS = 30;

async function generateDevToken(clientId: string = "dev_client"): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET_KEY);
  
  // Create HMAC key
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  // Token payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "dev_user",
    iat: now,
    exp: now + (TOKEN_VALIDITY_DAYS * 24 * 60 * 60), // 30 days
    client_id: clientId,
    scope: "read write",
    // 開発用フラグ
    dev_mode: true
  };

  // Generate JWT
  const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, key);
  return jwt;
}

async function saveTokenToKV(token: string, clientId: string = "dev_client") {
  try {
    // Deno KVに接続
    const kv = await Deno.openKv();
    
    // トークン情報を保存
    const tokenKey = ["oauth", "tokens", token];
    const tokenData = {
      access_token: token,
      token_type: "Bearer",
      expires_in: TOKEN_VALIDITY_DAYS * 24 * 60 * 60,
      scope: "read write",
      client_id: clientId,
      created_at: Date.now(),
      dev_mode: true
    };
    
    await kv.set(tokenKey, tokenData, {
      expireIn: TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000 // milliseconds
    });
    
    // クライアント情報も保存
    const clientKey = ["oauth", "clients", clientId];
    const clientData = {
      client_id: clientId,
      client_secret: "dev_secret",
      client_name: "Development Client",
      redirect_uris: ["http://localhost:8080/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      created_at: Date.now(),
      dev_mode: true
    };
    
    await kv.set(clientKey, clientData);
    
    console.log("✅ Token saved to KV successfully!");
    
    // 保存したデータを確認
    const savedToken = await kv.get(tokenKey);
    const savedClient = await kv.get(clientKey);
    
    console.log("\n📦 Saved token data:", savedToken.value);
    console.log("\n📦 Saved client data:", savedClient.value);
    
    kv.close();
  } catch (error) {
    console.error("❌ Failed to save to KV:", error);
    console.log("\n💡 To use KV locally, run:");
    console.log("   deno run --unstable-kv --allow-net --allow-env dev-setup-token.ts");
  }
}

async function testToken(token: string) {
  console.log("\n=== Testing Token ===");
  
  const response = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
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
    console.log("\n💡 If authentication fails, the server might need the same JWT_SECRET_KEY");
    console.log("   Set it in Deno Deploy environment variables:");
    console.log(`   JWT_SECRET_KEY=${JWT_SECRET_KEY}`);
  } else if (data.result?.tools) {
    console.log(`✅ Token is valid! Found ${data.result.tools.length} tools.`);
    
    console.log("\n📋 Available tools:");
    data.result.tools.forEach((tool: any) => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
  }
}

async function main() {
  console.log("=== Development Token Setup ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`JWT Secret Key Length: ${JWT_SECRET_KEY.length} chars`);
  
  const command = Deno.args[0];
  const clientId = Deno.args[1] || "dev_client";
  
  switch (command) {
    case "local":
      // ローカルKVに保存
      console.log("\n🔧 Generating development token for local KV...");
      const localToken = await generateDevToken(clientId);
      console.log("\n🔑 Generated token:", localToken);
      await saveTokenToKV(localToken, clientId);
      
      console.log("\n📋 To use this token:");
      console.log(`export DEV_ACCESS_TOKEN="${localToken}"`);
      console.log(`curl -X POST ${BASE_URL}/ \\`);
      console.log(`  -H "Authorization: Bearer ${localToken}" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'`);
      break;
      
    case "test":
      // 既存トークンのテスト
      const testTokenValue = Deno.args[1] || Deno.env.get("DEV_ACCESS_TOKEN");
      if (!testTokenValue) {
        console.error("❌ No token provided. Use: ./dev-setup-token.ts test YOUR_TOKEN");
        break;
      }
      await testToken(testTokenValue);
      break;
      
    case "generate":
      // トークン生成のみ
      console.log("\n🔧 Generating development token...");
      const token = await generateDevToken(clientId);
      console.log("\n🔑 Generated token:");
      console.log(token);
      
      console.log("\n📋 To use this token:");
      console.log(`export DEV_ACCESS_TOKEN="${token}"`);
      console.log("\n🧪 Test it with:");
      console.log(`./dev-setup-token.ts test "${token}"`);
      
      await testToken(token);
      break;
      
    default:
      console.log("\nUsage:");
      console.log("  ./dev-setup-token.ts generate [client_id]  - Generate a dev token");
      console.log("  ./dev-setup-token.ts local [client_id]     - Generate and save to local KV");
      console.log("  ./dev-setup-token.ts test [token]          - Test a token");
      console.log("\nExamples:");
      console.log("  ./dev-setup-token.ts generate");
      console.log("  ./dev-setup-token.ts generate my_dev_client");
      console.log("  ./dev-setup-token.ts test eyJhbGc...");
      console.log("\nEnvironment variables:");
      console.log("  BASE_URL - API base URL (default: https://kpnco-intervals-mcp-77.deno.dev)");
      console.log("  JWT_SECRET_KEY - JWT signing key (must match server)");
      console.log("  DEV_ACCESS_TOKEN - Token for testing");
  }
}

if (import.meta.main) {
  await main();
}