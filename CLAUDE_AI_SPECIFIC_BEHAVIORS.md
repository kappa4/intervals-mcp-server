# Claude.ai固有の動作と対応方法

## 概要
Claude.aiはMCPサーバーとの連携において、標準的なOAuth 2.1仕様とは異なる独自の実装を持っています。これらの動作は、Memory MCPやIntervals MCPの実装時に発見され、対応が必要となりました。

## 1. 固定client_idの使用

### 問題
Claude.aiはDynamic Client Registration (RFC 7591)を使用せず、固定のclient_idを使用します。ただし、このclient_idは時間とともに変更される可能性があります。

### 確認されているclient_id
- `vxOwrOKlZZO40tGXzqeR0A` - 初期に確認されたID（Memory MCPで使用）
- `FTv44phrjVgJyzvJrU7dGg` - 2025年8月3日に確認された新しいID

### client_idが変更される理由（推測）
1. **セキュリティローテーション** - 定期的なID変更によるセキュリティ強化
2. **インフラストラクチャ更新** - バックエンドシステムの変更に伴う更新
3. **バージョン管理** - APIバージョンや環境ごとの区別

### 対応方法
既知のclient_idを全て事前登録する柔軟な実装：

```typescript
// oauth/auth-server.ts
private async registerClaudeWebClient() {
  const claudeClients = [
    {
      client_id: "vxOwrOKlZZO40tGXzqeR0A",  // Previously known ID
      client_name: "Claude (Legacy)",
      // ... 共通設定
    },
    {
      client_id: "FTv44phrjVgJyzvJrU7dGg",  // Currently used ID
      client_name: "Claude",
      // ... 共通設定
    }
  ];
  
  for (const claudeClient of claudeClients) {
    await this.clientStorage.store(claudeClient);
  }
}
```

## 2. notifications/initializedメソッドの処理

### 問題
Claude.aiは`notifications/initialized`メソッドを送信しますが、これはMCP仕様では通知（notification）として扱われ、レスポンスIDを持ちません。

### 対応方法
通知の場合は202 Acceptedを返す：

```typescript
// mcp-handler.ts
case "notifications/initialized":
  if (!request.id) {
    // 通知にはIDがないため、nullを返す
    // HTTPハンドラーが202 Acceptedを返す
    return null as any;
  }
  return this.createResponse(request.id, {});
```

```typescript
// HTTPハンドラー側
if (!mcpResponse) {
  return new Response(null, {
    status: 202,
    headers: {
      ...corsHeaders,
      "mcp-session-id": crypto.randomUUID(),
    },
  });
}
```

## 3. ツールリストが表示されない問題

### 症状
- OAuth認証は成功する
- MCPサーバーに接続される
- しかし、ツールリストが表示されない

### 原因
`notifications/initialized`メソッドのサポートが不足していると、Claude.aiは初期化シーケンスを完了できません。

### 解決策
上記の`notifications/initialized`メソッドのサポートを追加することで解決。

## 今後の実装への教訓

1. **Memory MCPの実装を参考にする**
   - Claude.ai固有の動作は既にMemory MCPで対応済み
   - 新しいMCPサーバーを作る際は、Memory MCPの実装パターンを確認
   - ただし、client_idは変更される可能性があることに注意

2. **固定client_idの事前登録**
   - サーバー起動時に必ずClaude Web用クライアントを登録
   - Dynamic Client Registrationに依存しない
   - 複数の既知のclient_idを登録する柔軟な実装を推奨

3. **通知メソッドの適切な処理**
   - `notifications/`プレフィックスを持つメソッドは通知として扱う
   - 通知の場合は202 Acceptedを返す

4. **エラーメッセージの確認**
   - `invalid_client`エラー → 固定client_idの登録漏れ、または新しいclient_idへの変更
   - ツールリストが表示されない → notifications/initializedの処理漏れ

5. **client_id変更への対応**
   - ログで`Client not found`エラーが出た場合、新しいclient_idを確認
   - 定期的にclient_idの変更をモニタリング
   - 新しいclient_idが発見されたら、既知のリストに追加

## 参考実装

- Memory MCP (Deno Deploy版): `/src/memory-mcp/deno-deploy/`
- Intervals MCP (TypeScript版): `/intervals-mcp-ts/`

両実装とも同じ問題に遭遇し、同じ解決策を適用しています。