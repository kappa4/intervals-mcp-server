# UCR追加テスト実装計画

## 概要

UCR理論的基盤の包括的検証により特定された観点漏れに対応する追加テストの実装計画です。
係数は調整可能な値であることを考慮し、特定の値に依存しない柔軟なテスト設計を行います。

## 設計方針

1. **係数非依存性**: テストは具体的な係数値に依存せず、数学的な性質を検証する
2. **境界値の相対的検証**: 絶対値ではなく、相対的な関係性を検証する
3. **設定可能性の確保**: 係数調整時にテストが失敗しないよう、設定値を参照する

## 追加テスト一覧

### 1. HRVバッファーゾーン検証テスト

**目的**: シグモイド関数の水平シフト（バッファーゾーン）が正しく機能することを検証

**テストケース**:
```typescript
describe("HRV Buffer Zone Validation", () => {
  it("should maintain minimum score threshold with buffer zone", () => {
    // Zスコアが負でも、一定の閾値まではペナルティを緩和
    // c（水平シフト）の値に関わらず、バッファーゾーンの概念を検証
  });

  it("should apply gradual penalties beyond buffer zone", () => {
    // バッファーゾーンを超えた場合の段階的なペナルティ適用を検証
  });

  it("should respect sigmoid function properties", () => {
    // シグモイド関数の数学的性質（単調性、S字カーブ）を検証
  });
});
```

### 2. RHRベースライン検証テスト

**目的**: RHRの線形関数におけるベースラインと傾きの設計思想を検証

**テストケース**:
```typescript
describe("RHR Baseline and Slope Validation", () => {
  it("should give proportional score for average RHR", () => {
    // Z-score = 0（平均値）での適切なスコア割り当てを検証
    // ベースライン値に依存せず、「平均的な状態」の評価を確認
  });

  it("should apply linear scaling with configured slope", () => {
    // 傾きによる変化率が設定通りに適用されることを検証
  });

  it("should clip scores within valid range", () => {
    // 0-20点の範囲でクリッピングが正しく動作することを検証
  });
});
```

### 3. 主観スコア計算式検証テスト

**目的**: ウェルネスデータの平均化と正規化が正しく行われることを検証

**テストケース**:
```typescript
describe("Subjective Score Calculation", () => {
  it("should correctly average wellness inputs", () => {
    // 複数の主観的指標の平均化処理を検証
  });

  it("should normalize scores to 0-20 range", () => {
    // (Avg-1)/(MaxScale-1)*20 の正規化が正しく行われることを検証
  });

  it("should handle missing wellness data gracefully", () => {
    // 一部のウェルネスデータが欠損している場合の処理を検証
  });
});
```

### 4. データ品質による信頼度評価テスト

**目的**: 履歴データの量に基づく信頼度評価が適切に行われることを検証

**テストケース**:
```typescript
describe("Data Quality and Confidence Assessment", () => {
  it("should assign low confidence with insufficient data", () => {
    // 30日未満のデータで"low"信頼度が設定されることを検証
  });

  it("should assign high confidence with sufficient data", () => {
    // 十分なデータ量で"high"信頼度が設定されることを検証
  });

  it("should include appropriate data quality messages", () => {
    // データ品質に関する適切なメッセージが含まれることを検証
  });
});
```

### 5. Zスコア標準化の正確性テスト

**目的**: 統計的な標準化処理が正しく実装されていることを検証

**テストケース**:
```typescript
describe("Z-score Standardization", () => {
  it("should calculate correct mean and standard deviation", () => {
    // 平均と標準偏差の計算が正確であることを検証
  });

  it("should handle logarithmic transformation for HRV", () => {
    // HRVの対数変換が正しく適用されることを検証
  });

  it("should produce normalized distribution", () => {
    // Zスコア変換後の分布特性を検証
  });
});
```

### 6. 睡眠スコアの線形スケーリング検証テスト

**目的**: Garmin睡眠スコア（0-100）から UCR睡眠スコア（0-20）への変換を検証

