/**
 * Debug test for subjective score calculation
 */

import { UCRCalculatorRefactored } from '../calculators/ucr-calculator-refactored.ts';
import { UCRCalculationInput, WellnessData } from '../ucr-types.ts';

const createTestData = (): UCRCalculationInput => {
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
    hrv: 50,
    rhr: 60,
    sleepHours: 7,
    sleepScore: 80
  };
  
  return { current, historical };
};

const calculator = new UCRCalculatorRefactored();
const input = createTestData();

// Good case (intervals.icuスケール: 1=最良、4=最悪)
const goodSubjective = {
  ...input,
  current: {
    ...input.current,
    fatigue: 1.0,    // 1=最良
    stress: 1.0,     // 1=最良
    motivation: 1.0,  // 1=最良
    mood: 1.0        // 1=最良
  }
};

// Poor case (intervals.icuスケール: 1=最良、4=最悪)
const poorSubjective = {
  ...input,
  current: {
    ...input.current,
    fatigue: 4.0,    // 4=最悪
    stress: 4.0,     // 4=最悪
    motivation: 4.0,  // 4=最悪
    mood: 4.0        // 4=最悪
  }
};

const goodResult = calculator.calculate(goodSubjective);
const poorResult = calculator.calculate(poorSubjective);

console.log('=== 主観的スコア計算デバッグ ===\n');
console.log('Good case (すべて1=最良):');
console.log(`  主観的スコア: ${goodResult.components.subjective}`);
console.log(`  総合スコア: ${goodResult.score}`);

console.log('\nPoor case (すべて4=最悪):');
console.log(`  主観的スコア: ${poorResult.components.subjective}`);
console.log(`  総合スコア: ${poorResult.score}`);

console.log('\n期待される結果:');
console.log('  Good case > Poor case');
console.log(`  実際: ${goodResult.components.subjective} > ${poorResult.components.subjective} = ${goodResult.components.subjective > poorResult.components.subjective}`);

// 期待される計算（変換マップ使用）
console.log('\n期待される計算（変換マップ使用）:');
console.log('  fatigue/stress: 1→100%, 2→75%, 3→40%, 4→0%');
console.log('  mood/motivation: 1→100%, 2→85%, 3→70%, 4→0%');

// 変換マップを使った理論計算
const expectedGood = (1.0 * 0.35 + 1.0 * 0.25 + 1.0 * 0.20 + 1.0 * 0.20) * 20;
const expectedPoor = (0.0 * 0.35 + 0.0 * 0.25 + 0.0 * 0.20 + 0.0 * 0.20) * 20;

console.log('\n変換マップベースの期待値:');
console.log(`  Good case: ${expectedGood} (期待値: 20点満点)`);
console.log(`  Poor case: ${expectedPoor} (期待値: 0点)`);