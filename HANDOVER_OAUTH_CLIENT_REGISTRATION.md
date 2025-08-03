# Intervals MCP TypeScript版 OAuth Client登録実装の引き継ぎ資料

## 概要
Claude.aiとの連携において発生したOAuth認証エラーの調査と解決の記録です。

## 発見された問題

### 1. Claude.aiの固定client_id
Claude.aiはDynamic Client Registration (RFC 7591)を使用せず、固定のclient_idを使用しています。

**確認されたclient_id:**
- `vxOwrOKlZZO40tGXzqeR0A` - 初期に確認されたID（Memory MCPで使用）
- `FTv44phrjVgJyzvJrU7dGg` - 2025年8月3日に新たに発見されたID

### 2. client_idが変更される理由（推測）
- セキュリティローテーション
- インフラストラクチャの更新
- APIバージョンや環境の区別

## 現在の実装状況

### 1. 暫定対応（完了済み）
`oauth/auth-server.ts`の`registerClaudeWebClient()`メソッドで、既知の複数のclient_idをハードコードで登録：

```typescript
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

### 2. 今後の実装方針
Memory MCPの`utils/manual-client-register.ts`と同様のアプローチで、別スクリプトでの登録方式を実装予定。

## Memory MCPの実装分析

Memory MCPでは2つの登録方式を提供：

1. **manual-client-register.ts** - 直接Deno KVに書き込む（開発・デバッグ用）
2. **register-claude-client.ts** - HTTPサーバー経由で登録（本番運用用）

どちらもclient_idはハードコードされているが、用途に応じて使い分けが可能。

## 推奨される実装

### 1. 基本方針
Memory MCPの`manual-client-register.ts`をベースに、以下の改善を加えたスクリプトを作成：

```typescript
// utils/register-claude-clients.ts
#!/usr/bin/env -S deno run --allow-net --allow-env --unstable-kv

import { ClientStorage } from "../oauth/storage/clients.ts";
import type { OAuthClient } from "../oauth/types.ts";

// 環境変数またはデフォルト値から取得
const CLIENT_IDS = Deno.env.get("CLAUDE_CLIENT_IDS")?.split(",") || [
  "vxOwrOKlZZO40tGXzqeR0A",
  "FTv44phrjVgJyzvJrU7dGg"
];

const clientStorage = new ClientStorage();

for (const clientId of CLIENT_IDS) {
  const client: OAuthClient = {
    client_id: clientId,
    client_secret: undefined,
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    is_public_client: true,
    created_at: Date.now(),
  };
  
  try {
    await clientStorage.store(client);
    console.log(`✅ Registered Claude client: ${clientId}`);
  } catch (error) {
    console.error(`❌ Failed to register client ${clientId}:`, error);
  }
}
```

### 2. 使用方法

```bash
# デフォルトのclient_idを登録
deno run utils/register-claude-clients.ts

# 環境変数で指定
CLAUDE_CLIENT_IDS="id1,id2,id3" deno run utils/register-claude-clients.ts
```

### 3. OAuthServerの修正
自動登録コードを削除し、スクリプトでの登録に移行：

```typescript
// constructor内のregisterClaudeWebClient()呼び出しを削除
// initialize()メソッドも不要になる
```

## 残タスク

1. [ ] `utils/register-claude-clients.ts`スクリプトの作成
2. [ ] OAuthServerから自動登録コードの削除
3. [ ] デプロイ手順への登録スクリプト実行の追加
4. [ ] READMEへの手順追加

## 関連ファイル

- `/intervals-mcp-ts/oauth/auth-server.ts` - 現在の暫定実装
- `/intervals-mcp-ts/CLAUDE_AI_SPECIFIC_BEHAVIORS.md` - Claude.ai固有の動作ドキュメント
- `/memory-mcp/deno-deploy/utils/manual-client-register.ts` - 参考実装

## デプロイ情報

- プロジェクト: kpnco-intervals-mcp-77
- URL: https://kpnco-intervals-mcp-77.deno.dev
- 最終デプロイ: 2025年8月3日
- 環境変数: 設定済み（ATHLETE_ID, API_KEY, JWT_SECRET_KEY, ORIGIN）

## 注意事項

1. Claude.aiのclient_idは今後も変更される可能性がある
2. エラーログで`Client not found`が出た場合は新しいclient_idの可能性を調査
3. Deno DeployのKVは結果整合性のため、登録直後は反映されない場合がある