**テストケース**:
```typescript
describe("Sleep Score Linear Scaling", () => {
  it("should scale sleep scores proportionally", () => {
    // 0-100 → 0-20の線形変換が正しく行われることを検証
  });

  it("should preserve relative differences", () => {
    // スコアの相対的な差が保持されることを検証
  });
});
```

## 実装優先順位

### Phase 1: 数学的基礎の検証（高優先度）
1. HRVバッファーゾーン検証テスト
2. RHRベースライン検証テスト
3. Zスコア標準化の正確性テスト

### Phase 2: データ処理の検証（中優先度）
4. 主観スコア計算式検証テスト
5. データ品質による信頼度評価テスト
6. 睡眠スコアの線形スケーリング検証テスト

## テスト実装のガイドライン

### 1. 係数参照の原則
```typescript
// ❌ 悪い例：係数値をハードコード
expect(score).toBe(14); // ベースライン14点を仮定

// ✅ 良い例：設定から係数を参照
const config = calculator.getConfig();
const expectedScore = config.rhr.linear.baseline;
expect(score).toBeCloseTo(expectedScore, 1);
```

### 2. 相対的検証の原則
```typescript
// ❌ 悪い例：絶対値での検証
expect(hrvScore).toBe(25); // 特定のスコアを期待

// ✅ 良い例：相対的な関係性を検証
const scoreAtZero = calculateHRVScore(0);
const scoreAtNegative = calculateHRVScore(-0.5);
expect(scoreAtZero).toBeGreaterThan(scoreAtNegative);
```

### 3. 境界値の動的検証
```typescript
// ✅ 良い例：設定に基づく境界値テスト
it("should respect configured boundaries", () => {
  const config = calculator.getConfig();
  const maxScore = config.scoreWeights.hrv;
  
  // 極端に高いHRVでも上限を超えない
  const veryHighHRV = { hrv: 100, /* ... */ };
  const result = calculator.calculate(veryHighHRV);
  
  expect(result.components.hrv).toBeLessThanOrEqual(maxScore);
});
```

## 期待される成果

1. **カバレッジの向上**: 現在の73.5%から80%以上への向上
2. **理論的完全性**: UCR理論基盤のすべての重要概念をテストでカバー
3. **保守性の向上**: 係数調整に対して堅牢なテストスイート
4. **信頼性の向上**: 数学的な境界条件での動作保証

## 実装スケジュール

- **Phase 1**: 1-2日（高優先度の数学的基礎テスト）
- **Phase 2**: 1日（中優先度のデータ処理テスト）
- **レビューと調整**: 0.5日

合計: 2.5-3.5日での実装完了を目標とする

## 係数変更に対する堅牢性の確保

### 重要な設計方針
係数は調整可能な値として変更される可能性があるため、テストは特定の係数値に依存せず、以下の方針で実装する：

1. **設定値の動的参照**
   - `calculator.getConfig()` を使用して現在の設定値を取得
   - ハードコードされた値との比較を避ける

2. **相対的な検証**
   - 絶対値ではなく、値の大小関係や比率を検証
   - 数学的性質（単調性、対称性など）に基づく検証

3. **境界値の動的計算**
   - 設定された係数から期待値を動的に計算
   - 許容誤差も相対的に設定（例：期待値の5%以内）

### 実装例
```typescript
// ❌ 悪い例：特定の係数値を前提とした検証
expect(hrvScore).toBe(25); // k=1.0, c=-0.5を前提

// ✅ 良い例：設定から動的に期待値を計算
const config = calculator.getConfig();
const expectedScore = config.scoreWeights.hrv / 
  (1 + Math.exp(-config.hrv.sigmoid.k * (zScore - config.hrv.sigmoid.c)));
expect(Math.abs(hrvScore - expectedScore)).toBeLessThan(expectedScore * 0.05);
```

この方針により、将来的な係数調整があってもテストの修正が不要となり、保守性が向上する。