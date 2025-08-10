#!/usr/bin/env -S deno run --allow-env --allow-net

import { UCRToolHandler } from "./ucr-tools.ts";
import { UCRCalculator } from "./ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "./ucr-types.ts";

// テスト用のクライアントを作成
const apiOptions = {
  athleteId: Deno.env.get("ATHLETE_ID") || "test",
  apiKey: Deno.env.get("API_KEY") || "test",
  baseUrl: "https://intervals.icu"
};

const handler = new UCRToolHandler(apiOptions);

// テストデータの作成
function createTestData(): UCRCalculationInput {
  const historicalData: WellnessData[] = [];
  
  // 履歴データ（30日分）
  for (let i = 30; i > 0; i--) {
    historicalData.push({
      date: new Date(2025, 7, 7 - i).toISOString().split('T')[0],
      hrv: 45 + Math.random() * 10,
      rhr: 48 + Math.random() * 4,
      sleepScore: 70 + Math.random() * 20,
      sleepHours: 6.5 + Math.random() * 2,
      fatigue: Math.floor(1 + Math.random() * 4),
      stress: Math.floor(1 + Math.random() * 4),
      motivation: Math.floor(1 + Math.random() * 4),
      soreness: Math.floor(1 + Math.random() * 4),
    });
  }

  // 今日のデータ（やや低調）
  const testData: WellnessData = {
    date: "2025-08-07",
    hrv: 38,        // 低め
    rhr: 54,        // 高め
    sleepScore: 65, // 低め
    sleepHours: 6,  // 短め
    fatigue: 2,     // 疲れている
    stress: 3,      // ややストレス
    motivation: 2,  // 低い
    soreness: 2,    // 筋肉痛あり
  };

  return {
    current: testData,
    historical: historicalData
  };
}

console.log("=" .repeat(70));
console.log("UCRスコア要因分解（get_ucr_decomposition）テスト");
console.log("=" .repeat(70));

// ローカルで計算してテスト
const calculator = new UCRCalculator();
const testInput = createTestData();
const result = calculator.calculate(testInput);

console.log("\n【基本UCR計算結果】");
console.log(`- 最終スコア: ${result.score}点`);
console.log(`- ベーススコア: ${result.baseScore}点`);
console.log(`- 各コンポーネント:`);
console.log(`  - HRV: ${result.components.hrv.toFixed(1)}点`);
console.log(`  - RHR: ${result.components.rhr.toFixed(1)}点`);
console.log(`  - 睡眠: ${result.components.sleep.toFixed(1)}点`);
console.log(`  - 主観: ${result.components.subjective.toFixed(1)}点`);

// モックレスポンスを作成（実際のAPIを使わずにテスト）
console.log("\n【要因分解の出力例】");

const mockDecomposition = {
  success: true,
  date: "2025-08-07",
  final_score: result.score,
  base_score: result.baseScore,
  decomposition: {
    base_components: {
      hrv: {
        score: result.components.hrv,
        max_score: 40,
        contribution_percentage: Math.round((result.components.hrv / result.baseScore) * 100),
        status: result.components.hrv >= 30 ? "良好" : result.components.hrv >= 20 ? "標準" : "低下"
      },
      rhr: {
        score: result.components.rhr,
        max_score: 25,
        contribution_percentage: Math.round((result.components.rhr / result.baseScore) * 100),
        status: result.components.rhr >= 18.75 ? "良好" : result.components.rhr >= 12.5 ? "標準" : "低下"
      },
      sleep: {
        score: result.components.sleep,
        max_score: 15,
        contribution_percentage: Math.round((result.components.sleep / result.baseScore) * 100),
        status: result.components.sleep >= 11.25 ? "良好" : result.components.sleep >= 7.5 ? "標準" : "低下"
      },
      subjective: {
        score: result.components.subjective,
        max_score: 20,
        contribution_percentage: Math.round((result.components.subjective / result.baseScore) * 100),
        status: result.components.subjective >= 15 ? "良好" : result.components.subjective >= 10 ? "標準" : "低下"
      }
    },
    modifiers: result.modifiers ? Object.entries(result.modifiers)
      .filter(([_, mod]: [string, any]) => mod.applied)
      .map(([key, mod]: [string, any]) => ({
        type: key,
        reason: mod.reason,
        impact: mod.value,
        effect_percentage: Math.round((1 - mod.value) * 100)
      })) : [],
    total_modifier_impact: result.multiplier || 1.0,
    score_adjustment: result.score - result.baseScore,
    primary_factors: {
      positive: [],
      negative: [],
      dominant: null
    }
  },
  narrative: {
    summary: `今日のUCRスコアは${result.score}点で、${result.recommendation.name}ゾーンにあります。`,
    details: [
      `HRV（心拍変動）: ${result.components.hrv.toFixed(1)}/40点（${Math.round((result.components.hrv / 40) * 100)}%）`,
      `RHR（安静時心拍数）: ${result.components.rhr.toFixed(1)}/25点（${Math.round((result.components.rhr / 25) * 100)}%）`,
      `睡眠: ${result.components.sleep.toFixed(1)}/15点（${Math.round((result.components.sleep / 15) * 100)}%）`,
      `主観的評価: ${result.components.subjective.toFixed(1)}/20点（${Math.round((result.components.subjective / 20) * 100)}%）`
    ],
    insights: [
      "各コンポーネントの状態から、現在の身体的・精神的コンディションを分析",
      "制限要因と強みを特定"
    ],
    recommendations: [
      result.recommendation.action,
      result.recommendation.examples
    ]
  },
  comparison: null
};

// 結果を表示
console.log(JSON.stringify(mockDecomposition, null, 2));

console.log("\n【物語的解釈の例】");
console.log(mockDecomposition.narrative.summary);
console.log("\n詳細:");
mockDecomposition.narrative.details.forEach(detail => {
  console.log(`- ${detail}`);
});
console.log("\n洞察:");
mockDecomposition.narrative.insights.forEach(insight => {
  console.log(`- ${insight}`);
});
console.log("\n推奨事項:");
mockDecomposition.narrative.recommendations.forEach(rec => {
  console.log(`- ${rec}`);
});

console.log("\n=" .repeat(70));
console.log("【get_ucr_decompositionツールの特徴】");
console.log("=" .repeat(70));
console.log(`
1. get_ucr_componentsとの違い:
   - components: 「何が」起きているか（現在の状態）
   - decomposition: 「なぜ」そうなのか（要因分析）

2. 提供する情報:
   - 各コンポーネントの寄与率
   - 修正因子の影響度
   - 主要な変動要因の特定
   - 物語的な解釈と洞察
   - 前日比較（オプション）

3. 使用場面:
   - 朝のUCR評価時の詳細理解
   - トレーニング計画の根拠説明
   - コンディション変化の原因究明

4. 出力形式:
   - 構造化データ（分解結果）
   - ナラティブ（物語的解釈）
   - 実践的な推奨事項
`);