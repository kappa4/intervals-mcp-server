# Railway デプロイ手順書

## 構成
- **メインファイル**: `app.py` (動作確認済みの統合サーバー)
- **起動方法**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- **機能**: OAuth 2.1 + MCP プロトコル統合

## 1. Railway アカウント準備

1. https://railway.app でアカウント作成（GitHub連携推奨）
2. 無料$5クレジット付与
3. 必要に応じてクレジットカード登録（月額制限設定可能）

## 2. プロジェクト作成（Webダッシュボード）

1. Railway ダッシュボードで「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. `intervals-mcp-server` リポジトリを選択
4. 「Deploy Now」をクリック

## 3. 環境変数設定（重要！）

Railway ダッシュボードの「Variables」タブで以下を設定：

### 必須設定（これらが無いとサーバーが起動しません）
```
ATHLETE_ID=i123456
API_KEY=your_intervals_icu_api_key
JWT_SECRET_KEY=your_32_character_minimum_secret_key
BASE_URL=https://your-project-name.up.railway.app
```

### オプション設定
```
PORT=8000
HOST=0.0.0.0
ALLOWED_ORIGINS=https://claude.ai,https://claude.com
LOG_LEVEL=INFO
```

## 4. デプロイ確認

1. ログでサーバー起動を確認
2. `https://your-project-name.up.railway.app/health` でヘルスチェック
3. `https://your-project-name.up.railway.app/config` で設定確認

## 5. Claude.ai 設定

Claude.ai の MCP設定で以下を追加：

```json
{
  "mcpServers": {
    "intervals": {
      "url": "https://your-project-name.up.railway.app",
      "transport": "sse"
    }
  }
}
```

## 6. 自動デプロイ設定

- GitHubにプッシュすると自動的に再デプロイ
- `main.py` や `src/` フォルダの変更で自動反映

## トラブルシューティング

### ビルドエラー
- `railway.json` の設定確認
- 環境変数が全て設定されているか確認

### 起動エラー
- ログで `Environment validation passed` を確認
- JWT_SECRET_KEY が32文字以上か確認

### 接続エラー
- BASE_URL が正確なRailway URLか確認
- ALLOWED_ORIGINS にClaude.aiのドメインが含まれているか確認

## コスト管理

- 使用量モニタリングでリソース使用量確認
- 必要に応じて使用制限設定
- 非アクティブ時の自動スリープ設定可能

---

作成日: 2025-08-03
最終更新: Railway デプロイ対応