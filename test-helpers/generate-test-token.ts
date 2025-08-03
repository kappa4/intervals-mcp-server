#!/usr/bin/env -S deno run --allow-env

/**
 * Generate Test Access Token
 * 開発環境用のテストアクセストークン生成
 * 
 * 注意: このスクリプトは開発環境でのみ使用してください
 */

import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// 環境変数から秘密鍵を取得
const JWT_SECRET_KEY = Deno.env.get("JWT_SECRET_KEY");

if (!JWT_SECRET_KEY || JWT_SECRET_KEY.length < 32) {
  console.error("Error: JWT_SECRET_KEY must be set and at least 32 characters long");
  console.error("Set it with: export JWT_SECRET_KEY=your_secret_key_minimum_32_chars");
  Deno.exit(1);
}

async function generateTestToken() {
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
  const payload = {
    sub: "test_user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    client_id: Deno.env.get("TEST_CLIENT_ID") || "test_client",
    scope: "read write"
  };

  // Generate JWT
  const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, key);
  
  console.log("=== Test Access Token Generated ===");
  console.log("\nToken (valid for 24 hours):");
  console.log(jwt);
  console.log("\nSet it as environment variable:");
  console.log(`export TEST_ACCESS_TOKEN="${jwt}"`);
  console.log("\nUse it in requests:");
  console.log(`Authorization: Bearer ${jwt}`);
}

// Check if JWT_SECRET_KEY matches the server
console.log("Generating test token with current JWT_SECRET_KEY...");
console.log(`Secret key length: ${JWT_SECRET_KEY.length} characters`);

await generateTestToken();