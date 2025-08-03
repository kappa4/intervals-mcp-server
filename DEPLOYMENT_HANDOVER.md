# Intervals MCP Server - Deno Deploy デプロイメント引き継ぎ資料

## 作業概要

**実施日**: 2025-08-03  
**作業内容**: TypeScript版Intervals MCP ServerのDeno Deployデプロイメント準備  
**現在状況**: Phase 1 & 2完了、Phase 3実施中

## 完了事項

### ✅ Phase 1: TypeScript/Deno基盤構築
- Intervals.icu APIクライアント実装
- MCP プロトコルハンドラー（6ツール）
- 環境変数バリデーション
- ログシステム実装

### ✅ Phase 2: OAuth 2.1認証統合
- OAuth 2.1サーバー完全実装
- PKCE (S256) サポート
- Claude Desktop対応（public client）
- Bearer token認証統合

### ✅ Phase 3（一部）: デプロイメント準備
- **GitHub準備**: TypeScript実装をmainブランチにプッシュ済み
- **Deno KV移行**: OAuthトークンストレージをDeno KV対応に移行
  - 永続化対応（デプロイ時のデータ保持）
  - 分散環境対応（複数インスタンス間での共有）
  - 自動TTL設定（トークン有効期限管理）

## 残作業（Phase 3継続）

### 1. Deno Deploy プロジェクト作成

**手順:**
1. https://dash.deno.com にアクセス
2. GitHubアカウントでサインイン
3. "New Project" → "Deploy from GitHub repository"
4. リポジトリ選択: `kappa4/intervals-mcp-server`
5. 設定:
   - Entry Point: `intervals-mcp-ts/main.ts`
   - Branch: `main`
   - Auto-deploy: 有効

### 2. 環境変数設定

Deno Deployダッシュボードで以下の環境変数を設定：

```env
ATHLETE_ID=i123456                              # Intervals.icu athlete ID
API_KEY=your_actual_intervals_api_key           # Intervals.icu API key
JWT_SECRET_KEY=generate_32_char_random_string   # OAuth JWT secret（32文字以上）
ORIGIN=https://your-project-name.deno.dev       # デプロイ後のURL
```

**JWT_SECRET_KEY生成例:**
```bash
openssl rand -base64 32
```

### 3. デプロイ動作確認

**確認エンドポイント:**
- Health check: `https://your-project.deno.dev/health`
- OAuth discovery: `https://your-project.deno.dev/.well-known/oauth-authorization-server`
- Info endpoint: `https://your-project.deno.dev/info`

**期待レスポンス例:**
```json
// /health
{
  "status": "healthy",
  "service": "intervals-mcp-server",
  "version": "1.0.0",
  "athlete_id": "i123456",
  "timestamp": "2025-08-03T..."
}
```

### 4. Claude Desktop接続設定

Claude Desktop設定ファイル（`~/Library/Application Support/Claude/claude_desktop_config.json`）に追加：

```json
{
  "mcpServers": {
    "intervals": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-intervals@latest",
        "https://your-project-name.deno.dev"
      ],
      "oauth": "oauth2"
    }
  }
}
```

## 技術的重要事項

### OAuth実装の特徴
- **PKCE必須**: Claude Desktop要件
- **Public Client対応**: `token_endpoint_auth_method: "none"`
- **Deno KV使用**: トークン永続化、自動TTL管理

### セキュリティ考慮事項
- JWT_SECRET_KEYは必ず32文字以上
- ORIGIN環境変数は本番URLに設定
- API_KEYは実際のIntervals.icu APIキーを使用

### トラブルシューティング

**デプロイが失敗する場合:**
1. Entry pointパスが正しいか確認
2. 環境変数がすべて設定されているか確認
3. Deno Deploy logsで詳細エラーを確認

**OAuth認証が機能しない場合:**
1. ORIGIN環境変数が実際のデプロイURLと一致しているか確認
2. JWT_SECRET_KEYが32文字以上か確認
3. OAuth discoveryエンドポイントが正しく応答するか確認

## 次のステップ

1. Deno Deployでプロジェクト作成・環境変数設定
2. デプロイ成功確認
3. Claude Desktop設定・接続テスト
4. 本番運用開始

## 参考資料

- **GitHubリポジトリ**: https://github.com/kappa4/intervals-mcp-server
- **Memory MCP参考実装**: `/Users/k.takahashi/src/memory-mcp/deno-deploy/`
- **Deno Deploy Docs**: https://deno.com/deploy/docs
- **MCP Specification**: https://modelcontextprotocol.io/docs

---

**最終更新**: 2025-08-03  
**作業者**: Claude Code  
**次回作業**: Deno Deployプロジェクト作成・環境変数設定