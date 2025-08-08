# ChatGPT Actions実装ガイド

> 2025年1月8日作成
> intervals-mcp-serverでのChatGPT Actions API実装で得られた知見

## 概要

ChatGPTがintervals.icuデータにアクセスできるようにするためのActions API実装。
MCPの制限（Deep Researchモード排他性）により、RESTful APIアプローチを採用。

## アーキテクチャ設計

### エンドポイント設計（6エンドポイント制限対応）

```yaml
# 最適化された6エンドポイント構成
GET  /api/v1/activities          # 複数アクティビティ取得
GET  /api/v1/activities/{id}/streams    # ストリームデータ
GET  /api/v1/activities/{id}/intervals  # インターバルデータ
GET  /api/v1/wellness            # ウェルネスデータ取得
POST /api/v1/wellness/update     # ウェルネス更新＋UCR再計算
GET  /api/v1/ucr                 # UCR評価取得
```

### 認証方式

APIキー認証（X-API-Key header）を採用：
- OAuth2より実装・管理が簡単
- ChatGPTが確実にサポート
- 設定が直感的

## 実装のポイント

### 1. ハンドラー構成

```typescript
// actions/activities-handler.ts
export class ActivitiesHandler {
  constructor(private client: IntervalsAPIClient) {}
  
  async getActivities(req: Request): Promise<Response> {
    // ChatGPT向けにデータを整形
    const formattedActivities = activities.map(a => this.formatActivity(a));
    return new Response(JSON.stringify({
      activities: formattedActivities,
      count: formattedActivities.length,
      period: { from, to, days }
    }));
  }
}
```

### 2. 認証ミドルウェア

```typescript
// actions/auth-middleware.ts
export function authMiddleware(
  req: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  const apiKey = req.headers.get("X-API-Key");
  if (!apiKey || apiKey !== Deno.env.get("API_KEY")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }
  return handler(req);
}
```

### 3. OpenAPI仕様書

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: Intervals.icu API for ChatGPT
  version: 1.0.0
servers:
  - url: https://your-app.deno.dev
paths:
  /api/v1/activities:
    get:
      operationId: getActivities
      security:
        - ApiKeyAuth: []
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
```

### 4. ChatGPTマニフェスト

```json
// .well-known/ai-plugin.json
{
  "schema_version": "v1",
  "name_for_human": "Intervals.icu",
  "name_for_model": "intervals_icu",
  "description_for_human": "Access your training data and wellness metrics",
  "description_for_model": "Access intervals.icu training data, wellness metrics, and UCR assessments",
  "auth": {
    "type": "service_http",
    "authorization_type": "bearer",
    "verification_tokens": {}
  },
  "api": {
    "type": "openapi",
    "url": "https://your-app.deno.dev/openapi.yaml"
  }
}
```

## 遭遇した問題と解決策

### 問題1: メソッドのthisバインディング

**問題コード:**
```typescript
const formattedActivities = activities.map(this.formatActivity);
// Error: Cannot read properties of undefined (reading 'formatDuration')
```

**解決策:**
```typescript
const formattedActivities = activities.map(a => this.formatActivity(a));
```

**理由:** JavaScriptのmapでメソッド参照を渡すとthisコンテキストが失われる

### 問題2: UCR型定義の不一致

**問題:**
```typescript
// UCRWithTrendには直接interpretationやtraining_recommendationがない
assessment.interpretation  // エラー
assessment.training_recommendation  // エラー
```

**解決策:**
```typescript
interpretation: assessment.recommendation?.description || "",
recommendation: assessment.trainingRecommendation || assessment.recommendation?.action || ""
```

### 問題3: 重複メソッド定義

**問題:** intervals-client.tsに同名メソッドが複数定義されていた

**解決策:** 
- 早期の簡易実装を削除
- 完全な実装のみを残す

### 問題4: Deno KVの初期化

**問題:**
```typescript
private kv: Deno.Kv;  // TypeScript error: not definitely assigned
```

**解決策:**
```typescript
private kv?: Deno.Kv;
// 使用前に初期化チェック
if (!this.kv) throw new Error("KV not initialized");
```

## ChatGPTとの統合手順

1. **Deno Deployにデプロイ**
   ```bash
   deployctl deploy --project=intervals-mcp main.ts
   ```

2. **環境変数設定**
   - ATHLETE_ID
   - API_KEY  
   - JWT_SECRET_KEY
   - ORIGIN

3. **ChatGPTでActions追加**
   - Settings → Actions → Create new action
   - Import from URL: `https://your-app.deno.dev/openapi.yaml`
   - APIキー設定

4. **動作確認**
   ```
   "Show my activities from the last 7 days"
   "What's my UCR score today?"
   "Update my wellness: fatigue 3, stress 2"
   ```

## ベストプラクティス

1. **データ整形**: ChatGPTが理解しやすい形式に変換
2. **エラーハンドリング**: 明確なエラーメッセージ
3. **レスポンス最適化**: 必要な情報のみを返す
4. **セキュリティ**: APIキーは環境変数で管理

## 今後の改善案

1. レート制限の実装
2. キャッシュ機能の追加
3. エラーログの詳細化
4. WebSocketサポート（リアルタイム更新）

---

*最終更新: 2025年1月8日*