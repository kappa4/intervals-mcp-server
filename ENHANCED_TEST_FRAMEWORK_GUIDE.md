# Enhanced Test Framework Guide
# 改良版テストフレームワークガイド

## 概要
生のfetchとstd/assertから、より構造化されたテストフレームワークに移行しました。このフレームワークは以下を提供します：

- **再利用可能なテストクライアント**
- **自動リトライ機能**
- **動的テストケース生成**
- **データバックアップ/リストア管理**
- **豊富なアサーション**
- **統計情報収集**

## フレームワーク構成

### 1. test-helpers/test-framework.ts
主要なテスト機能を提供：

```typescript
// テストクライアント
const client = new MCPTestClient({
  baseUrl: "https://kpnco-intervals-mcp-77.deno.dev",
  accessToken: "your-token",
  timeout: 30000,      // 30秒タイムアウト
  retryCount: 3        // 3回リトライ
});

// テストランナー
const runner = new TestRunner(client);

// テストケース定義
const testCase: TestCase = {
  name: "Test Name",
  method: "tools/call",
  params: ["tool_name", { arg: "value" }],
  validate: (result) => {
    // カスタム検証ロジック
  },
  beforeTest: async () => {
    // テスト前のセットアップ
    return originalData;
  },
  afterTest: async (originalData) => {
    // テスト後のクリーンアップ
  }
};
```

### 2. test-helpers/data-manager.ts
テストデータの管理機能：

```typescript
// データマネージャー
const dataManager = new TestDataManager(client);

// 安全なテスト実行
await dataManager.runWithBackup(
  "Update Wellness Test",
  async () => {
    // テストコード
    await client.callTool("update_wellness", testData);
  },
  "2025-08-03" // 対象日付
);

// テストデータ生成
const testData = TestDataManager.generateTestWellnessData({
  includeHRV: true,
  includeAssessment: true,
  includeSleep: true
});
```

### 3. test-mcp-tools-enhanced.ts
改良版ブラックボックステスト：

```typescript
// 動的テストケース生成
const toolTestCases = await generateTestCasesFromTools(client);

// 全テスト実行
await runner.runAll(toolTestCases);
```

## 主な改善点

### 1. エラーハンドリング
- 自動リトライ機能（ネットワークエラー対策）
- タイムアウト処理
- 詳細なエラーメッセージ

### 2. データ保護
- 自動バックアップ/リストア
- テスト失敗時の自動復元
- データ検証機能

### 3. 統計情報
- リクエスト数カウント
- 平均レスポンスタイム
- テスト実行時間

### 4. 拡張性
- カスタムアサーション追加可能
- 動的テストケース生成
- プラグイン可能な検証ロジック

## 使用方法

### 基本的な使用
```bash
# OAuth認証セットアップ
./setup-oauth-test.ts register
./setup-oauth-test.ts exchange <AUTH_CODE>

# 環境変数設定
export TEST_ACCESS_TOKEN="your-token"

# テスト実行
./test-mcp-tools-enhanced.ts
```

### カスタムテストの作成
```typescript
import { MCPTestClient, TestRunner } from "./test-helpers/test-framework.ts";
import { TestDataManager } from "./test-helpers/data-manager.ts";

const client = new MCPTestClient({ baseUrl, accessToken });
const runner = new TestRunner(client);
const dataManager = new TestDataManager(client);

// カスタムテストケース
const customTest = {
  name: "Custom UCR Test",
  method: "tools/call",
  params: ["get_ucr_assessment", { date: "2025-08-03" }],
  validate: (result) => {
    const data = JSON.parse(result.content[0].text);
    if (data.total_score < 0 || data.total_score > 100) {
      throw new Error("Invalid UCR score");
    }
  }
};

await runner.run(customTest);
```

## 既存テストとの比較

### Before（生のfetch）
```typescript
const response = await fetch(url, {
  method: "POST",
  headers: { "Authorization": `Bearer ${token}` },
  body: JSON.stringify(data)
});
const result = await response.json();
console.log(result);
```

### After（フレームワーク使用）
```typescript
const result = await client.callTool("tool_name", args);
// 自動的にリトライ、タイムアウト、エラーハンドリング
```

## 今後の拡張案

1. **並列実行**: 複数のテストを並行実行
2. **レポート生成**: HTML/JSONレポート出力
3. **CI/CD統合**: GitHub Actions対応
4. **モック機能**: 外部APIのモック
5. **ビジュアル回帰テスト**: UIスクリーンショット比較

## トラブルシューティング

### リトライが多すぎる
```typescript
// リトライ回数を減らす
const client = new MCPTestClient({
  retryCount: 1  // 1回のみリトライ
});
```

### タイムアウトエラー
```typescript
// タイムアウトを延長
const client = new MCPTestClient({
  timeout: 60000  // 60秒
});
```

### データ復元失敗
```typescript
// 手動でバックアップ状態を確認
const status = dataManager.getBackupStatus();
console.log(`Backups: ${status.count}`);
console.log(`Keys: ${status.keys.join(", ")}`);
```

## まとめ
このフレームワークにより、MCPツールのテストがより安全で効率的になりました。特に：

- **安全性**: データの自動バックアップ/リストア
- **信頼性**: リトライとタイムアウト処理
- **保守性**: 構造化されたテストケース
- **拡張性**: カスタム検証ロジックの追加が容易

既存のblackbox-test.tsも引き続き使用可能ですが、新しいテストは改良版フレームワークの使用を推奨します。