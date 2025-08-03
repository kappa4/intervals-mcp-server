# Intervals.icu MCP Server - Railway デプロイ引き継ぎ資料

**作成日**: 2025-08-03  
**現在の状況**: Railway デプロイ調整中  
**動作状況**: ローカル環境で Claude.ai と正常通信中

## 🎯 プロジェクト概要

Intervals.icu API を Claude.ai から利用するための MCP (Model Context Protocol) サーバー。OAuth 2.1 認証と MCP プロトコルを統合した本番対応実装。

## 📊 現在の動作状況

### ✅ 動作確認済み
- **ローカル実行**: `src/intervals_mcp_server/simple_integrated.py` が Claude.ai と正常通信
- **OAuth 2.1 認証**: PKCE 対応、動的クライアント登録（DCR）実装済み
- **MCP プロトコル**: SSE transport で Claude.ai からのリクエスト処理中
- **全ツール機能**: Activities、Events、Wellness データ取得・操作

### ⚠️ 調整中
- **Railway デプロイ**: `uv` コマンドが見つからないエラーで停止中
- **Docker 対応**: Dockerfile 準備完了、`railway up` テスト予定

## 🏗️ アーキテクチャ構成

### 動作確認済みファイル
```
src/intervals_mcp_server/
├── server.py              # メイン MCP サーバー（動作確認済み）
├── simple_integrated.py   # OAuth + MCP 統合版（Claude.ai 接続中）
├── oauth.py               # OAuth 2.1 実装
├── security.py           # セキュリティ・CORS 設定
└── utils/                 # フォーマット・型定義
```

### Railway 用ファイル
```
app.py                     # Railway 用エントリーポイント
Dockerfile                 # Docker ベースデプロイ用
railway.toml              # Railway Docker 設定  
requirements.txt          # Python 依存関係
Procfile                  # uvicorn 起動設定
```

## 🚀 デプロイ戦略

### 戦略 A：Docker デプロイ（推奨）
- **ファイル**: `Dockerfile`, `railway.toml`
- **利点**: `uv` を確実にインストール、環境完全制御
- **実行**: `railway up` でローカルから直接デプロイ

### 戦略 B：標準 Python デプロイ
- **ファイル**: `Procfile`, `requirements.txt`, `app.py`  
- **問題**: Railway 環境に `uv` がない
- **対処**: `fastmcp` 依存削除済み

## 🔧 技術的詳細

### MCP プロトコル実装
```python
# 動作パターン（simple_integrated.py）
sse_app = mcp.sse_app()

@app.get("/")
async def root_sse(request: Request):
    return await sse_app(request.scope, request.receive, request.send.__wrapped__)
```

### OAuth 2.1 フロー
1. **Discovery**: `/.well-known/oauth-authorization-server`
2. **DCR**: `POST /oauth/register` 
3. **Authorization**: `GET /oauth/authorize` (PKCE)
4. **Token**: `POST /oauth/token`

### 環境変数（必須）
```bash
ATHLETE_ID=i123456
API_KEY=your_intervals_api_key
JWT_SECRET_KEY=32文字以上の秘密鍵
BASE_URL=https://your-railway-url.app
```

## 📋 開発履歴と教訓

### 解決済み問題
1. **プロキシアーキテクチャ問題**
   - 症状: `WARNING - Received request without session_id`
   - 解決: Port 9000→9001 プロキシを削除、統合サーバー化

2. **MCP セッション管理**
   - 解決: `request.send.__wrapped__` パターンで正常動作

3. **OAuth 認証統合**
   - 解決: FastAPI + FastMCP の組み合わせで実現

### 現在の課題と解決策
1. **Railway デプロイ**
   - 問題: `uv` コマンド不存在
   - 対策: Docker デプロイに切り替え

2. **Docker ビルドエラー（解決済み）**
   - 問題: `README.md` ファイルが見つからない
   - 原因: `pyproject.toml` が README.md を参照、Docker コンテキストに未含有
   - 解決: Dockerfile で `requirements.txt` + `pip install` に変更

## 🔍 トラブルシューティング

### ローカルテスト
```bash
# 動作確認済みサーバー起動
PORT=9001 MCP_API_KEY=test_key ALLOWED_ORIGINS=* \
BASE_URL=http://localhost:9001 \
JWT_SECRET_KEY=test_jwt_secret_key_minimum_32_chars \
ATHLETE_ID=i123456 API_KEY=placeholder \
uv run python src/intervals_mcp_server/simple_integrated.py
```

### Railway Docker デプロイ
```bash
# 環境変数設定後
railway up

# または GitHub 経由
git push origin main
```

### ログ確認ポイント
- `Environment validation passed` - 環境変数OK
- `Ready for Claude.ai connections` - サーバー準備完了
- `Processing request of type ListToolsRequest` - MCP 通信正常

## ⚡ 次のアクション

1. **Railway Docker デプロイ完了**
   - `railway up` でテスト
   - 環境変数設定確認
   - ヘルスチェック（`/health`）

2. **Claude.ai 接続テスト**
   - MCP 設定でRailway URL指定
   - OAuth フロー確認
   - ツール動作テスト

3. **本番運用準備**
   - モニタリング設定
   - ログ管理
   - コスト監視

## 📚 重要ドキュメント

- `docs/DEVELOPMENT_LESSONS.md` - 開発過程の教訓
- `DEPLOYMENT.md` - 各種プラットフォームデプロイ手順
- `RAILWAY_DEPLOY.md` - Railway 特化手順
- MCP 仕様: https://spec.modelcontextprotocol.io/
- Transport/Auth: https://support.anthropic.com/en/articles/11503834

## 🎭 引き継ぎ時の注意点

1. **動作中のコードは変更禁止**
   - `src/intervals_mcp_server/simple_integrated.py` は Claude.ai と通信中
   - 新機能は別ファイルで開発・テスト後に統合

2. **環境変数の重要性**
   - JWT_SECRET_KEY は32文字以上必須
   - BASE_URL は実際のデプロイ URL に合わせる

3. **MCP 仕様準拠**
   - 仕様変更時は必ず公式ドキュメント確認
   - Claude.ai との互換性テスト必須

---

**最終更新**: 2025-08-03 Railway Docker デプロイ準備完了  
**次回作業者へ**: Docker デプロイが最も確実な方法です。頑張ってください！ 🚀