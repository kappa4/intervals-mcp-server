import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";

// 本番環境の認証情報
const client = new CachedUCRIntervalsClient({
  athlete_id: "i72555",
  api_key: "196l99q9husoccp97i5djt9pt",
});

async function testFieldMapping() {
  const targetDate = "2025-08-07";
  
  console.log("=== Testing Field Mapping ===\n");
  
  // 1. 生のAPIレスポンスを取得
  const response = await client.getWellnessData({
    oldest: targetDate,
    newest: targetDate,
  });
  
  const rawData = response.data[0];
  console.log("1. Raw API Response:");
  console.log(`   - id: ${rawData.id}`);
  console.log(`   - restingHR: ${rawData.restingHR}`);
  console.log(`   - hrv: ${rawData.hrv}`);
  console.log(`   - sleepSecs: ${rawData.sleepSecs}`);
  console.log(`   - sleepScore: ${rawData.sleepScore}`);
  console.log(`   - sleepQuality: ${rawData.sleepQuality}`);
  console.log(`   - fatigue: ${rawData.fatigue}`);
  console.log(`   - stress: ${rawData.stress}`);
  console.log(`   - motivation: ${rawData.motivation}`);
  
  // 2. 変換後のデータを取得
  const wellnessData = await client.getWellnessDataForUCR(targetDate, 1);
  const convertedData = wellnessData[0];
  
  console.log("\n2. Converted WellnessData:");
  console.log(`   - date: ${convertedData?.date}`);
  console.log(`   - rhr: ${convertedData?.rhr}`);
  console.log(`   - hrv: ${convertedData?.hrv}`);
  console.log(`   - sleepSecs: ${convertedData?.sleepSecs}`);
  console.log(`   - sleepHours: ${convertedData?.sleepHours}`);
  console.log(`   - sleepScore: ${convertedData?.sleepScore}`);
  console.log(`   - sleepQuality: ${convertedData?.sleepQuality}`);
  console.log(`   - fatigue: ${convertedData?.fatigue}`);
  console.log(`   - stress: ${convertedData?.stress}`);
  console.log(`   - motivation: ${convertedData?.motivation}`);
  
  console.log("\n3. Field Mapping Analysis:");
  console.log(`   - restingHR -> rhr: ${rawData.restingHR} -> ${convertedData?.rhr}`);
  console.log(`   - sleepSecs -> sleepHours: ${rawData.sleepSecs} -> ${convertedData?.sleepHours}`);
  console.log(`   - sleepScore -> sleepScore: ${rawData.sleepScore} -> ${convertedData?.sleepScore}`);
  
  if (convertedData?.rhr === undefined && rawData.restingHR !== undefined) {
    console.log("\n❌ ERROR: restingHR not properly mapped to rhr!");
  }
  
  if (convertedData?.sleepHours === undefined && rawData.sleepSecs !== undefined) {
    console.log("❌ ERROR: sleepSecs not properly converted to sleepHours!");
  }
}

testFieldMapping().catch(console.error);