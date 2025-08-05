# セキュリティとログ管理の推奨事項

## 1. 本番環境でのログレベル調整

現在DEBUGレベルで詳細な情報が出力されていますが、本番環境では以下を推奨：

```typescript
// logger.ts
const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "INFO"; // 本番はINFO推奨

// 機密情報のマスキング
function sanitizeToken(token: string): string {
  return token.substring(0, 8) + "..." + token.substring(token.length - 4);
}
```

## 2. トークン管理の強化

```typescript
// 定期的なトークンクリーンアップ
setInterval(async () => {
  await oauthServer.cleanup();
}, 60 * 60 * 1000); // 1時間ごと
```

## 3. レート制限の実装

```typescript
// rate-limiter.ts
export class RateLimiter {
  private requests = new Map<string, number[]>();
  
  async checkLimit(clientId: string, limit = 100, window = 60000): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    const recentRequests = requests.filter(t => t > now - window);
    
    if (recentRequests.length >= limit) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(clientId, recentRequests);
    return true;
  }
}
```

## 4. エラーレスポンスの標準化

```typescript
// 本番環境では詳細なエラー情報を隠す
if (Deno.env.get("DENO_ENV") === "production") {
  return {
    error: "Internal server error",
    code: -32603
  };
}
```