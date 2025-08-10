import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";
import { log } from "./logger.ts";

// 本番環境の認証情報
const client = new CachedUCRIntervalsClient({
  athleteId: "i72555",
  apiKey: "196l99q9husoccp97i5djt9pt",
});

async function testUCRCalculation() {
  const targetDate = "2025-08-07";
  
  console.log(`\n=== Testing UCR calculation for ${targetDate} ===`);
  
  // 1. ウェルネスデータを直接取得
  console.log("\n1. Fetching wellness data directly...");
  const wellnessData = await client.getWellnessDataForUCR(targetDate, 60);
  const todayData = wellnessData.find(d => d.date === targetDate);
  
  if (todayData) {
    console.log(`Today's wellness data:
    - Date: ${todayData.date}
    - HRV: ${todayData.hrv}
    - RHR: ${todayData.restingHR}
    - Sleep Score: ${todayData.sleepScore}
    - Sleep Secs: ${todayData.sleepSecs}
    - Fatigue: ${todayData.fatigue}
    - Stress: ${todayData.stress}
    - Motivation: ${todayData.motivation}
    `);
  } else {
    console.log("WARNING: No wellness data found for today\!");
  }
  
  // 2. UCR計算を実行
  console.log("\n2. Calculating UCR assessment...");
  try {
    const result = await client.calculateUCRAssessment(targetDate, true);
    
    console.log(`\nUCR Assessment Result:
    - Total Score: ${result.score}
    - HRV Score: ${result.details.hrvScore.score}/${result.details.hrvScore.weight}
    - RHR Score: ${result.details.rhrScore.score}/${result.details.rhrScore.weight}
    - Sleep Score: ${result.details.sleepScore.score}/${result.details.sleepScore.weight}
    - Subjective Score: ${result.details.subjectiveScore.score}/${result.details.subjectiveScore.weight}
    
    Recommendation: ${result.recommendation.name}
    - Load: ${result.recommendation.load}
    - Focus: ${result.recommendation.focus}
    `);
    
    // Sleep Score詳細
    console.log(`\nSleep Score Details:
    - Raw Sleep Score: ${todayData?.sleepScore ?? 'N/A'}
    - Sleep Secs: ${todayData?.sleepSecs ?? 'N/A'}
    - Calculated Score: ${result.details.sleepScore.score}
    - Weight: ${result.details.sleepScore.weight}
    `);
    
  } catch (error) {
    console.error("Error calculating UCR:", error);
  }
}

// 実行
testUCRCalculation();
