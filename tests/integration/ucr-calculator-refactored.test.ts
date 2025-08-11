/**
 * UCR Calculator Refactored Integration Test
 * リファクタリング後のUCRCalculatorの統合テスト
 */

import { assertEquals, assertExists, assertAlmostEquals } from 'https://deno.land/std@0.210.0/assert/mod.ts';
import { UCRCalculatorRefactored } from '../../calculators/ucr-calculator-refactored.ts';
import { UCRCalculator } from '../../ucr-calculator.ts';
import { UCRCalculationInput, WellnessData } from '../../ucr-types.ts';

// テストデータの準備
const createTestData = (): UCRCalculationInput => {
  const baseDate = new Date('2025-01-10');
  const historical: WellnessData[] = [];
  
  // 60日分の履歴データを生成
  for (let i = 60; i > 0; i--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    
    historical.push({
      date: date.toISOString().split('T')[0],
      hrv: 45 + Math.random() * 20, // 45-65 ms
      rhr: 55 + Math.random() * 10, // 55-65 bpm
      sleepHours: 6.5 + Math.random() * 2, // 6.5-8.5 hours
      sleepScore: 70 + Math.random() * 20, // 70-90
      fatigue: 1 + Math.random() * 3, // 1.0-4.0
      stress: 1 + Math.random() * 3, // 1.0-4.0
      motivation: 1 + Math.random() * 3, // 1.0-4.0
      mood: 1 + Math.random() * 3, // 1.0-4.0
      soreness: 1 + Math.random() * 3, // 1.0-4.0
      injury: undefined,
      alcohol: 0
    });
  }
  
  const current: WellnessData = {
    date: baseDate.toISOString().split('T')[0],
    hrv: 52,
    rhr: 58,
    sleepHours: 7.5,
    sleepScore: 85,
    fatigue: 2.0,
    stress: 2.0,
    motivation: 3.0,
    mood: 3.0,
    soreness: 2.0,
    injury: undefined,
    alcohol: 0
  };
  
  return { current, historical };
};

Deno.test('UCRCalculatorRefactored - 基本的な計算が正しく動作する', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  const result = calculator.calculate(input);
  
  // 結果の基本構造を確認
  assertExists(result);
  assertExists(result.score);
  assertExists(result.components);
  assertExists(result.baselines);
  assertExists(result.recommendation);
  assertExists(result.dataQuality);
  
  // スコアが妥当な範囲内にあることを確認
  assertEquals(result.score >= 0 && result.score <= 100, true);
  
  // コンポーネントスコアの合計が100以下であることを確認
  const componentSum = result.components.hrv + result.components.rhr + 
                      result.components.sleep + result.components.subjective;
  assertEquals(componentSum <= 100, true);
});

Deno.test('UCRCalculatorRefactored - 元のUCRCalculatorと傾向が一致する', async () => {
  const originalCalculator = new UCRCalculator();
  const refactoredCalculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  // 同じ入力で両方の計算を実行
  const originalResult = await originalCalculator.calculate(input);
  const refactoredResult = refactoredCalculator.calculate(input);
  
  // スコアが妥当な範囲内にあることを確認（大きな差がないこと）
  const scoreDiff = Math.abs(originalResult.score - refactoredResult.score);
  assertEquals(scoreDiff < 30, true, `Score difference ${scoreDiff} is too large`);
  
  // 両方とも同じ範囲のスコアであることを確認
  const getScoreRange = (score: number) => {
    if (score >= 85) return 'prime';
    if (score >= 65) return 'moderate';
    return 'low';
  };
  
  assertEquals(getScoreRange(originalResult.score), getScoreRange(refactoredResult.score));
});

Deno.test('UCRCalculatorRefactored - トレンド分析が正しく動作する', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  const result = calculator.calculateWithTrends(input);
  
  // トレンド情報が含まれていることを確認
  assertExists(result.trends);
  assertExists(result.trends.confidence);
  assertExists(result.trends.interpretation);
  
  // 基本的なUCR結果も含まれていることを確認
  assertExists(result.score);
  assertExists(result.components);
});

Deno.test('UCRCalculatorRefactored - 修正因子が正しく適用される', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  // アルコール摂取ありのデータ
  const inputWithAlcohol = {
    ...input,
    current: {
      ...input.current,
      alcohol: 2 // Heavy drinking
    }
  };
  
  const normalResult = calculator.calculate(input);
  const alcoholResult = calculator.calculate(inputWithAlcohol);
  
  // アルコールペナルティが適用されていることを確認
  assertEquals(alcoholResult.score < normalResult.score, true);
  assertEquals(alcoholResult.modifiers.alcoholPenalty.applied, true);
  
  // 筋肉痛ペナルティのテスト
  // UCR_THEORETICAL_FOUNDATION.md: Soreness (1-4) 1=重度、4=無
  const inputWithSoreness = {
    ...input,
    current: {
      ...input.current,
      soreness: 1.0 // Severe soreness (1=重度)
    }
  };
  
  const sorenessResult = calculator.calculate(inputWithSoreness);
  assertEquals(sorenessResult.score < normalResult.score, true);
  assertEquals(sorenessResult.modifiers?.muscleSorenessPenalty?.applied, true);
});

