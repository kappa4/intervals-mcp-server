# MCP Tools 疎通テストガイド

## 概要
intervals-mcp-serverで提供されるすべてのMCPツールの疎通テストを行うためのガイドです。

## 利用可能なツール一覧

### 1. intervals.icu標準ツール
- **get_athlete**: アスリート情報の取得
- **get_activities**: アクティビティ一覧の取得  
- **get_wellness**: ウェルネスデータの取得
- **update_wellness**: ウェルネスデータの更新
- **get_custom_fields**: カスタムフィールドの取得

### 2. UCR専用ツール
- **get_ucr_assessment**: UCR評価の取得
- **calculate_ucr_trends**: UCRトレンド分析
- **update_wellness_assessment**: ウェルネス更新とUCR再計算
- **check_ucr_setup**: UCR設定状況確認
- **batch_calculate_ucr**: 期間指定UCR一括計算

## テスト方法

### 1. 基本的な疎通確認（認証不要）

#### Initialize
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

期待される応答：
```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {"listChanged": false},
      "resources": {"listChanged": false}
    },
    "serverInfo": {
      "name": "intervals-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

### 2. OAuth認証フロー

#### 2.1 クライアント登録
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uri": "https://claude.ai/oauth/callback"
  }'
```

応答例：
```json
{
  "client_id": "cli_xxxxx",
  "client_secret": "xxxxx",
  "client_name": "Test Client",
  "redirect_uri": "https://claude.ai/oauth/callback"
}
```

#### 2.2 認証URLの生成
```
https://kpnco-intervals-mcp-77.deno.dev/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://claude.ai/oauth/callback&response_type=code&state=random_state
```

#### 2.3 アクセストークン取得
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=YOUR_AUTH_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=https://claude.ai/oauth/callback"
```

### 3. 認証付きツール呼び出しテスト

以下のテストはすべて`Authorization: Bearer YOUR_ACCESS_TOKEN`ヘッダーが必要です。

#### 3.1 ツール一覧取得
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tools-1",
    "method": "tools/list"
  }'
```

#### 3.2 アスリート情報取得
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "call-1",
    "method": "tools/call",
    "params": {
      "name": "get_athlete"
    }
  }'
```

#### 3.3 UCR評価取得（キャッシュ機能確認）
```bash
# 1回目 - APIから取得
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "ucr-1",
    "method": "tools/call",
    "params": {
      "name": "get_ucr_assessment",
      "arguments": {
        "date": "2025-08-03"
      }
    }
  }'

# 2回目 - キャッシュから取得（高速）
# 同じコマンドを再実行
```

#### 3.4 UCR設定確認
```bash
curl -X POST https://kpnco-intervals-mcp-77.deno.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "setup-1",
    "method": "tools/call",
    "params": {
      "name": "check_ucr_setup"
    }
  }'
```

## テスト項目チェックリスト

### 基本機能
- [ ] Initialize（認証不要）
- [ ] Tools List（認証必要）
- [ ] OAuth登録・認証フロー

### intervals.icuツール
- [ ] get_athlete
- [ ] get_activities
- [ ] get_wellness
- [ ] update_wellness
- [ ] get_custom_fields

### UCRツール
- [ ] get_ucr_assessment
- [ ] calculate_ucr_trends
- [ ] update_wellness_assessment
- [ ] check_ucr_setup
- [ ] batch_calculate_ucr

### キャッシュ機能
- [ ] 初回アクセス（API呼び出し）
- [ ] 2回目アクセス（キャッシュヒット）
- [ ] レスポンス時間の比較

## トラブルシューティング

### 認証エラー
- client_idとclient_secretが正しいか確認
- アクセストークンの有効期限を確認（24時間）
- redirect_uriがhttps://claude.ai/oauth/callbackであることを確認

### ツール実行エラー
- パラメータの形式を確認（日付はYYYY-MM-DD形式）
- 必須パラメータが含まれているか確認

### キャッシュが効かない
- 同じパラメータで呼び出しているか確認
- cache_enabled: trueになっているか/healthで確認

## 注意事項
- 本番環境のため、updateツールの使用は慎重に
- OAuth認証はClaude.ai経由でのみ正常に動作
- キャッシュは最大24時間保持される