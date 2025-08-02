# 開発記録とベストプラクティス

## プロジェクト概要

Intervals.icu API用のMCP（Model Context Protocol）サーバーの開発において遭遇した問題と解決策をまとめた記録です。

## 重要な学習事項

### 1. MCPプロトコル準拠の重要性

**問題**: プロキシアーキテクチャによりセッション管理が破綻

**原因**: 
- FastAPI（Port 9000）→ 内部MCPサーバー（Port 9001）の二段構成
- セッションIDがプロキシ間で正しく伝達されない
- MCP初期化シーケンスがプロキシ層で断絶

**解決策**: 
- プロキシ構造を廃止し、FastMCPの統合実装を採用
- `FastMCP.sse_app()`を直接FastAPIアプリに統合

**教訓**: 
- **MCP仕様を必ず参照する**: https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- セッション管理は複雑なため、ライブラリのネイティブ実装を利用する
- プロキシ構造は避け、可能な限り単一アプリケーション構成にする

### 2. Transport and Auth 要件への準拠

**必須要件**:
- Claude supports both SSE- and Streamable HTTP-based remote servers
- Claude supports both authless and OAuth-based remote servers
- OAuth 2.1仕様準拠（2025-03-26 auth spec準拠）
- Dynamic Client Registration (DCR) サポート
- PKCE必須（公開クライアント）
- Claude's OAuth callback URL: `https://claude.ai/api/mcp/auth_callback`

**実装のポイント**:
- セッション管理はFastMCPに委ねる
- 認証はミドルウェアレベルで実装
- エンドポイント: `/`, `/sse`, `/mcp`, `/messages/{path}`

### 3. アーキテクチャ進化の記録

#### 初期実装（問題あり）
```
Claude Client → FastAPI Proxy (Port 9000) → MCP Server (Port 9001)
                ↑ OAuth認証                  ↑ FastMCP SSE
```

**問題**:
- セッションIDの伝達エラー
- 初期化シーケンスの断絶
- `WARNING - Received request without session_id`
- `WARNING - Received invalid session ID`

#### 最終実装（成功）
```
Claude Client → 統合FastAPIサーバー (Port 9000)
               ↑ OAuth認証 + FastMCP SSE直接統合
```

**成功要因**:
- プロキシ排除
- FastMCPのネイティブセッション管理
- 単一プロセス、単一ポート

### 4. 実装で参照すべきリソース

**必読文書**:
1. [Building Custom Connectors via Remote MCP Servers](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
2. [MCP Specification](https://modelcontextprotocol.io/specification)
3. [OAuth 2.1 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

**重要なAPIリファレンス**:
- FastMCP: https://pypi.org/project/fastmcp/
- Intervals.icu API: https://support.intervals.icu/collection/128-intervals-icu-api

### 5. デバッグとトラブルシューティング

**よくある問題**:

1. **セッションID関連エラー**
   - 症状: `WARNING - Received request without session_id`
   - 原因: プロキシ構造、不適切なクエリパラメータ転送
   - 解決: FastMCPネイティブ実装の使用

2. **OAuth認証エラー**
   - 症状: `401 Unauthorized`
   - 原因: JWT秘密鍵の設定、トークンの有効期限
   - 解決: 環境変数の確認、適切なスコープ設定

3. **CORS問題**
   - 症状: ブラウザでのクロスオリジンエラー
   - 解決: `ALLOWED_ORIGINS`環境変数の設定

**デバッグログの見方**:
```bash
# 認証成功の確認
grep "JWT decoded successfully" logs/

# セッション管理の確認  
grep "session_id" logs/

# MCPリクエスト処理の確認
grep "Processing request of type" logs/
```

### 6. 環境変数設定

**必須環境変数**:
```bash
# MCP Server
PORT=9000
HOST=0.0.0.0
BASE_URL=https://your-domain.com

# Authentication
MCP_API_KEY=your_api_key
JWT_SECRET_KEY=minimum_32_character_secret
ALLOWED_ORIGINS=*

# Intervals.icu API
ATHLETE_ID=i123456
API_KEY=your_intervals_api_key
```

### 7. テスト方法

**ローカル開発**:
```bash
# 統合サーバー起動
uv run python -m intervals_mcp_server.simple_integrated

# SSE接続テスト
curl -H "Accept: text/event-stream" -H "X-API-Key: test_key" http://localhost:9000/

# OAuth discovery テスト
curl http://localhost:9000/.well-known/oauth-authorization-server
```

**本番環境テスト**:
1. ngrok tunnel設定
2. Claude.aiでMCP設定
3. 認証フロー確認
4. ツール実行テスト

## 今回の開発で避けるべき落とし穴

1. **プロキシ構造の採用** - セッション管理を複雑化
2. **MCP仕様の軽視** - Transport and Auth要件を必ず確認
3. **推測実装** - 不明な点は仕様書を参照
4. **単体でのデバッグ不足** - 統合前に各コンポーネントを個別テスト

## 成功パターン

1. **FastMCPのネイティブ実装を信頼**
2. **OAuth 2.1とPKCEの正しい実装**
3. **単一プロセス、単一ポートの構成**
4. **段階的テスト（ローカル→ngrok→本番）**

## 次回開発時のチェックリスト

- [ ] MCP仕様の最新版を確認
- [ ] FastMCPのドキュメントを確認
- [ ] プロキシ構造を避ける
- [ ] OAuth 2.1準拠を確認
- [ ] セッション管理はライブラリに委ねる
- [ ] 段階的にテストを実施

---

**最終更新**: 2025-08-03
**プロジェクト状態**: 本番リリース準備完了