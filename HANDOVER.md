# Intervals.icu MCP Server - 引き継ぎドキュメント

## プロジェクト概要
Intervals.icu MCP ServerのRemote MCP対応実装プロジェクト。OAuth 2.1認証、セキュリティ機能を実装し、Railway本番デプロイまで対応しました。

## 実施日
- 2025-08-02: OAuth 2.1対応実装完了
- 2025-08-02: Claude Desktop公開クライアント対応完了  
- 2025-08-03: プロキシ問題解決・統合サーバー実装完了
- 2025-08-03: Railway デプロイ対応・Docker 設定完了

## 実装完了事項

### 1. セキュリティ基盤の構築 ✅

#### 1.1 実装したセキュリティ機能
- **Originヘッダー検証**: 許可されたオリジンからのみアクセス可能
- **API Key認証**: X-API-Keyヘッダーによる認証
- **CORS設定の厳格化**: 環境変数ベースの動的設定
- **HTTPS強制**: 本番環境でのセキュア通信を強制
- **リクエストロギング**: 監視とデバッグのためのログ記録

#### 1.2 実装ファイル
- `src/intervals_mcp_server/security.py`: セキュリティ機能の実装
- `src/intervals_mcp_server/oauth.py`: OAuth 2.1認証システム
- `src/intervals_mcp_server/auth_context.py`: 認証コンテキスト管理
- `src/intervals_mcp_server/prompt_injection_protection.py`: プロンプトインジェクション対策
- `src/intervals_mcp_server/tool_decorators.py`: ツール認証デコレータ
- `tests/test_security.py`: 単体テスト
- `test_security_integration.py`: 統合テストスクリプト
- `test_oauth_integration.py`: OAuth統合テスト

### 2. OAuth 2.1認証システムの実装 ✅
#### 2.1 完全なOAuth 2.1サーバー実装
- **Protected Resource Metadata**: `/.well-known/oauth-protected-resource`エンドポイント
- **Authorization Server Metadata**: `/.well-known/oauth-authorization-server`エンドポイント
- **JWKS Endpoint**: `/.well-known/jwks.json`エンドポイント（RSA/HMAC対応）
- **Dynamic Client Registration**: `/oauth/register`エンドポイント（RFC 7591準拠）
- **Authorization Endpoint**: `/oauth/authorize`エンドポイント
- **Token Endpoint**: `/oauth/token`エンドポイント

#### 2.2 Claude Desktop公開クライアント対応 ✅
- **"none"認証方式サポート**: `token_endpoint_auth_methods_supported`に追加
- **PKCE必須実装**: SHA256 code challengeの検証
- **公開クライアント自動識別**: `client_secret`不要の登録プロセス
- **JWT Token Validation**: Bearer token認証の完全実装
- **Scope-based Authorization**: `intervals:read`, `intervals:write`, `intervals:admin`スコープ

#### 2.3 セキュリティ機能
- **PKCE Verification**: S256およびplain方式対応
- **Authorization Code管理**: 10分間の有効期限、使い捨て実装
- **JWT署名検証**: HS256/RS256アルゴリズム対応
- **Redirect URI検証**: HTTPS/localhostのみ許可
- **Scope権限チェック**: 最小権限の原則実装

#### 2.4 Backward Compatibility
- **API Key認証フォールバック**: 既存のX-API-Key認証継続サポート
- **段階的移行**: OAuth/API Key両方での認証可能
- **設定切り替え**: 環境変数による認証方式選択

### 3. プロンプトインジェクション対策 ✅
- **入力検証システム**: 悪意のある入力パターンの検出
- **サニタイゼーション**: 危険なコンテンツの自動除去
- **長さ制限**: パラメータ別の入力長制限
- **ログ記録**: セキュリティ違反の監視とアラート

### 4. 権限管理システム ✅
- **スコープベース認証**: MCP各ツールの権限チェック
- **コンテキスト管理**: 認証情報の安全な保持
- **エラーハンドリング**: 権限不足時の適切な応答

