/**
 * Debug test for muscle soreness modifier
 * 筋肉痛修正因子のデバッグテスト
 */

import { UCRCalculatorRefactored } from '../calculators/ucr-calculator-refactored.ts';
import { UCRCalculationInput, WellnessData } from '../ucr-types.ts';

const createTestData = (soreness: number): UCRCalculationInput => {
  const historical: WellnessData[] = [];
  
  // 10日分の最小限の履歴データ
  for (let i = 10; i > 0; i--) {
    historical.push({
      date: `2025-01-${String(10 - i).padStart(2, '0')}`,
      hrv: 50,
      rhr: 60,
      sleepHours: 7,
      sleepScore: 80
    });
  }
  
  const current: WellnessData = {
    date: '2025-01-10',
    hrv: 60,        // 良好
    rhr: 55,        // 良好
    sleepHours: 8,
    sleepScore: 90,
    fatigue: 2,     // 普通
    stress: 2,      // 普通
    motivation: 2,  // 良い
    mood: 2,        // 良い
    soreness: soreness  // テスト対象
  };
  
  return { current, historical };
};

const calculator = new UCRCalculatorRefactored();

console.log('=== 筋肉痛修正因子デバッグ ===\n');
console.log('intervals.icuスケール: 1=最良（なし）, 4=最悪（重度）\n');

// 各レベルでテスト
const levels = [
  { value: 1, label: 'なし（最良）', expected: 1.0 },
  { value: 2, label: '軽度', expected: 0.9 },
  { value: 3, label: '普通', expected: 0.75 },
  { value: 4, label: '重度（最悪）', expected: 0.5 }
];

const results = levels.map(level => {
  const result = calculator.calculate(createTestData(level.value));
  return {
    level: level.value,
    label: level.label,
    score: result.score,
    modifier: result.modifiers.muscleSorenessPenalty,
    expectedMultiplier: level.expected
  };
});

// 結果表示
console.log('筋肉痛レベル別のUCRスコア:');
results.forEach(r => {
  const modifier = r.modifier?.applied ? r.modifier.value : 1.0;
  console.log(`  ${r.level}. ${r.label}: UCR=${r.score.toFixed(1)}, 修正係数=${modifier} (期待値=${r.expectedMultiplier})`);
});

// スコア減少率の計算
const scoreNoSoreness = results[0].score;
console.log('\n筋肉痛なし（レベル1）からの減少率:');
results.forEach(r => {
  if (r.level === 1) return;
  const reduction = ((scoreNoSoreness - r.score) / scoreNoSoreness * 100).toFixed(1);
  const expectedReduction = ((1 - r.expectedMultiplier) * 100).toFixed(0);
  console.log(`  レベル${r.level}: ${reduction}%減少 (期待値: 約${expectedReduction}%減少)`);
});

// 修正因子の詳細
console.log('\n修正因子の詳細:');
results.forEach(r => {
  if (r.modifier?.applied) {
    console.log(`  レベル${r.level}: ${r.modifier.reason} (×${r.modifier.value})`);
  } else {
    console.log(`  レベル${r.level}: ペナルティなし`);
  }
});

// 理論仕様との整合性チェック
console.log('\n理論仕様との整合性:');
let allCorrect = true;
results.forEach(r => {
  const actual = r.modifier?.applied ? r.modifier.value : 1.0;
  const isCorrect = actual === r.expectedMultiplier;
  const mark = isCorrect ? '✓' : '✗';
  console.log(`  ${mark} レベル${r.level}: 実際=${actual}, 期待=${r.expectedMultiplier}`);
  if (!isCorrect) allCorrect = false;
});

console.log(`\n総合判定: ${allCorrect ? '✓ すべて理論仕様通り' : '✗ 不整合あり'}`);