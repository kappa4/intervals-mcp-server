import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";

// 本番環境の認証情報
const client = new CachedUCRIntervalsClient({
  athlete_id: "i72555",
  api_key: "196l99q9husoccp97i5djt9pt",
});

async function detailedCheck() {
  const targetDate = "2025-08-07";
  
  console.log("=== Detailed Data Check ===\n");
  
  // 1. 生のAPI呼び出し（2025-08-07のみ）
  console.log("1. Direct API call for 2025-08-07:");
  const singleDayResponse = await client.getWellnessData({
    oldest: targetDate,
    newest: targetDate,
  });
  console.log(`   Found ${singleDayResponse.data.length} entries`);
  singleDayResponse.data.forEach(entry => {
    console.log(`   - Date: ${entry.id}, HRV: ${entry.hrv}, RHR: ${entry.restingHR}, Sleep: ${entry.sleepScore}`);
  });
  
  // 2. getWellnessDataForUCR with lookbackDays=0 (should get only target date)
  console.log("\n2. getWellnessDataForUCR with lookbackDays=0:");
  const zeroLookback = await client.getWellnessDataForUCR(targetDate, 0);
  console.log(`   Found ${zeroLookback.length} entries`);
  zeroLookback.forEach(entry => {
    console.log(`   - Date: ${entry.date}, HRV: ${entry.hrv}, RHR: ${entry.rhr}, Sleep: ${entry.sleepScore}`);
  });
  
  // 3. getWellnessDataForUCR with lookbackDays=1
  console.log("\n3. getWellnessDataForUCR with lookbackDays=1:");
  const oneLookback = await client.getWellnessDataForUCR(targetDate, 1);
  console.log(`   Found ${oneLookback.length} entries`);
  oneLookback.forEach(entry => {
    console.log(`   - Date: ${entry.date}, HRV: ${entry.hrv}, RHR: ${entry.rhr}, Sleep: ${entry.sleepScore}`);
  });
  
  // 4. Direct API call for 2025-08-06 to 2025-08-07
  console.log("\n4. Direct API call for 2025-08-06 to 2025-08-07:");
  const twoDayResponse = await client.getWellnessData({
    oldest: "2025-08-06",
    newest: "2025-08-07",
  });
  console.log(`   Found ${twoDayResponse.data.length} entries`);
  twoDayResponse.data.forEach(entry => {
    console.log(`   - Date: ${entry.id}, HRV: ${entry.hrv}, RHR: ${entry.restingHR}, Sleep: ${entry.sleepScore}`);
  });
  
  // 5. Check what calculateUCRAssessment gets
  console.log("\n5. Data used by calculateUCRAssessment for 2025-08-07:");
  const wellnessData = await client.getWellnessDataForUCR(targetDate, 60);
  const targetData = wellnessData.find(d => d.date === targetDate);
  if (targetData) {
    console.log(`   Found data for ${targetDate}:`);
    console.log(`   - HRV: ${targetData.hrv}, RHR: ${targetData.rhr}, Sleep: ${targetData.sleepScore}`);
  } else {
    console.log(`   ❌ No data found for ${targetDate}`);
    console.log(`   Available dates: ${wellnessData.map(d => d.date).slice(0, 5).join(', ')}...`);
  }
}

detailedCheck().catch(console.error);