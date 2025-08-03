# UCRテスト実装継続計画

## 概要
本文書は、intervals-mcp-serverにおけるUCR（Unified Continuous Readiness）機能のテスト実装を継続するための詳細計画です。

作成日: 2025-01-03
作成者: Claude Code

## 現状分析

### 実装済み項目
- **単体テスト骨格**: `tests/unit/ucr-calculator_test.ts`が存在
- **基本的なテストケース**: UCR計算、エッジケース、パフォーマンステストの枠組み

### 未実装・問題点
1. **テストヘルパー未作成**: `test-setup.ts`が存在せず、テスト実行不可
2. **重要なテストケース不足**:
   - 副交感神経飽和のテストケース（低HRV + 低RHR = 高スコア）
   - 睡眠負債の累積計算テスト（3日間の累積効果）
   - モチベーション低下の修正子テスト（motivation ≤ 2で0.9倍）
3. **テストインフラ未整備**: helpers、fixtures、integration、e2eディレクトリが未作成

## 実装計画

### フェーズ1: テストインフラ整備（優先度：最高）

#### 1.1 test-setup.ts作成
```typescript
// tests/helpers/test-setup.ts
export function assertUCRScore(score: number): boolean {
  return score >= 0 && score <= 100;
}

export class TestDataValidator {
  static isValidUCRScore(score: number): boolean {
    return Number.isInteger(score) && score >= 0 && score <= 100;
  }
}

export class PerformanceTimer {
  private startTime: number = 0;
  
  start(): void {
    this.startTime = performance.now();
  }
  
  assertUnder(ms: number, message: string): void {
    const elapsed = performance.now() - this.startTime;
    if (elapsed >= ms) {
      throw new Error(`${message} (${elapsed}ms >= ${ms}ms)`);
    }
  }
}
```

#### 1.2 テストディレクトリ構造作成
```
tests/
├── unit/          # 既存
├── helpers/       # 新規作成
├── fixtures/      # 新規作成
├── integration/   # 新規作成
└── e2e/          # 新規作成
```

#### 1.3 基本fixtureファイル作成
- `tests/fixtures/wellness-data.ts`: テスト用ウェルネスデータ
- `tests/fixtures/expected-results.ts`: 期待値データ
- `tests/fixtures/mock-responses.ts`: APIモックレスポンス

### フェーズ2: 重要な単体テストケース追加（優先度：高）

#### 2.1 副交感神経飽和テスト
```typescript
it("should detect parasympathetic saturation and assign high score", () => {
  const historicalData = generateHistoricalData(); // 平均HRV=45, RHR=50
  
  const input: UCRCalculationInput = {
    current: {
      date: "2025-08-01",
      hrv: 30,  // 非常に低いHRV（ln(30) < mean60 - 0.75*sd60）
      rhr: 40,  // 非常に低いRHR（< mean30）
      sleepScore: 85,
      fatigue: 1,
      stress: 1
    },
    historical: historicalData
  };
  
  const result = calculator.calculate(input);
  // 副交感神経飽和により高いHRVスコアが付与される
  assertEquals(result.components.hrv >= 35, true, 
    "Parasympathetic saturation should yield high HRV score");
});
```

#### 2.2 睡眠負債累積テスト
```typescript
it("should calculate cumulative sleep debt correctly", () => {
  const historicalData: WellnessData[] = [];
  // 3日連続で睡眠不足（目標5.5時間に対して4時間）
  for (let i = 0; i < 3; i++) {
    historicalData.push({
      date: `2025-07-${29 + i}`,
      hrv: 45,
      rhr: 50,
      sleepHours: 4.0  // 1.5時間の負債 × 3日 = 4.5時間
    });
  }
  
  const input: UCRCalculationInput = {
    current: {
      date: "2025-08-01",
      hrv: 45,
      rhr: 50,
      sleepScore: 85,
      sleepHours: 8.0
    },
    historical: historicalData
  };
  
  const result = calculator.calculate(input);
  // sleepDebt = 4.5, multiplier = max(0.7, 1 - 0.05 * 4.5) = 0.775
  const expectedMultiplier = 0.775;
  const expectedScore = Math.round(result.baseScore * expectedMultiplier);
  assertAlmostEquals(result.score, expectedScore, 1, 
    "Sleep debt should reduce score appropriately");
});
```

#### 2.3 モチベーション修正子テスト
```typescript
it("should apply motivation penalty when motivation <= 2", () => {
  const baselineInput = createTestInput({ motivation: 3 });
  const lowMotivationInput = createTestInput({ motivation: 2 });
  
  const baselineResult = calculator.calculate(baselineInput);
  const lowMotivationResult = calculator.calculate(lowMotivationInput);
  
  // motivation <= 2で0.9倍が適用される
  const expectedScore = Math.round(baselineResult.score * 0.9);
  assertAlmostEquals(lowMotivationResult.score, expectedScore, 2,
    "Low motivation should reduce score by 10%");
});
```

### フェーズ3: 統合テスト実装（優先度：中）

#### 3.1 UCRIntervalsClientテスト
- APIモックの作成
- データ取得・更新フローの検証
- エラーハンドリングテスト

#### 3.2 UCRToolsテスト
- 5つのMCPツールそれぞれの統合テスト
- 入力検証とレスポンス形式の確認

### フェーズ4: E2Eテスト実装（優先度：低）

#### 4.1 MCPハンドラーE2Eテスト
- 実際のMCPプロトコルフローの検証
- Claude経由の使用シナリオテスト
- エラーケースの網羅的テスト

### フェーズ5: 品質確認（優先度：中）

#### 5.1 カバレッジ測定
```bash
# カバレッジ付きテスト実行
deno test --allow-net --allow-env --coverage=coverage

# レポート生成
deno coverage coverage --lcov > coverage.lcov
```

#### 5.2 パフォーマンス確認
- レスポンス時間3秒以内の確認
- ボトルネックの特定と最適化

## 作業見積もり

| フェーズ | 内容 | 所要時間 | 優先度 |
|---------|------|----------|--------|
| フェーズ1 | テストインフラ整備 | 1-2時間 | 最高 |
| フェーズ2 | 重要な単体テスト追加 | 1-2時間 | 高 |
| フェーズ3 | 統合テスト実装 | 2-3時間 | 中 |
| フェーズ4 | E2Eテスト実装 | 2-3時間 | 低 |
| フェーズ5 | 品質確認 | 1-2時間 | 中 |

**合計見積もり**: 7-12時間

## 推奨実施順序

1. **必須**: フェーズ1（テストインフラ） - 既存テストを実行可能にする
2. **重要**: フェーズ2（単体テスト） - 引き継ぎ資料で指摘された不足テストを追加
3. **段階的**: フェーズ3-5 - 包括的なテストカバレッジ達成

## 次のステップ

1. `test-setup.ts`を作成し、既存のテストを実行可能にする
2. テストディレクトリ構造を整備する
3. 副交感神経飽和、睡眠負債、モチベーション修正子の3つのテストケースを追加する

## 関連ドキュメント

- [UCR引き継ぎ資料](./UCR_HANDOVER_DOCUMENT.md)
- [UCRテスト実装計画書](./UCR_TEST_IMPLEMENTATION_PLAN.md)
- [UCR統合計画](./UCR_INTEGRATION_PLAN.md)
- [UCR理論的基礎](./UCR_THEORETICAL_FOUNDATION.md)