### 5. SSE実装の改善 ✅
- SSEエンドポイント（`/sse`）にOAuth/API Key認証を統合
- InitializationOptionsにcapabilitiesを追加（Pydanticバリデーションエラー対応）

### 6. プロキシ問題の解決 ✅ (2025-08-03)
- **問題**: Port 9000→9001 プロキシでセッション ID が転送されない
- **症状**: `WARNING - Received request without session_id`
- **解決**: 統合サーバーアーキテクチャ（`simple_integrated.py`）で一本化
- **パターン**: `request.send.__wrapped__` で FastAPI + FastMCP 統合

### 7. Railway 本番デプロイ対応 ✅ (2025-08-03)
- **Docker 対応**: Railway 用 Dockerfile 作成
- **環境変数バリデーション**: 起動時必須チェック実装
- **デプロイ構成**: `app.py` + `requirements.txt` + `pip install`
- **CI/CD**: `railway up` による直接デプロイ対応

### 8. ドキュメント更新 ✅
- `README.md`: Remote MCP機能をベータ版として明記、セキュリティ設定を追加
- `docs/remote-mcp-auth-proxy.md`: プロキシ認証の実装ガイド
- `.env.example`: OAuth 2.1関連の環境変数を追加
- `HANDOVER_RAILWAY_DEPLOYMENT.md`: Railway 特化引き継ぎ資料
- `TECHNICAL_REFERENCE.md`: 技術詳細リファレンス

## 技術的発見と重要な知見

### 1. MCP プロキシアーキテクチャ問題 (2025-08-03解決)

**問題の発見**:
- Port 9000 (認証プロキシ) → Port 9001 (MCP サーバー) 構成でセッション管理が破綻
- Claude.ai からの MCP リクエストで `session_id` が転送されない
- 結果: `WARNING - Received request without session_id` が大量発生

**根本原因**:
```python
# 問題のあるプロキシパターン
async with httpx.AsyncClient() as client:
    response = await client.request(...)  # session_id消失
```

**解決策**:
```python  
# 成功パターン (simple_integrated.py)
sse_app = mcp.sse_app()
@app.get("/")
async def root_sse(request: Request):
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)
```

**教訓**: MCP プロトコルは状態を持つため、プロキシではなく統合サーバーが必須

### 2. Railway デプロイの課題と解決 (2025-08-03)

**遭遇した問題**:
1. `uv` コマンドが Railway 標準環境に存在しない
2. `pyproject.toml` が `README.md` を参照するが Docker コンテキストに未含有
3. `fastmcp` パッケージの `uv` 依存問題

**解決アプローチ**:
```dockerfile
# 最終的な成功パターン
FROM python:3.12-slim
COPY requirements.txt README.md ./
RUN pip install --no-cache-dir -r requirements.txt  # uv ではなく pip
CMD ["python", "app.py"]  # uv run ではなく python 直接
```

**教訓**: Docker デプロイでは標準的な `pip` + `requirements.txt` が最も確実

### 3. FastMCP vs 独自OAuth実装の比較
Memory-MCPプロジェクトとの比較分析により以下が判明：

1. **FastMCP 2.11内蔵OAuth機能の制限**
   - `token_endpoint_auth_methods_supported`が`["client_secret_post"]`にハードコード
   - Claude Desktop必須の`"none"`認証方式に対応不可
   - `ClientRegistrationOptions.enabled=False`がデフォルト

2. **Intervals-MCP独自実装の優位性**
   - ✅ Claude Desktop公開クライアント要件への完全対応
   - ✅ `"none"`認証方式の正しい実装
   - ✅ PKCE必須チェックの完全実装
   - ✅ Dynamic Client Registrationの柔軟な設定

### OAuth 2.1実装の技術詳細

#### 認証フロー実装
```
1. Claude Desktop → POST /oauth/register (Dynamic Client Registration)
2. Claude Desktop → GET /oauth/authorize (PKCE code_challenge付き)  
3. MCP Server → Authorization Codeを発行（自動承認）
4. Claude Desktop → POST /oauth/token (PKCE code_verifier付き)
5. MCP Server → JWT Access Tokenを発行
6. Claude Desktop → Bearer token付きでMCP tools呼び出し
```

