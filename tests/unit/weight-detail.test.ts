#!/usr/bin/env -S deno run --allow-env --allow-net

import { UCRCalculator } from "./ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "./ucr-types.ts";

// テストデータ作成関数
function createTestData(hrvScore: number, rhrScore: number, sleepPercentage: number): UCRCalculationInput {
  const historicalData: WellnessData[] = [];
  
  // 標準的な履歴データ
  for (let i = 30; i > 0; i--) {
    historicalData.push({
      date: new Date(2025, 7, 7 - i).toISOString().split('T')[0],
      hrv: 45,
      rhr: 50,
      sleepScore: 75,
      sleepHours: 7,
      fatigue: 2,
      stress: 2,
    });
  }

  // 各スコアに対応する値を計算
  // HRV: zScore=0で約25点/40点(62.5%)を基準
  const targetHrvZ = (hrvScore / 40 - 0.625) * 2; 
  const targetHrv = 45 * Math.exp(targetHrvZ * 0.3); // lnHRVで調整
  
  // RHR: zScore=0で14点/20点(70%)を基準に
  const targetRhrZ = -(rhrScore - 14) / 6;
  const targetRhr = 50 - targetRhrZ * 5;
  
  // 睡眠: 線形スケーリング
  const targetSleepScore = sleepPercentage;

  const testData: WellnessData = {
    date: "2025-08-07",
    hrv: targetHrv,
    rhr: targetRhr,
    sleepScore: targetSleepScore,
    sleepHours: 7,
    fatigue: 1,
    stress: 1,
  };

  return {
    current: testData,
    historical: historicalData
  };
}

console.log("=".repeat(70));
console.log("UCRスコア重み付け変更の詳細分析");
console.log("=".repeat(70));

// 旧配点設定（手動指定）
const oldConfig = {
  scoreWeights: {
    hrv: 40,
    rhr: 20,
    sleep: 20,
    subjective: 20
  },
  rhr: {
    baselineDays: 30,
    thresholdSd: 1.0,
    linear: {
      baseline: 14,
      slope: 6
    }
  }
};

// 新配点設定（デフォルト）
const newConfig = {
  scoreWeights: {
    hrv: 40,
    rhr: 25,
    sleep: 15,
    subjective: 20
  },
  rhr: {
    baselineDays: 30,
    thresholdSd: 1.0,
    linear: {
      baseline: 17.5,
      slope: 7.5
    }
  }
};

// 複数のシナリオでテスト
const scenarios = [
  { name: "低レディネス", hrv: 10, rhr: 5, sleep: 30 },
  { name: "中レディネス", hrv: 20, rhr: 10, sleep: 50 },
  { name: "高レディネス", hrv: 30, rhr: 15, sleep: 80 },
  { name: "最高レディネス", hrv: 35, rhr: 18, sleep: 95 },
];

for (const scenario of scenarios) {
  console.log("\n" + "=".repeat(70));
  console.log(`シナリオ: ${scenario.name}`);
  console.log("-".repeat(70));
  
  const input = createTestData(scenario.hrv, scenario.rhr, scenario.sleep);
  
  // 旧配点での計算
  const calcOld = new UCRCalculator(oldConfig);
  const resultOld = calcOld.calculate(input);
  
  // 新配点での計算
  const calcNew = new UCRCalculator(newConfig);
  const resultNew = calcNew.calculate(input);
  
  console.log("\n【旧配点】HRV:40, RHR:20, 睡眠:20, 主観:20");
  console.log(`  HRV: ${resultOld.components.hrv.toFixed(1)}点`);
  console.log(`  RHR: ${resultOld.components.rhr.toFixed(1)}点`);
  console.log(`  睡眠: ${resultOld.components.sleep.toFixed(1)}点`);
  console.log(`  主観: ${resultOld.components.subjective.toFixed(1)}点`);
  console.log(`  合計: ${resultOld.score}点`);
  
  console.log("\n【新配点】HRV:40, RHR:25, 睡眠:15, 主観:20");
  console.log(`  HRV: ${resultNew.components.hrv.toFixed(1)}点`);
  console.log(`  RHR: ${resultNew.components.rhr.toFixed(1)}点`);
  console.log(`  睡眠: ${resultNew.components.sleep.toFixed(1)}点`);
  console.log(`  主観: ${resultNew.components.subjective.toFixed(1)}点`);
  console.log(`  合計: ${resultNew.score}点`);
  
  const diff = resultNew.score - resultOld.score;
  console.log(`\n変化: ${diff > 0 ? '+' : ''}${diff}点`);
  
  // 各コンポーネントの寄与率
  console.log("\n【寄与率分析】");
  const oldTotal = resultOld.components.hrv + resultOld.components.rhr + resultOld.components.sleep + resultOld.components.subjective;
  const newTotal = resultNew.components.hrv + resultNew.components.rhr + resultNew.components.sleep + resultNew.components.subjective;
  
  console.log("旧配点での寄与率:");
  console.log(`  HRV: ${(resultOld.components.hrv / oldTotal * 100).toFixed(1)}%`);
  console.log(`  RHR: ${(resultOld.components.rhr / oldTotal * 100).toFixed(1)}%`);
  console.log(`  睡眠: ${(resultOld.components.sleep / oldTotal * 100).toFixed(1)}%`);
  
  console.log("新配点での寄与率:");
  console.log(`  HRV: ${(resultNew.components.hrv / newTotal * 100).toFixed(1)}%`);
  console.log(`  RHR: ${(resultNew.components.rhr / newTotal * 100).toFixed(1)}%`);
  console.log(`  睡眠: ${(resultNew.components.sleep / newTotal * 100).toFixed(1)}%`);
}

console.log("\n" + "=".repeat(70));
console.log("統計学的改善の要約");
console.log("=".repeat(70));
console.log(`
1. HRV二重計上の削減:
   - Garmin睡眠スコアにHRV成分が含まれる問題に対処
   - 睡眠配点を20→15に削減（25%減）

2. RHRの重要性向上:
   - 独立した生理指標としての価値を適切に評価
   - RHR配点を20→25に増加（25%増）

3. 全体バランスの維持:
   - 総合100点満点を維持
   - 客観指標（HRV+RHR+睡眠）は80点で変わらず
   - 主観指標は20点で変わらず

4. 期待される効果:
   - 相関分析での人工的バイアスの削減
   - より統計学的に健全な指標構成
   - Feel値との相関性向上の可能性
`);