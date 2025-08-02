# Intervals.icu MCP Server - 本番デプロイガイド

## 概要

この文書では、Intervals.icu MCP Serverの本番環境へのデプロイ方法を説明します。

## 前提条件

- Intervals.icu アカウントとAPIキー
- Athlete ID（プロフィールURLから取得）
- Python 3.12+ 対応のホスティングプラットフォーム

## サポートされているプラットフォーム

### 推奨プラットフォーム

1. **Railway** - 最も簡単なデプロイ
2. **Render** - 無料層あり
3. **Fly.io** - グローバル展開
4. **Heroku** - 従来からの定番

### Deno Deploy制限について

Deno DeployはPythonサポートが制限されているため、**推奨しません**。代わりに上記のPythonサポートがあるプラットフォームを使用してください。

## デプロイ手順

### 1. Railway でのデプロイ（推奨）

```bash
# 1. Railwayアカウント作成とCLIインストール
npm install -g @railway/cli
railway login

# 2. プロジェクト作成
railway new
cd intervals-mcp-server

# 3. GitHubリポジトリをRailwayに接続
railway connect

# 4. 環境変数設定
railway add ATHLETE_ID=i123456
railway add API_KEY=your_intervals_api_key
railway add JWT_SECRET_KEY=your_32_char_secret_key
railway add BASE_URL=https://your-app.railway.app

# 5. デプロイ
railway up
```

### 2. Render でのデプロイ

1. [Render](https://render.com)でアカウント作成
2. GitHubリポジトリを接続
3. Web Service として作成
4. 設定:
   - **Build Command**: `uv sync`
   - **Start Command**: `uv run python main.py`
   - **Environment**: Python 3.12
5. 環境変数を設定:
   ```
   ATHLETE_ID=i123456
   API_KEY=your_intervals_api_key
   JWT_SECRET_KEY=your_32_char_secret_key
   BASE_URL=https://your-app.onrender.com
   ```

### 3. Fly.io でのデプロイ

```bash
# 1. Fly CLI インストール
curl -L https://fly.io/install.sh | sh

# 2. ログイン
fly auth login

# 3. アプリ作成
fly apps create intervals-mcp-server

# 4. 環境変数設定
fly secrets set ATHLETE_ID=i123456
fly secrets set API_KEY=your_intervals_api_key
fly secrets set JWT_SECRET_KEY=your_32_char_secret_key
fly secrets set BASE_URL=https://intervals-mcp-server.fly.dev

# 5. デプロイ
fly deploy
```

### 4. Docker でのデプロイ

```bash
# 1. イメージビルド
docker build -f docker/Dockerfile -t intervals-mcp-server .

# 2. 実行
docker run -d \
  -p 8000:8000 \
  -e ATHLETE_ID=i123456 \
  -e API_KEY=your_intervals_api_key \
  -e JWT_SECRET_KEY=your_32_char_secret_key \
  -e BASE_URL=https://your-domain.com \
  intervals-mcp-server
```

## 環境変数設定

### 必須環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `ATHLETE_ID` | Intervals.icu アスリートID | `i123456` |
| `API_KEY` | Intervals.icu API キー | `abcd1234...` |
| `JWT_SECRET_KEY` | JWT署名用秘密鍵（32文字以上） | `your_secure_random_32_char_key` |
| `BASE_URL` | サーバーの公開URL | `https://your-app.railway.app` |

### オプション環境変数

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `PORT` | `8000` | サーバーポート |
| `HOST` | `0.0.0.0` | バインドホスト |
| `ALLOWED_ORIGINS` | `*` | CORS許可オリジン |
| `MCP_API_KEY` | なし | フォールバック認証キー |

## Claude.ai での設定

1. Claude.ai にログイン
2. Settings → Beta features → Model Context Protocol
3. "Add Server" クリック
4. サーバー情報入力:
   - **Name**: Intervals.icu
   - **URL**: `https://your-deployed-url.com`
   - **API Key**: 空欄（OAuth使用）
5. 認証フローを完了

## ヘルスチェックとモニタリング

### エンドポイント

- **ヘルスチェック**: `GET /health`
- **設定確認**: `GET /config`
- **OAuth設定**: `GET /.well-known/oauth-authorization-server`

### ログ監視

```bash
# Railway
railway logs

# Render
# Webダッシュボードでログ確認

# Fly.io
fly logs

# Docker
docker logs <container-id>
```

## トラブルシューティング

### よくある問題

1. **認証エラー**
   - `JWT_SECRET_KEY` が32文字以上か確認
   - `BASE_URL` が正しく設定されているか確認

2. **ツールが表示されない**
   - `ATHLETE_ID` と `API_KEY` が正しいか確認
   - Intervals.icu APIキーの権限を確認

3. **CORS エラー**
   - `ALLOWED_ORIGINS` の設定を確認
   - 本番環境では `*` を避けて特定のオリジンに制限

### ログ確認コマンド

```bash
# 認証成功の確認
grep "JWT decoded successfully" logs/

# セッション管理の確認
grep "session_id" logs/

# MCPリクエスト処理の確認
grep "Processing request of type" logs/
```

## セキュリティ考慮事項

1. **環境変数の保護**
   - APIキーとJWT秘密鍵を安全に保管
   - 定期的なキーローテーション

2. **CORS設定**
   - 本番環境では具体的なオリジンに制限
   - `ALLOWED_ORIGINS=https://claude.ai,https://claude.com`

3. **HTTPS必須**
   - 全てのプラットフォームでHTTPS使用
   - OAuth コールバックにはHTTPS必須

## アップデート手順

1. GitHubリポジトリを更新
2. プラットフォームが自動デプロイ
3. ヘルスチェックエンドポイントで確認
4. Claude.ai で動作テスト

---

**作成日**: 2025-08-03  
**最終更新**: 本番リリース時  
**サポート**: GitHub Issues