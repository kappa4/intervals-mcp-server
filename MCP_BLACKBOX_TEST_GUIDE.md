# MCP Tools ブラックボックステストガイド

## 概要
本番環境のMCPツールを実際に実行し、動作を検証するブラックボックステストです。
tools/listから全ツールを動的に取得し、それぞれを実行して成功を確認します。

## 特徴
- **動的ツール検出**: ハードコードではなく、実際のtools/listから取得
- **実際の実行**: 各ツールを本番環境で実行
- **自動ロールバック**: 副作用のある操作は元のデータを保存し、テスト後に復元
- **安全性**: 元データが取得できない場合はテストを中断

## セットアップ手順

### 1. OAuth クライアント登録
```bash
./setup-oauth-test.ts register
```

出力例：
```
✅ Client registered successfully!

Save these credentials in your environment:
export TEST_CLIENT_ID="cli_xxxxx"
export TEST_CLIENT_SECRET="xxxxx"

=== Next Steps ===
1. Open this URL in your browser:
https://kpnco-intervals-mcp-77.deno.dev/oauth/authorize?client_id=cli_xxxxx&...
```

### 2. 環境変数の設定
```bash
export TEST_CLIENT_ID="cli_xxxxx"
export TEST_CLIENT_SECRET="xxxxx"
```

### 3. 認証コードの取得
1. 生成されたURLをブラウザで開く
2. 認証を承認
3. リダイレクトURLから`code`パラメータをコピー

### 4. アクセストークンの取得
```bash
./setup-oauth-test.ts exchange YOUR_AUTH_CODE
```

出力例：
```
✅ Access token obtained successfully!

Save this in your environment:
export TEST_ACCESS_TOKEN="xxxxx"
```

### 5. 環境変数の確認
```bash
./setup-oauth-test.ts
```

すべての環境変数が設定されていることを確認：
```
Current environment:
  TEST_CLIENT_ID: ✓ Set
  TEST_CLIENT_SECRET: ✓ Set
  TEST_ACCESS_TOKEN: ✓ Set
```

## テストの実行

### ブラックボックステスト実行
```bash
./test-mcp-tools-blackbox.ts
```

### テスト内容

#### 読み取り専用ツール
以下のツールは副作用がないため、そのまま実行されます：
- `get_athlete` - アスリート情報取得
- `get_activities` - アクティビティ一覧取得
- `get_wellness` - ウェルネスデータ取得
- `get_custom_fields` - カスタムフィールド取得
- `get_ucr_assessment` - UCR評価取得
- `calculate_ucr_trends` - UCRトレンド分析
- `check_ucr_setup` - UCR設定確認
- `batch_calculate_ucr` - 期間指定UCR計算

#### 書き込み可能ツール
以下のツールは実行前に現在のデータを保存し、テスト後に復元します：
- `update_wellness` - ウェルネスデータ更新
- `update_wellness_assessment` - ウェルネス評価更新

### 安全機能
1. **事前データ取得**: 更新前に現在のデータを取得
2. **取得失敗時スキップ**: データ取得に失敗した場合、テストをスキップ
3. **自動復元**: テスト後に元のデータに戻す
4. **エラー時復元**: テストが失敗しても可能な限りデータを復元

## 期待される出力

```
=== MCP Tools Black Box Test ===
Base URL: https://kpnco-intervals-mcp-77.deno.dev
Started: 2025-08-03T22:00:00.000Z

1. Testing Initialize...
  ✅ Initialize successful

2. Fetching tools list...
Found 10 tools
  ✅ Retrieved 10 tools

3. Testing each tool...
  Testing get_athlete (read-only)...
    ✅ get_athlete executed successfully
  Testing get_activities (read-only)...
    ✅ get_activities executed successfully
  Testing update_wellness (with rollback)...
    Fetching original wellness data...
    Executing update...
    ✅ update_wellness executed successfully
    Reverting to original data...
    ✅ Data reverted successfully
  ...

=== Test Summary ===
Total Tools: 10
Passed: 10
Failed: 0
Skipped: 0

✅ All tests passed!
```

## トラブルシューティング

### 認証エラー
- アクセストークンの有効期限切れ（24時間）
- `./setup-oauth-test.ts test`でトークンの有効性を確認

### データ取得エラー
- intervals.icuにウェルネスデータが登録されていない
- 手動でデータを登録してから再実行

### ロールバック失敗
- テスト実行中に中断された場合
- intervals.icuで手動でデータを確認・修正

## 注意事項
- テストは本番環境で実行されるため、慎重に実施
- 書き込み操作は必ず元に戻されることを確認
- 定期的な実行でAPIの動作を継続的に検証可能