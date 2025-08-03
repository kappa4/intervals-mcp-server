#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Local OAuth Test Helper
 * ローカルでOAuth認証コードを取得するヘルパー
 */

const BASE_URL = "https://kpnco-intervals-mcp-77.deno.dev";

// ローカルサーバーを起動してリダイレクトを受け取る
async function startLocalServer(port: number = 8080): Promise<string> {
  return new Promise((resolve) => {
    const server = Deno.serve({ port }, (req) => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      
      if (code) {
        console.log("\n✅ Authorization code received!");
        console.log(`Code: ${code}`);
        console.log(`State: ${state}`);
        
        // ブラウザに成功メッセージを表示
        const response = new Response(
          `<html>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>✅ Authorization Successful!</h1>
              <p>Authorization code: <code>${code}</code></p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>`,
          { 
            headers: { "Content-Type": "text/html" },
            status: 200 
          }
        );
        
        // サーバーを停止
        setTimeout(() => {
          server.unref();
          resolve(code);
        }, 1000);
        
        return response;
      }
      
      return new Response("Waiting for OAuth callback...", { status: 200 });
    });
    
    console.log(`\n🚀 Local server started on http://localhost:${port}`);
    console.log("Waiting for OAuth redirect...\n");
  });
}

// カスタムリダイレクトURIでクライアント登録を試みる
async function registerWithCustomRedirect(redirectUri: string) {
  const clientName = `Local Test Client ${Date.now()}`;
  
  console.log(`Attempting to register with redirect URI: ${redirectUri}`);
  
  const response = await fetch(`${BASE_URL}/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Registration failed:", error);
    return null;
  }

  const data = await response.json();
  console.log("✅ Client registered successfully!");
  return data;
}

// PKCE code verifierとchallengeを生成
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
  console.log("=== Local OAuth Test Helper ===\n");
  
  const port = 8080;
  const localRedirectUri = `http://localhost:${port}/callback`;
  
  // 1. ローカルリダイレクトURIで登録を試みる
  let clientData = await registerWithCustomRedirect(localRedirectUri);
  
  if (!clientData) {
    console.log("\nLocal redirect URI not allowed. Trying with Claude's URI...");
    
    // 2. Claude's URIで登録
    const claudeUri = "https://claude.ai/api/mcp/auth_callback";
    clientData = await registerWithCustomRedirect(claudeUri);
    
    if (!clientData) {
      console.error("Failed to register OAuth client");
      return;
    }
    
    console.log("\n⚠️  Note: Using Claude's redirect URI.");
    console.log("You'll need to manually copy the code from the redirected URL.");
  }
  
  // 3. PKCE準備
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  console.log("\n=== PKCE Parameters ===");
  console.log(`Code Verifier: ${codeVerifier}`);
  console.log(`Code Challenge: ${codeChallenge}`);
  
  // 4. 認証URLを生成
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientData.client_id);
  authUrl.searchParams.set("redirect_uri", clientData.redirect_uris[0]);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", `local-test-${Date.now()}`);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  console.log("\n=== Authorization URL ===");
  console.log(authUrl.toString());
  console.log("\nOpen this URL in your browser to authorize.");
  
  // 5. ローカルサーバーでリダイレクトを待つ（ローカルリダイレクトの場合のみ）
  if (clientData.redirect_uris[0].includes("localhost")) {
    const code = await startLocalServer(port);
    
    // 6. アクセストークンを取得
    console.log("\n=== Exchanging code for token ===");
    
    const tokenResponse = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: clientData.client_id,
        client_secret: clientData.client_secret,
        redirect_uri: clientData.redirect_uris[0],
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
    
    // 7. トークンをテスト
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
    } else {
      console.error("❌ Token test failed:", testData);
    }
  } else {
    console.log("\n⚠️  Manual steps required:");
    console.log("1. Copy the 'code' parameter from the redirected URL");
    console.log("2. Run the following command with your code:");
    console.log(`\ncurl -X POST ${BASE_URL}/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code&code=YOUR_CODE&client_id=${clientData.client_id}&client_secret=${clientData.client_secret}&redirect_uri=${clientData.redirect_uris[0]}&code_verifier=${codeVerifier}"`);
  }
  
  // 環境変数として保存
  console.log("\n=== Save these for later use ===");
  console.log(`export TEST_CLIENT_ID="${clientData.client_id}"`);
  console.log(`export TEST_CLIENT_SECRET="${clientData.client_secret}"`);
  console.log(`export TEST_CODE_VERIFIER="${codeVerifier}"`);
}

if (import.meta.main) {
  await main();
}