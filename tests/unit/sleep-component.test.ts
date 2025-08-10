import { UCRCalculator } from "./ucr-calculator.ts";
import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";

// 本番環境の認証情報
const client = new CachedUCRIntervalsClient({
  athlete_id: "i72555",
  api_key: "196l99q9husoccp97i5djt9pt",
});

async function testSleepComponent() {
  const targetDate = "2025-08-07";
  
  console.log("=== Sleep Component Test ===\n");
  
  // 1. ウェルネスデータを取得
  const wellnessData = await client.getWellnessDataForUCR(targetDate, 60);
  const currentData = wellnessData.find(d => d.date === targetDate);
  
  if (!currentData) {
    console.log("❌ No data found for target date");
    return;
  }
  
  console.log("1. Raw wellness data for 2025-08-07:");
  console.log(`   - sleepScore: ${currentData.sleepScore}`);
  console.log(`   - sleepHours: ${currentData.sleepHours}`);
  console.log(`   - sleepSecs: ${currentData.sleepSecs}`);
  
  // 2. UCRCalculatorで直接睡眠スコアを計算
  const calculator = new UCRCalculator();
  
  // calculateSleepScoreメソッドを直接呼び出すためのテスト
  // privateメソッドなので、calculate経由で確認
  const input = {
    current: currentData,
    historical: wellnessData.filter(d => d.date <= targetDate)
  };
  
  console.log("\n2. Calculating UCR with this data:");
  const result = calculator.calculate(input);
  
  console.log(`   UCR Total Score: ${result.score}`);
  console.log(`   Components breakdown:`);
  console.log(`   - HRV: ${result.components.hrv}`);
  console.log(`   - RHR: ${result.components.rhr}`);
  console.log(`   - Sleep: ${result.components.sleep}`);
  console.log(`   - Subjective: ${result.components.subjective}`);
  
  // 3. 睡眠スコアが0の場合、なぜか調査
  if (result.components.sleep === 0) {
    console.log("\n⚠️ Sleep component is 0. Investigating why...");
    
    // 睡眠データの詳細を確認
    console.log("\n3. Sleep data details:");
    console.log(`   - sleepScore present: ${currentData.sleepScore !== undefined}`);
    console.log(`   - sleepScore value: ${currentData.sleepScore}`);
    console.log(`   - sleepHours present: ${currentData.sleepHours !== undefined}`);
    console.log(`   - sleepHours value: ${currentData.sleepHours}`);
    
    // 最近7日間の睡眠データも確認
    const recentSleepData = wellnessData
      .filter(d => {
        const date = new Date(d.date);
        const target = new Date(targetDate);
        const daysDiff = (target.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 0 && daysDiff < 7;
      })
      .map(d => ({
        date: d.date,
        sleepScore: d.sleepScore,
        sleepHours: d.sleepHours
      }));
    
    console.log("\n4. Recent 7 days sleep data:");
    recentSleepData.forEach(d => {
      console.log(`   ${d.date}: score=${d.sleepScore}, hours=${d.sleepHours}`);
    });
  } else {
    console.log(`\n✅ Sleep component is correctly calculated: ${result.components.sleep} points`);
  }
}

testSleepComponent().catch(console.error);