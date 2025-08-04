#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Manual OAuth Flow Helper
 * ローカルhostリダイレクトURIを使用した手動OAuth認証
 */

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

// ローカルサーバーでコールバックを受け取る
async function startCallbackServer(port: number = 8080): Promise<string> {
  console.log(`\n🚀 Starting callback server on http://localhost:${port}/callback`);
  console.log("If using ngrok, make sure it's running: ngrok http ${port}");
  console.log("Waiting for OAuth callback...\n");
  
  return new Promise((resolve, reject) => {
    const server = Deno.serve({ port }, (req) => {
      const url = new URL(req.url);
      
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }
      
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      
      if (error) {
        const errorDesc = url.searchParams.get("error_description");
        console.error(`\n❌ OAuth Error: ${error}`);
        if (errorDesc) console.error(`   Description: ${errorDesc}`);
        
        server.shutdown();
        reject(new Error(`${error}: ${errorDesc}`));
        
        return new Response(
          `<html><body><h1>OAuth Error</h1><p>${error}: ${errorDesc}</p></body></html>`,
          { headers: { "Content-Type": "text/html" }, status: 400 }
        );
      }
      
      if (code) {
        console.log("\n✅ Authorization code received!");
        console.log(`Code: ${code}`);
        console.log(`State: ${state}`);
        
        const html = `
          <html>
            <head>
              <style>
                body { font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
                code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                .success { color: green; }
              </style>
            </head>
            <body>
              <h1 class="success">✅ Authorization Successful!</h1>
              <p>Authorization code: <code>${code}</code></p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>`;
        
        setTimeout(() => {
          server.shutdown();
          resolve(code);
        }, 1000);
        
        return new Response(html, { 
          headers: { "Content-Type": "text/html" }, 
          status: 200 
        });
      }
      
      return new Response(
        `<html><body><h1>Waiting for OAuth callback...</h1></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    });
  });
}

async function main() {
  console.log("=== Manual OAuth Flow Helper ===\n");
  
  // コマンドライン引数からクライアント情報を取得
  const clientId = Deno.args[0];
  const clientSecret = Deno.args[1];
  
  if (!clientId || !clientSecret) {
    console.error("Usage: ./oauth-manual-flow.ts <client_id> <client_secret>");
    console.error("\nExample:");
    console.error("./oauth-manual-flow.ts hjMK7l9wVP5eusS13a7qWA SdHpio23ejXPgjdOJK9pXHk7dkHUaeOXe-N-hzvN3YU");
    Deno.exit(1);
  }
  
  // PKCE準備
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // コールバックサーバー起動
  const codePromise = startCallbackServer();
  
  // 認証URL生成
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", "http://localhost:8080/callback");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", `manual-${Date.now()}`);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  console.log("=== Open this URL in your browser ===");
  console.log(authUrl.toString());
  console.log("");
  
  try {
    // 認証コードを待つ
    const code = await codePromise;
    
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
      Deno.exit(1);
    }
    
    const tokenData = await tokenResponse.json();
    console.log("\n✅ Access token obtained!");
    console.log("\n=== Token Information ===");
    console.log(`Access Token: ${tokenData.access_token}`);
    console.log(`Token Type: ${tokenData.token_type}`);
    console.log(`Expires In: ${tokenData.expires_in} seconds`);
    console.log(`Refresh Token: ${tokenData.refresh_token}`);
    
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
      
      console.log("\n📋 Available tools:");
      testData.result.tools.forEach((tool: any) => {
        console.log(`   - ${tool.name}: ${tool.description.split('\n')[0]}`);
      });
    } else {
      console.error("❌ Token test failed:", testData);
    }
    
    // 環境変数設定の案内
    console.log("\n=== Next Steps ===");
    console.log("Set environment variable:");
    console.log(`export TEST_ACCESS_TOKEN="${tokenData.access_token}"`);
    console.log(`export TEST_REFRESH_TOKEN="${tokenData.refresh_token}"`);
    console.log("\nRun blackbox tests:");
    console.log("./test-mcp-tools-blackbox.ts");
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}