Deno.test('UCRCalculatorRefactored - ケガによる上限が正しく適用される', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  // 重度のケガがある場合
  // UCR_THEORETICAL_FOUNDATION.md: Injury (1-4) 1=重大、4=無
  const inputWithSevereInjury = {
    ...input,
    current: {
      ...input.current,
      injury: 1.0 // Severe injury (1=重大)
    }
  };
  
  const result = calculator.calculate(inputWithSevereInjury);
  
  // スコアが30以下に制限されていることを確認
  assertEquals(result.score <= 30, true);
  assertEquals(result.modifiers?.injuryCap?.applied, true);
  assertEquals(result.modifiers?.injuryCap?.value, 30);
});

Deno.test('UCRCalculatorRefactored - データ品質評価が正しく動作する', () => {
  const calculator = new UCRCalculatorRefactored();
  
  // データが少ない場合
  const limitedInput: UCRCalculationInput = {
    current: {
      date: '2025-01-10',
      hrv: 50,
      rhr: 60,
      sleepHours: 7
    },
    historical: [
      { date: '2025-01-09', hrv: 48, rhr: 61 },
      { date: '2025-01-08', hrv: 49, rhr: 59 },
      { date: '2025-01-07', hrv: 51, rhr: 60 }
    ]
  };
  
  const result = calculator.calculate(limitedInput);
  
  // データ品質が低いと評価されることを確認
  assertExists(result.dataQuality);
  // データが少ないので信頼性は低いはず（データ数を確認）
  assertEquals(result.dataQuality.hrvDays < 7, true);
});

Deno.test('UCRCalculatorRefactored - エラーハンドリングが正しく動作する', () => {
  const calculator = new UCRCalculatorRefactored();
  
  // 無効な入力でエラーが発生することを確認
  try {
    calculator.calculate({ current: null as any, historical: [] });
    throw new Error('Should have thrown validation error');
  } catch (error) {
    assertEquals((error as Error).message.includes('Validation failed'), true);
  }
  
  // 履歴データなしでエラーが発生することを確認
  try {
    calculator.calculate({ 
      current: { date: '2025-01-10', hrv: 50 }, 
      historical: [] 
    });
    throw new Error('Should have thrown validation error');
  } catch (error) {
    assertEquals((error as Error).message.includes('Historical data is required'), true);
  }
});

Deno.test('UCRCalculatorRefactored - デバッグ情報オプションが動作する', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  // デバッグ情報を含めて計算
  const result = calculator.calculate(input, { includeDebugInfo: true });
  
  // デバッグ情報が含まれていることを確認
  assertExists(result.debug);
  assertExists(result.debug.baseScore);
  assertExists(result.debug.finalScore);
  assertExists(result.debug.config);
});

Deno.test('UCRCalculatorRefactored - 主観的スコアの重み付けが正しく適用される', () => {
  const calculator = new UCRCalculatorRefactored();
  const input = createTestData();
  
  // すべての主観的指標が良好な場合
  // intervals.icu値は1-4スケール：1=最良、4=最悪
  const goodSubjective = {
    ...input,
    current: {
      ...input.current,
      fatigue: 1.0,    // Good (1=最良：疲労していない)
      stress: 1.0,     // Good (1=最良：ストレスが低い)
      motivation: 1.0,  // High (1=最良：モチベーションが高い)
      mood: 1.0        // Good (1=最良：気分が良い)
    }
  };
  
  // すべての主観的指標が不良な場合
  const poorSubjective = {
    ...input,
    current: {
      ...input.current,
      fatigue: 4.0,    // Poor (4=最悪：疲労している)
      stress: 4.0,     // Poor (4=最悪：ストレスが高い)
      motivation: 4.0,  // Low (4=最悪：モチベーションが低い)
      mood: 4.0        // Poor (4=最悪：気分が悪い)
    }
  };
  
  const goodResult = calculator.calculate(goodSubjective);
  const poorResult = calculator.calculate(poorSubjective);
  
  // 主観的スコアに明確な差があることを確認
  assertEquals(goodResult.components.subjective > poorResult.components.subjective, true);
  assertEquals(goodResult.components.subjective >= 18, true); // 良好な場合は18点以上（20点の90%）
  assertEquals(poorResult.components.subjective <= 2, true);  // 不良な場合は2点以下（20点の10%）
});