#!/usr/bin/env -S deno run --allow-env --allow-net

import { UCRCalculator } from "./ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "./ucr-types.ts";

// 2025年8月7日のテストデータ
const testData: WellnessData = {
  date: "2025-08-07",
  hrv: 45,  // HRVスコア: 25.0点を生成する値
  rhr: 50,  // RHRスコア: 6.6点を生成する値
  sleepScore: 38,  // 睡眠スコア: 7.6点を生成する値
  sleepHours: 7,
  fatigue: 1,  // 最高状態
  stress: 1,   // 最高状態
  motivation: 1, // 最高状態
  soreness: 1,  // 最高状態
};

// 履歴データ（ベースライン計算用）
const historicalData: WellnessData[] = [];
for (let i = 30; i > 0; i--) {
  historicalData.push({
    date: new Date(2025, 7, 7 - i).toISOString().split('T')[0],
    hrv: 45 + Math.random() * 10 - 5,
    rhr: 50 + Math.random() * 5 - 2.5,
    sleepScore: 75 + Math.random() * 20 - 10,
    sleepHours: 7 + Math.random() * 2 - 1,
    fatigue: 2,
    stress: 2,
    motivation: 2,
    soreness: 2,
  });
}

const input: UCRCalculationInput = {
  current: testData,
  historical: historicalData
};

console.log("=".repeat(60));
console.log("UCRスコア重み付け調整 - 変更前後の比較");
console.log("=".repeat(60));

// 現行版での計算
console.log("\n【現行版】重み付け: HRV=40, RHR=20, 睡眠=20, 主観=20");
console.log("-".repeat(60));
const calculatorCurrent = new UCRCalculator();
const resultCurrent = calculatorCurrent.calculate(input, { includeDebugInfo: true });

console.log(`HRVコンポーネント: ${resultCurrent.components.hrv.toFixed(1)}点 / 40点`);
console.log(`RHRコンポーネント: ${resultCurrent.components.rhr.toFixed(1)}点 / 20点`);
console.log(`睡眠コンポーネント: ${resultCurrent.components.sleep.toFixed(1)}点 / 20点`);
console.log(`主観コンポーネント: ${resultCurrent.components.subjective.toFixed(1)}点 / 20点`);
console.log(`ベーススコア: ${resultCurrent.baseScore}点`);
console.log(`最終UCRスコア: ${resultCurrent.score}点`);

// 修正版での計算
console.log("\n【修正版】重み付け: HRV=40, RHR=25, 睡眠=15, 主観=20");
console.log("-".repeat(60));
const modifiedConfig = {
  scoreWeights: {
    hrv: 40,
    rhr: 25,  // 20 → 25
    sleep: 15,  // 20 → 15
    subjective: 20
  }
};
const calculatorModified = new UCRCalculator(modifiedConfig);
const resultModified = calculatorModified.calculate(input, { includeDebugInfo: true });

console.log(`HRVコンポーネント: ${resultModified.components.hrv.toFixed(1)}点 / 40点`);
console.log(`RHRコンポーネント: ${resultModified.components.rhr.toFixed(1)}点 / 25点`);
console.log(`睡眠コンポーネント: ${resultModified.components.sleep.toFixed(1)}点 / 15点`);
console.log(`主観コンポーネント: ${resultModified.components.subjective.toFixed(1)}点 / 20点`);
console.log(`ベーススコア: ${resultModified.baseScore}点`);
console.log(`最終UCRスコア: ${resultModified.score}点`);

// 変更の影響
console.log("\n【変更の影響】");
console.log("-".repeat(60));
console.log(`UCRスコアの変化: ${resultCurrent.score}点 → ${resultModified.score}点 (${(resultModified.score - resultCurrent.score > 0 ? '+' : '')}${resultModified.score - resultCurrent.score}点)`);
console.log(`RHRコンポーネントの変化: ${resultCurrent.components.rhr.toFixed(1)}点 → ${resultModified.components.rhr.toFixed(1)}点`);
console.log(`睡眠コンポーネントの変化: ${resultCurrent.components.sleep.toFixed(1)}点 → ${resultModified.components.sleep.toFixed(1)}点`);

console.log("\n【統計学的改善】");
console.log("-".repeat(60));
console.log("• HRVの二重計上バイアスを削減");
console.log("• 睡眠スコアの重み付けを25%削減（20→15）");
console.log("• RHRの重要性を適切に評価（20→25）");
console.log("• 全体の100点満点は維持");