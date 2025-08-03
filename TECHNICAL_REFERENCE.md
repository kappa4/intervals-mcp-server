# 技術リファレンス - Intervals.icu MCP Server

## 🏗️ システムアーキテクチャ

### コンポーネント構成
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude.ai     │───▶│   MCP Server     │───▶│  Intervals.icu  │
│  (MCP Client)   │    │ (OAuth + Tools)  │    │      API        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │
        │                        ▼
        │               ┌──────────────────┐
        └──────────────▶│  OAuth 2.1 Flow  │
                        │     (PKCE)       │
                        └──────────────────┘
```

### 通信フロー
1. **Discovery**: Claude.ai が OAuth メタデータを取得
2. **DCR**: 動的クライアント登録でクライアント情報生成
3. **Authorization**: PKCE フローで認可コード取得
4. **Token Exchange**: アクセストークン取得
5. **MCP Communication**: SSE 経由で MCP リクエスト処理

## 🔌 MCP プロトコル実装

### SSE Transport パターン
```python
# 成功パターン（simple_integrated.py）
sse_app = mcp.sse_app()

@app.get("/")
async def root_sse(request: Request):
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)
```

**重要**: `request.send.__wrapped__` が鍵。これにより FastAPI と FastMCP の ASGI 互換性が確保される。

### エンドポイント設計
```
GET/POST /          # メイン MCP エンドポイント  
GET/POST /sse       # MCP SSE 互換
GET/POST /mcp       # MCP 代替エンドポイント
POST /messages/*    # セッション管理付きメッセージング
```

## 🔐 OAuth 2.1 実装詳細

### サポート仕様
- **RFC 6749**: OAuth 2.0 基本フロー
- **RFC 7636**: PKCE (Proof Key for Code Exchange)
- **RFC 7591**: 動的クライアント登録 (DCR)
- **RFC 8414**: 認可サーバーメタデータ

### 実装クラス・関数
```python
# oauth.py 主要関数
async def register_oauth_client(request: Request)          # DCR
async def handle_authorization_request(request: Request)   # 認可エンドポイント
async def handle_token_request(...)                       # トークンエンドポイント
async def verify_oauth_or_api_key(request: Request)       # 認証ミドルウェア
```

### JWT トークン構造
```json
{
  "iss": "https://your-server.railway.app",
  "sub": "client_12345",
  "aud": "intervals-mcp-server", 
  "exp": 1691234567,
  "iat": 1691230967,
  "scope": "intervals:read intervals:write",
  "client_id": "client_12345"
}
```

## 🛠️ 開発・デバッグ情報

### ローカル開発環境
```bash
# 開発サーバー起動
PORT=9001 \
MCP_API_KEY=test_key \
ALLOWED_ORIGINS=* \
BASE_URL=http://localhost:9001 \
JWT_SECRET_KEY=test_jwt_secret_key_minimum_32_chars \
ATHLETE_ID=i123456 \
API_KEY=your_real_api_key \
uv run python src/intervals_mcp_server/simple_integrated.py
```

### 重要なログメッセージ
```bash
# 正常起動
"Environment validation passed"
"OAuth 2.1 authentication and MCP protocol integrated" 
"Ready for Claude.ai connections"

# MCP 通信正常
"Processing request of type ListToolsRequest"
"Processing request of type CallToolRequest"

# 問題のあるログ  
"WARNING - Received request without session_id"  # セッション管理問題
"Authentication failed"                          # OAuth 問題
```

### デバッグエンドポイント
```bash
GET /health     # ヘルスチェック + 基本情報
GET /config     # 設定確認（機密情報除く）
GET /.well-known/oauth-authorization-server  # OAuth メタデータ
```

## 🔧 Intervals.icu API 統合

### 主要ツール
```python
@mcp.tool()
async def get_activities(...)           # アクティビティ一覧
async def get_activity_details(...)     # 詳細データ取得  
async def get_events(...)               # イベント管理
async def get_wellness_data(...)        # ウェルネスデータ
async def add_events(...)               # イベント追加
```

### API エラーハンドリング
```python
# レート制限対応
if response.status_code == 429:
    return "Rate limit exceeded. Please wait before making more requests."

# 認証エラー  
if response.status_code == 401:
    return "Authentication failed. Please check your API key."
```

## 🐳 Docker デプロイ設定

### Dockerfile 構成
```dockerfile
FROM python:3.12-slim
WORKDIR /app

# システム依存関係
RUN apt-get update && apt-get install -y build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# uv インストール（バックアップ用）
RUN pip install uv

# 依存関係インストール（pip使用でDocker互換性向上）
COPY requirements.txt README.md ./
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコピー
COPY src/ ./src/
COPY app.py ./

# 非root ユーザー
RUN useradd --create-home app && chown -R app:app /app
USER app

# 実行（標準Python使用）
CMD ["python", "app.py"]
```

### Docker トラブルシューティング
1. **README.md エラー**: `pyproject.toml` が README.md を参照
   - 解決: requirements.txt を使用
2. **uv 依存エラー**: FastMCP が uv コマンドを要求
   - 解決: pip install で標準環境構築

### Railway 設定
```toml
# railway.toml
[build]
builder = "dockerfile"

[deploy]  
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "always"
```

## ⚠️ 既知の問題と回避策

### 1. FastMCP の uv 依存
- **問題**: Railway 標準環境に `uv` コマンドなし
- **回避**: Docker デプロイで `uv` をインストール

### 2. プロキシアーキテクチャ問題  
- **問題**: セッション ID が転送されない
- **解決済み**: 統合サーバーアーキテクチャに変更

### 3. ASGI 互換性
- **問題**: FastAPI と FastMCP の ASGI 差異
- **解決**: `request.send.__wrapped__` パターン使用

## 🎯 パフォーマンス最適化

### レスポンス時間目標
- **ヘルスチェック**: < 100ms
- **OAuth フロー**: < 2s  
- **MCP リクエスト**: < 5s
- **Intervals.icu API**: < 10s

### メモリ使用量
- **基本使用量**: ~50MB
- **最大使用量**: ~200MB（大量データ処理時）

## 🔮 将来の拡張ポイント

### 機能拡張
1. **キャッシュ機能** - Redis でデータキャッシュ
2. **バッチ処理** - 複数アクティビティ一括取得
3. **Webhook サポート** - Intervals.icu からのプッシュ通知
4. **マルチテナント** - 複数アスリート対応

### 技術的改善
1. **メトリクス収集** - Prometheus 対応
2. **分散トレーシング** - OpenTelemetry 統合  
3. **ログ集約** - 構造化ログ + ELK Stack
4. **API バージョニング** - 後方互換性保持

---

**最終更新**: 2025-08-03  
**保守担当**: 引き継ぎ先チーム