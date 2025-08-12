# キャッシュストラテジーパターン実装ガイド

## 概要
このガイドは、キャッシュ関連の問題が発生した際に、ストラテジーパターンを適用して解決する方法を文書化したものです。

## 問題の症状チェックリスト

以下の症状が見られる場合、キャッシュストラテジーの適用を検討してください：

- [ ] 古いデータが返され続ける
- [ ] データ更新が反映されない
- [ ] 特定の条件（今日のデータ、空データなど）で不適切な動作
- [ ] キャッシュのTTLが一律で柔軟性がない
- [ ] テストでキャッシュの挙動を制御できない

## 実装手順

### Step 1: 問題の特定と分析

```bash
# 1. キャッシュキーの確認
grep -r "cache.set\|cache.get" --include="*.ts" .

# 2. TTL設定の確認
grep -r "ttl\|TTL\|expireIn" --include="*.ts" .

# 3. データ検証の有無確認
grep -r "isValid\|isEmpty\|data.length" --include="*.ts" .
```

### Step 2: ストラテジーインターフェースの定義

既存の `ICacheStrategy` を利用するか、問題に特化した新しいインターフェースを作成：

```typescript
// 既存のインターフェースを利用
import { ICacheStrategy } from "./cache/cache-strategy-types.ts";

// または問題特化型を作成
interface ICustomCacheStrategy {
  shouldCache(context: YourContext): boolean;
  getTTL(context: YourContext): number;
  validateData(data: any): boolean;
}
```

### Step 3: 具体的なストラテジー実装

問題に応じたストラテジーを実装：

```typescript
export class YourSpecificCacheStrategy implements ICacheStrategy {
  // 実装例は TodayDataCacheStrategy を参照
  
  getTTL(context: CacheContext): number {
    // 条件に応じたTTL設定
    if (/* 特定条件 */) {
      return 5000; // 5秒
    }
    return 3600000; // 1時間
  }

  isValidData(data: any, context: CacheContext): boolean {
    // データ検証ロジック
    return /* 検証結果 */;
  }
}
```

### Step 4: 既存クラスへのDI適用

```typescript
export class YourClient extends BaseClient {
  private cacheStrategy: ICacheStrategy;

  constructor(
    options: YourOptions,
    cacheStrategy?: ICacheStrategy  // オプショナルにして後方互換性維持
  ) {
    super(options);
    this.cacheStrategy = cacheStrategy || new DefaultStrategy();
  }
}
```

### Step 5: テストの作成

BDD形式でテストを作成：

```typescript
describe("YourCacheStrategy", () => {
  describe("Given: 問題のシナリオ", () => {
    it("When: 特定の操作, Then: 期待される動作", () => {
      // テスト実装
    });
  });
});
```

## トラブルシューティングテンプレート

### 1. 問題の記録

```markdown
## 発生日時
2025-08-12

## 症状
- get_ucr_assessmentで空のデータが返される
- データ更新後も古いデータが返される

## 影響範囲
- UCR評価機能
- ウェルネスデータ取得

## 根本原因
- 今日のデータ判定ロジックが不適切
- 空データもキャッシュされている
```

### 2. 解決策の記録

```markdown
## 適用したパターン
ストラテジーパターン + DI

## 実装ファイル
- cache/today-data-cache-strategy.ts
- ucr-intervals-client-cached-v2.ts

## 変更内容
1. ICacheStrategyインターフェース定義
2. TodayDataCacheStrategy実装
3. コンストラクタ注入によるDI

## テスト結果
全19ステップ成功
```

## チェックポイント

### 実装前の確認

- [ ] 問題は本当にキャッシュに起因するか？
- [ ] 既存の解決策（TTL調整など）で対応可能か？
- [ ] ストラテジーパターンの導入コストは妥当か？

### 実装後の確認

- [ ] 元の問題は解決したか？
- [ ] 新たな問題は発生していないか？
- [ ] テストは網羅的か？
- [ ] パフォーマンスへの影響は許容範囲か？

## 参考実装

### 成功事例

1. **TodayDataCacheStrategy** (2025-08-12)
   - 問題: 今日のデータが古いまま固定される
   - 解決: 5秒TTL + 空データ検証
   - ファイル: `cache/today-data-cache-strategy.ts`

### アンチパターン

避けるべき実装：

```typescript
// ❌ 悪い例：ロジック側でキャッシュ判定
if (isToday) {
  // キャッシュをスキップ
} else {
  cache.set(key, data);
}

// ✅ 良い例：ストラテジーに委譲
await this.cacheStrategy.set(key, data, context);
```

## 移行ガイド

### 段階的移行

```typescript
// Phase 1: 新クラスを作成（既存はそのまま）
class ClientV2 extends Client {
  constructor(options, strategy?) { /* ... */ }
}

// Phase 2: 動作確認後、エイリアスを作成
export { ClientV2 as Client };

// Phase 3: 古い実装を削除（十分な期間後）
```

## コマンド集

```bash
# テスト実行
deno test tests/unit/cache-strategy_test.ts --allow-env --no-check

# 型チェック
deno check cache/cache-strategy-types.ts

# カバレッジ測定
deno test --coverage=coverage tests/unit/cache-strategy_test.ts

# 統合テスト
deno test tests/integration/cache-strategy-integration_test.ts
```

## 連絡先

問題が発生した場合：
1. このガイドを参照
2. 既存の実装（TodayDataCacheStrategy）を参考に
3. テストファースト開発で進める

---

最終更新: 2025-08-12
作成者: Claude Code + @k.takahashi