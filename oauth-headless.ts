#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run --allow-read --allow-write

/**
 * Headless OAuth Flow
 * ヘッドレスブラウザを使用してOAuth認証を自動化
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

// PKCEパラメータ生成
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

// Playwrightを使用したヘッドレス認証
async function automateOAuthWithPlaywright(authUrl: string): Promise<string | null> {
  console.log("Starting headless browser with Playwright...");
  
  try {
    // Playwright for Denoを使用
    const command = new Deno.Command("npx", {
      args: ["playwright", "install", "chromium"],
      stdout: "piped",
      stderr: "piped"
    });
    
    const { code } = await command.output();
    if (code !== 0) {
      console.error("Failed to install Playwright");
      return null;
    }
    
    // TODO: Playwright実装
    console.log("Playwright automation would go here...");
    return null;
    
  } catch (error) {
    console.error("Playwright error:", error);
    return null;
  }
}

// cURLとヘッドレスモードを使用した簡易実装
async function automateOAuthSimple(authUrl: string): Promise<string | null> {
  console.log("\n=== Attempting automated OAuth flow ===");
  
  // OAuth認証ページを取得
  const authResponse = await fetch(authUrl, {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
  });
  
  // リダイレクト先を確認
  const location = authResponse.headers.get("location");
  if (location) {
    console.log("Redirect detected:", location);
    
    // localhostへのリダイレクトの場合、codeを抽出
    if (location.startsWith("http://localhost:8080/callback")) {
      const url = new URL(location);
      const code = url.searchParams.get("code");
      if (code) {
        console.log("✅ Authorization code extracted:", code);
        return code;
      }
    }
  }
  
  // 認証ページのHTMLを解析
  const html = await authResponse.text();
  console.log("Response status:", authResponse.status);
  
  // 自動承認の可能性をチェック
  if (authResponse.status === 302 || authResponse.status === 303) {
    console.log("Auto-approval might be enabled");
  }
  
  return null;
}

// ローカルサーバーでコールバックを受け取る（バックグラウンド）
async function startCallbackServer(port: number = 8080): Promise<AbortController> {
  const abortController = new AbortController();
  
  const server = Deno.serve({ 
    port,
    signal: abortController.signal,
    onListen: () => {
      console.log(`Callback server ready on http://localhost:${port}/callback`);
    }
  }, (req) => {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") {
      return new Response("Not found", { status: 404 });
    }
    
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    
    if (error) {
      console.error(`OAuth Error: ${error}`);
      return new Response(`Error: ${error}`, { status: 400 });
    }
    
    if (code) {
      console.log(`\n✅ Authorization code received: ${code}`);
      
      // グローバル変数に保存（改善の余地あり）
      (globalThis as any).authCode = code;
      
      return new Response(
        `<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
    
    return new Response("Waiting for code...", { status: 200 });
  });
  
  return abortController;
}

async function main() {
  console.log("=== Headless OAuth Flow ===\n");
  
  const clientId = Deno.args[0] || "hjMK7l9wVP5eusS13a7qWA";
  const clientSecret = Deno.args[1] || "SdHpio23ejXPgjdOJK9pXHk7dkHUaeOXe-N-hzvN3YU";
  
  // コールバックサーバー起動
  const serverController = await startCallbackServer();
  
  try {
    // PKCE準備
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // 認証URL生成
    const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", "http://localhost:8080/callback");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", `headless-${Date.now()}`);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    
    console.log("Authorization URL:", authUrl.toString());
    
    // 自動認証を試みる
    const autoCode = await automateOAuthSimple(authUrl.toString());
    
    let code: string | null = autoCode;
    
    if (!code) {
      console.log("\n自動認証に失敗しました。手動での認証が必要です。");
      console.log("\n=== 手動認証手順 ===");
      console.log("1. 以下のURLをブラウザで開いてください:");
      console.log(authUrl.toString());
      console.log("\n2. ngrokが起動している場合は、認証後自動的にコードを受信します");
      console.log("   ngrok http --domain=verified-snail-hugely.ngrok-free.app 8080");
      
      // コード受信を待つ（30秒）
      console.log("\n認証コードを待っています（30秒）...");
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if ((globalThis as any).authCode) {
          code = (globalThis as any).authCode;
          break;
        }
      }
    }
    
    if (!code) {
      console.error("\n❌ 認証コードを取得できませんでした");
      return;
    }
    
    // トークン交換
    console.log("\n=== Exchanging code for token ===");
    
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
      const error = await tokenResponse.text();
      console.error("❌ Token exchange failed:", error);
      return;
    }
    
    const tokenData = await tokenResponse.json();
    console.log("\n✅ Access token obtained!");
    
    // トークンをテスト
    console.log("\n=== Testing token ===");
    const testResponse = await fetch(`${BASE_URL}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenData.access_token}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-1",
        method: "tools/list"
      })
    });
    
    const testData = await testResponse.json();
    if (testData.result?.tools) {
      console.log(`✅ Token is valid! Found ${testData.result.tools.length} tools.`);
    }
    
    // 結果を表示
    console.log("\n=== Token Information ===");
    console.log(`export TEST_ACCESS_TOKEN="${tokenData.access_token}"`);
    console.log(`export TEST_REFRESH_TOKEN="${tokenData.refresh_token}"`);
    
    // トークンをファイルに保存
    const tokenFile = ".test-token";
    await Deno.writeTextFile(tokenFile, tokenData.access_token);
    console.log(`\nToken saved to ${tokenFile}`);
    
  } finally {
    // サーバー停止
    serverController.abort();
  }
}

if (import.meta.main) {
  await main();
}