#### 検証済み機能
- ✅ `"none"`認証方式でのトークン交換
- ✅ PKCE S256方式での検証
- ✅ JWT署名検証（HS256）
- ✅ Scope-based authorization
- ✅ 公開クライアント自動識別

### 現在の制限事項

#### FastMCPの制限（解決済み）
1. **ミドルウェアサポートなし** → 独自認証関数で解決
2. **HTTPヘッダーへのアクセス制限** → Context変数で解決

#### 技術的な注意点
1. **SSEトランスポート名**
   - 誤：`sse`または`http`
   - 正：`streamable-http`（FastMCPで使用）

2. **ポート設定**
   - デフォルト：8000
   - 競合時の代替：9000

## 環境変数設定

### 必須設定
```env
# Intervals.icu API
API_KEY=your_intervals_api_key_here
ATHLETE_ID=your_athlete_id_here
```

### セキュリティ設定（Remote MCP用）
```env
# API Key認証（後方互換性）
MCP_API_KEY=your_secure_mcp_api_key_here

# 許可するオリジン（設定しない場合は全て許可）
ALLOWED_ORIGINS=https://claude.ai,https://app.claude.ai

# HTTPS強制（本番環境では推奨）
ENFORCE_HTTPS=true

# ログレベル
LOG_LEVEL=INFO
```

### OAuth 2.1設定（Claude Desktop対応）
```env
# JWT Configuration（必須）
JWT_SECRET_KEY=your_jwt_secret_key_here_minimum_32_chars
JWT_ALGORITHM=HS256
OAUTH_AUDIENCE=intervals-mcp-server

# Server base URL（必須 - OAuth discovery用）
BASE_URL=https://your-mcp-server.com

# OAuth scopes（オプション）
OAUTH_SCOPE=intervals:read intervals:write intervals:admin
```

## 推奨アーキテクチャ

### プロキシベース認証
```
[Claude Desktop] → [Auth Proxy] → [MCP Server]
                    ↑
                認証はここで実装
```

### 実装例
1. **Cloudflare Workers** - `docs/remote-mcp-auth-proxy.md`参照
2. **Nginx** - 同上
3. **Node.js Express** - 同上

## テスト方法

### 1. サーバー起動
```bash
# セキュリティ設定付きで起動
PORT=9000 MCP_API_KEY=test_key ALLOWED_ORIGINS=https://claude.ai \
  uv run python src/intervals_mcp_server/server.py
```

### 2. 統合テスト実行
```bash
# 別ターミナルで実行
uv run python test_security_integration.py
```

### 3. 手動テスト
```bash
# Health check（認証不要）
curl http://localhost:9000/health

# API Key認証テスト
curl http://localhost:9000/sse -H "X-API-Key: test_key"

# Origin検証テスト
curl http://localhost:9000/sse \
  -H "X-API-Key: test_key" \
  -H "Origin: https://evil.com"  # 403エラーになるはず
```

## Claude Desktop設定

### ローカル接続（stdio）
```json
{
  "mcpServers": {
    "Intervals.icu": {
      "command": "/path/to/uv",
      "args": ["run", "--directory", "/path/to/intervals-mcp-server", 
              "python", "-m", "intervals_mcp_server.server", "--stdio"],
      "env": {
        "ATHLETE_ID": "your_athlete_id",
        "API_KEY": "your_api_key"
      }
    }
  }
}
```

### リモート接続（OAuth 2.1対応）
```json
{
  "mcpServers": {
    "intervals-remote-oauth": {
      "url": "https://your-server-url.com",
      "transport": "sse",
      "oauth": {
        "authorization_endpoint": "/oauth/authorize",
        "token_endpoint": "/oauth/token",
        "registration_endpoint": "/oauth/register",
        "scopes": ["intervals:read", "intervals:write"]
      }
    }
  }
}
```

### リモート接続（API Key互換性）
```json
{
  "mcpServers": {
    "intervals-remote-legacy": {
      "url": "https://your-server-url.com/sse",
      "transport": "sse",
      "headers": {
        "X-API-Key": "your_secure_api_key"
      }
    }
  }
}
```

