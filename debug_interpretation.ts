/**
 * 27ステート解釈システムのデバッグ用スクリプト
 */

import { UCRCalculator } from './ucr-calculator.ts';
import { WellnessData } from './ucr-types.ts';

const calculator = new UCRCalculator();

// テスト用データ生成（7日間モメンタム制御）
const generateTestData = (targetUCRScore: number, momentumPercent: number): WellnessData[] => {
  const data: WellnessData[] = [];
  const startDate = new Date('2024-01-01');
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    let currentScore = targetUCRScore;
    
    // 最後の7日間でモメンタムを作る
    if (i >= 23) { // 最後の7日間
      const daysFromEnd = 29 - i;
      // 7日前のスコア = 現在のスコア / (1 + モメンタム/100)
      const sevenDaysAgoScore = targetUCRScore / (1 + momentumPercent / 100);
      const progressInLast7Days = (7 - daysFromEnd) / 7;
      currentScore = sevenDaysAgoScore + (targetUCRScore - sevenDaysAgoScore) * progressInLast7Days;
    } else {
      // 前半は7日前のスコアで安定
      currentScore = targetUCRScore / (1 + momentumPercent / 100);
    }
    
    // UCRスコアに対応するHRV/RHRを設定
    const hrv = Math.max(25, 30 + currentScore * 0.8);
    const rhr = Math.max(45, 75 - currentScore * 0.3);
    
    data.push({
      date: date.toISOString().split('T')[0],
      hrv: hrv,
      rhr: rhr,
      sleepScore: Math.max(70, currentScore * 0.9),
      sleepHours: 7.5,
      fatigue: 2,
      soreness: 2,
      stress: 2,
      motivation: 2
    });
  }
  
  return data;
};

// HIGH_POSITIVE + LOW volatilityのテスト（88点 + 5%上昇）
console.log("=== HIGH_POSITIVE (LOW volatility) テスト ===");
const highPositiveData = generateTestData(88, 5);
const result = calculator.calculateWithTrends({
  current: highPositiveData[29],
  historical: highPositiveData
});

console.log("UCR Score:", result.score);
console.log("Trend State:", result.trend?.trendState);
console.log("Trend State Code:", result.trend?.trendStateCode);
console.log("Momentum:", result.trend?.momentum);
console.log("Volatility:", result.trend?.volatility);
console.log("Volatility Level:", result.trend?.volatilityLevel);
console.log("Interpretation:");
console.log(result.trend?.interpretation);
console.log("Interpretation Length:", result.trend?.interpretation?.length);

// テキスト内容確認
if (result.trend?.interpretation) {
  console.log("\n=== テキスト内容チェック ===");
  console.log("Contains '理想的なピーキング':", result.trend.interpretation.includes('理想的なピーキング'));
  console.log("Contains '適応プロセス':", result.trend.interpretation.includes('適応プロセス'));
  console.log("Contains 'UCRスコア':", result.trend.interpretation.includes('UCRスコア'));
  console.log("Contains '%':", result.trend.interpretation.includes('%'));
}