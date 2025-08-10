import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";

// 本番環境の認証情報
const client = new CachedUCRIntervalsClient({
  athlete_id: "i72555",
  api_key: "196l99q9husoccp97i5djt9pt",
});

async function testUCRCalculation() {
  const targetDate = "2025-08-07";
  
  console.log("=== UCR Calculation Test ===\n");
  
  try {
    // UCR計算を実行
    const result = await client.calculateUCRAssessment(targetDate, true);
    
    console.log("UCR Assessment Result:");
    console.log(`- Date: ${targetDate}`);
    console.log(`- Total Score: ${result.score}`);
    console.log(`- Components:`);
    console.log(`  - HRV Score: ${result.details.hrvScore.score}/${result.details.hrvScore.weight}`);
    console.log(`  - RHR Score: ${result.details.rhrScore.score}/${result.details.rhrScore.weight}`);
    console.log(`  - Sleep Score: ${result.details.sleepScore.score}/${result.details.sleepScore.weight}`);
    console.log(`  - Subjective Score: ${result.details.subjectiveScore.score}/${result.details.subjectiveScore.weight}`);
    console.log(`\nRecommendation: ${result.recommendation.name}`);
    console.log(`- Load: ${result.recommendation.load}`);
    console.log(`- Focus: ${result.recommendation.focus}`);
    
    // 睡眠スコアの詳細を確認
    if (result.details.sleepScore.score > 0) {
      console.log("\n✅ Sleep score is being calculated correctly!");
      console.log(`   Sleep component contributed ${result.details.sleepScore.score} points to UCR`);
    } else {
      console.log("\n❌ Sleep score is 0 - not being calculated!");
    }
    
  } catch (error) {
    console.error("Error calculating UCR:", error);
  }
}

testUCRCalculation().catch(console.error);