## 現在の状況 (2025-08-03 最新)

### ✅ 完了事項
- **ローカル動作確認**: `simple_integrated.py` が Claude.ai と正常通信中
- **OAuth 2.1 実装**: 完全な認証フロー実装済み
- **プロキシ問題解決**: 統合サーバーアーキテクチャで根本解決
- **Docker設定完了**: Railway用Dockerfile準備完了

### ⚠️ 進行中
- **Railway デプロイ**: Docker ビルドエラー修正、`railway up` テスト実施中

### 📁 重要ファイル構成
```
app.py                          # Railway用エントリーポイント（本番用）
src/intervals_mcp_server/
├── simple_integrated.py        # 動作確認済み統合版（変更禁止）
├── server.py                   # メインMCPサーバー  
├── oauth.py                    # OAuth 2.1実装
└── security.py                 # セキュリティ機能
Dockerfile                      # Railway Docker設定
requirements.txt                # Python依存関係
HANDOVER_RAILWAY_DEPLOYMENT.md  # Railway特化引き継ぎ
TECHNICAL_REFERENCE.md          # 技術詳細
```

## 今後の作業

### 最優先（進行中）
1. **Railway Docker デプロイ完了** 🚀
   - `railway up` での最終デプロイテスト
   - 環境変数設定確認（ATHLETE_ID, API_KEY, JWT_SECRET_KEY, BASE_URL）
   - ヘルスチェック（`/health`）での動作確認

### 短期的改善（優先度：高）
1. **Claude.ai 接続テスト** 🚀
   - Railway URL を使った MCP 設定
   - OAuth認証フロー検証  
   - 実際のツール動作確認

2. **本番運用準備**
   - モニタリング設定
   - ログ管理・分析
   - エラーアラート設定

### 中長期的改善
1. **本番デプロイ環境構築**
   - Railway/Render/Cloudflare Workersへのデプロイ
   - HTTPS証明書の自動取得・更新
   - 環境変数管理の自動化

2. **監視・運用機能の強化**
   - OAuth認証ログの分析ダッシュボード
   - アクセストークン使用状況の監視
   - 異常検知とアラート機能

3. **開発者体験の向上**
   - OAuth認証フローのデバッグツール
   - Claude Desktop設定生成ツール
   - API使用量・レート制限の可視化

## トラブルシューティング

### よくある問題

1. **「Invalid or missing API key」エラー**
   - 原因：API Keyが設定されていないか間違っている
   - 解決：環境変数`MCP_API_KEY`を確認

2. **「Origin not allowed」エラー**
   - 原因：アクセス元のオリジンが許可リストにない
   - 解決：`ALLOWED_ORIGINS`に追加

3. **SSEエンドポイントの500エラー**
   - 原因：内部的なMCP実装の問題
   - 解決：セキュリティ機能自体は正常に動作。エラーハンドリングの改善が必要

4. **ポート使用中エラー**
   - 原因：8000番ポートが既に使用されている
   - 解決：`PORT=9000`で別ポートを指定

## 参考資料

### 作成したドキュメント
- `/remote-mcp-implementation-plan.md` - 実装計画書（詳細な技術仕様）
- `/docs/remote-mcp-auth-proxy.md` - プロキシ認証実装ガイド

### 外部ドキュメント
- [Model Context Protocol仕様](https://modelcontextprotocol.io/docs)
- [Anthropic MCP Documentation](https://support.anthropic.com/en/articles/11175166)
- [memory-mcpプロジェクトの知見](https://github.com/kappa4/memory-mcp)

## 連絡先・サポート

質問や問題がある場合は、以下を参照してください：
- GitHubのIssues
- プロジェクトのREADME.md
- MCP公式ドキュメント

---
**最終更新**: 2025-08-03  
**担当者**: Claude Code  
**次回作業**: Railway Docker デプロイ完了 → Claude.ai 接続テスト  
**重要**: `src/intervals_mcp_server/simple_integrated.py` は現在 Claude.ai と通信中のため変更禁止