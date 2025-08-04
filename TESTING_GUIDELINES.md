# intervals-mcp-server テストガイドライン

## 概要

本ドキュメントは、intervals-mcp-serverの品質保証のためのテストガイドラインです。
**すべての変更において、デプロイ前のテスト実行を必須とします。**

## 🚨 重要：テスト実行ルール

### 必須テストタイミング
以下の場合は**必ず**テストを実行してください：

1. **コード変更時**
   - 新機能追加
   - バグ修正
   - リファクタリング
   - 依存関係の更新

2. **設定変更時**
   - 環境変数の追加・変更
   - deno.jsonの更新
   - import mapの変更

3. **デプロイ前**
   - 本番環境へのデプロイ
   - ステージング環境への反映

## テスト種別と実行方法

### 1. 単体テスト（ローカル）
```bash
# 全テスト実行
deno test --allow-net --allow-env --coverage=coverage

# 特定ファイルのテスト
deno test --allow-net --allow-env src/ucr/tests/ucr-calculator.test.ts

# カバレッジレポート
deno coverage coverage --lcov > coverage.lcov
```

### 2. 統合テスト（ローカル）
```bash
# UCR統合テスト
deno test --allow-net --allow-env src/ucr/tests/ucr-integration.test.ts
```

### 3. ブラックボックステスト（本番環境）
```bash
# 自動テストランナー実行
./auto-test-runner.ts

# 個別ツールテスト（デバッグ用）
./quick-test-tools.ts
```

## テスト実行チェックリスト

### プルリクエスト作成前
- [ ] ローカルで単体テストを実行
- [ ] 統合テストが全て成功
- [ ] TypeScriptのコンパイルエラーなし
- [ ] リンターの警告なし

### デプロイ前
- [ ] 最新のmainブランチをマージ
- [ ] ローカルテストが全て成功
- [ ] ブラックボックステスト実行
- [ ] テストレポートの確認

## 自動テストランナーの使い方

### 基本的な使用方法
```bash
# 実行権限付与（初回のみ）
chmod +x auto-test-runner.ts

# テスト実行
./auto-test-runner.ts
```

### 環境変数（オプション）
```bash
# カスタムクライアント資格情報を使用
export TEST_CLIENT_ID="your-client-id"
export TEST_CLIENT_SECRET="your-client-secret"
./auto-test-runner.ts
```

### テスト結果の確認
```bash
# 最新のレポートを表示
ls -la test-report-*.md | tail -1
cat test-report-[timestamp].md
```

## テスト失敗時の対応

### 1. エラーログの確認
- テストレポートの詳細を確認
- 失敗したツール名とエラーメッセージを特定

### 2. 個別デバッグ
```bash
# 特定ツールのみテスト
deno run --allow-net --allow-env quick-test-tools.ts
```

### 3. 本番ログの確認
- Deno Deployのログを確認
- エラーのタイムスタンプと照合

## CI/CD統合（推奨）

### GitHub Actions設定例
```yaml
name: Test Suite

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - uses: denoland/setup-deno@v1
      with:
        deno-version: v1.x
    
    - name: Run Unit Tests
      run: deno test --allow-net --allow-env
    
    - name: Run Integration Tests
      run: ./auto-test-runner.ts
      env:
        TEST_CLIENT_ID: ${{ secrets.TEST_CLIENT_ID }}
        TEST_CLIENT_SECRET: ${{ secrets.TEST_CLIENT_SECRET }}
```

## テストカバレッジ目標

- **単体テスト**: 80%以上
- **統合テスト**: 主要なユースケースを網羅
- **ブラックボックステスト**: 全MCPツール（100%）

## 新規テスト追加時のガイドライン

### ファイル命名規則
- 単体テスト: `*.test.ts`
- 統合テスト: `*-integration.test.ts`
- E2Eテスト: `*-e2e.test.ts`

### テスト構造
```typescript
Deno.test("機能名: 期待される動作", async () => {
  // Arrange
  const input = prepareTestData();
  
  // Act
  const result = await functionUnderTest(input);
  
  // Assert
  assertEquals(result, expectedOutput);
});
```

## トラブルシューティング

### よくある問題

1. **OAuth認証エラー**
   - クライアント資格情報の確認
   - リダイレクトURIの設定確認

2. **タイムアウトエラー**
   - ネットワーク接続の確認
   - 本番環境の稼働状況確認

3. **データ不整合**
   - テストデータの初期化
   - キャッシュのクリア

### サポート

問題が解決しない場合：
1. エラーログを含むIssueを作成
2. `#intervals-mcp-server`チャンネルで相談
3. README.mdのトラブルシューティングセクション参照

## 更新履歴

- 2025-08-04: 初版作成、自動テストランナー統合
- [今後の更新はここに記載]

---

**Remember**: テストは品質の守護者です。スキップせず、必ず実行しましょう！ 🛡️