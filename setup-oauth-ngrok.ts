#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run

/**
 * OAuth Setup with ngrok
 * ngrokを使用してローカルサーバーを公開し、OAuth認証フローを完了する
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";
const LOCAL_PORT = 8080;

// ngrokが起動しているか確認
async function checkNgrok(): Promise<string | null> {
  try {
    const response = await fetch("http://localhost:4040/api/tunnels");
    const data = await response.json();
    
    if (data.tunnels && data.tunnels.length > 0) {
      const httpsUrl = data.tunnels.find((t: any) => t.proto === "https")?.public_url;
      return httpsUrl || data.tunnels[0].public_url;
    }
  } catch (error) {
    // ngrok not running
  }
  return null;
}

// ngrokを起動
async function startNgrok(): Promise<string> {
  console.log(`Starting ngrok on port ${LOCAL_PORT}...`);
  
  const command = new Deno.Command("ngrok", {
    args: ["http", LOCAL_PORT.toString()],
    stdout: "piped",
    stderr: "piped"
  });
  
  const process = command.spawn();
  
  // ngrokが起動するまで待つ
  console.log("Waiting for ngrok to start...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // ngrok URLを取得
  const ngrokUrl = await checkNgrok();
  if (!ngrokUrl) {
    console.error("Failed to get ngrok URL. Make sure ngrok is installed.");
    console.log("\nTo install ngrok:");
    console.log("1. Visit https://ngrok.com/download");
    console.log("2. Download and install ngrok");
    console.log("3. Run: ngrok http 8080");
    console.log("4. Run this script again");
    Deno.exit(1);
  }
  
  return ngrokUrl;
}

// OAuthコールバックを受け取るローカルサーバー
async function startCallbackServer(port: number): Promise<string> {
  return new Promise((resolve) => {
    const server = Deno.serve({ port }, (req) => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      
      if (error) {
        console.error(`\n❌ OAuth Error: ${error}`);
        const errorDesc = url.searchParams.get("error_description");
        if (errorDesc) console.error(`   Description: ${errorDesc}`);
        
        const response = new Response(
          `<html><body><h1>OAuth Error</h1><p>${error}: ${errorDesc}</p></body></html>`,
          { headers: { "Content-Type": "text/html" }, status: 400 }
        );
        return response;
      }
      
      if (code) {
        console.log("\n✅ Authorization code received!");
        console.log(`Code: ${code}`);
        console.log(`State: ${state}`);
        
        const response = new Response(
          `<html>
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
          </html>`,
          { headers: { "Content-Type": "text/html" }, status: 200 }
        );
        
        setTimeout(() => {
          server.unref();
          resolve(code);
        }, 1000);
        
        return response;
      }
      
      return new Response(
        `<html><body><h1>Waiting for OAuth callback...</h1></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    });
    
    console.log(`\n🚀 Local callback server started on http://localhost:${port}`);
  });
}

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

async function main() {
  console.log("=== OAuth Setup with ngrok ===\n");
  
  // 1. ngrok URLを取得または起動
  let ngrokUrl = await checkNgrok();
  if (!ngrokUrl) {
    console.log("ngrok is not running. Please start it manually:");
    console.log(`\n  ngrok http ${LOCAL_PORT}\n`);
    console.log("Then run this script again.\n");
    
    // ngrokの手動起動を待つ
    console.log("Checking for ngrok every 5 seconds...");
    while (!ngrokUrl) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      ngrokUrl = await checkNgrok();
      if (ngrokUrl) {
        console.log(`\n✅ ngrok detected: ${ngrokUrl}`);
      } else {
        console.log("Still waiting for ngrok...");
      }
    }
  } else {
    console.log(`✅ Using existing ngrok tunnel: ${ngrokUrl}`);
  }
  
  const callbackUrl = `${ngrokUrl}/callback`;
  console.log(`\nCallback URL: ${callbackUrl}`);
  
  // 2. OAuthクライアント登録を試みる
  console.log("\n=== Registering OAuth Client ===");
  
  const clientName = `ngrok Test Client ${Date.now()}`;
  const registerResponse = await fetch(`${BASE_URL}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [callbackUrl]
    })
  });
  
  if (!registerResponse.ok) {
    const error = await registerResponse.text();
    console.error("\n❌ Registration failed with ngrok URL:", error);
    console.log("\nThe server only accepts specific redirect URIs.");
    console.log("Falling back to manual process with Claude's redirect URI...\n");
    
    // Claude's URIで再登録
    const claudeResponse = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]
      })
    });
    
    if (!claudeResponse.ok) {
      console.error("Failed to register with Claude's URI");
      return;
    }
    
    const clientData = await claudeResponse.json();
    console.log("✅ Registered with Claude's redirect URI");
    
    // PKCE準備
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // 認証URL生成
    const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
    authUrl.searchParams.set("client_id", clientData.client_id);
    authUrl.searchParams.set("redirect_uri", "https://claude.ai/api/mcp/auth_callback");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", `ngrok-test-${Date.now()}`);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    
    console.log("\n=== Manual OAuth Flow Required ===");
    console.log("\n1. Open this URL in your browser:");
    console.log(authUrl.toString());
    
    console.log("\n2. After authorization, copy the 'code' parameter from the URL");
    
    console.log("\n3. Exchange the code for a token:");
    console.log(`\ncurl -X POST ${BASE_URL}/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code&code=YOUR_CODE&client_id=${clientData.client_id}&client_secret=${clientData.client_secret}&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_verifier=${codeVerifier}"`);
    
    console.log("\n=== Save These Values ===");
    console.log(`export TEST_CLIENT_ID="${clientData.client_id}"`);
    console.log(`export TEST_CLIENT_SECRET="${clientData.client_secret}"`);
    console.log(`export TEST_CODE_VERIFIER="${codeVerifier}"`);
    
    return;
  }
  
  // ngrok URLが許可された場合（現在は許可されていないが、将来的な可能性として）
  const clientData = await registerResponse.json();
  console.log("✅ Client registered with ngrok URL!");
  
  // 3. ローカルサーバー起動
  const codePromise = startCallbackServer(LOCAL_PORT);
  
  // 4. PKCE準備
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // 5. 認証URL生成
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientData.client_id);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", `ngrok-test-${Date.now()}`);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  console.log("\n=== Open this URL in your browser ===");
  console.log(authUrl.toString());
  
  // 6. 認証コードを待つ
  const code = await codePromise;
  
  // 7. トークン交換
  console.log("\n=== Exchanging code for token ===");
  
  const tokenResponse = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      client_id: clientData.client_id,
      client_secret: clientData.client_secret,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier
    }).toString()
  });
  
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error("Token exchange failed:", error);
    return;
  }
  
  const tokenData = await tokenResponse.json();
  console.log("\n✅ Access token obtained!");
  console.log("\nSet environment variable:");
  console.log(`export TEST_ACCESS_TOKEN="${tokenData.access_token}"`);
  
  // 8. トークンテスト
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
    console.log("\nYou can now run:");
    console.log("./test-mcp-tools-enhanced.ts");
  }
}

if (import.meta.main) {
  await main();
}