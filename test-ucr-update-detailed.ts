/**
 * Detailed test script for UCR update investigation
 * This script helps identify why wellness fields are not being updated
 */

import { UCRToolHandler } from "./ucr-tools.ts";
import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";

// Test configuration
const TEST_DATE = "2025-01-04"; // Yesterday's date
const API_OPTIONS = {
  athlete_id: Deno.env.get("ATHLETE_ID") || "",
  api_key: Deno.env.get("API_KEY") || "",
};

if (!API_OPTIONS.athlete_id || !API_OPTIONS.api_key) {
  console.error("ERROR: ATHLETE_ID and API_KEY environment variables are required");
  console.error("Usage: ATHLETE_ID=your_id API_KEY=your_key deno run --allow-net --allow-env test-ucr-update-detailed.ts");
  Deno.exit(1);
}

async function testUCRUpdate() {
  try {
    const handler = new UCRToolHandler(API_OPTIONS);
    const client = new IntervalsAPIClient(API_OPTIONS);
    
    console.log("=== UCR Update Detailed Test ===");
    console.log(`Date: ${TEST_DATE}`);
    console.log(`Athlete ID: ${API_OPTIONS.athlete_id}`);
    console.log("");
    
    // Step 1: Check custom fields setup
    console.log("=== Step 1: Checking UCR custom fields setup ===");
    const setupResult = await handler.handleTool("check_ucr_setup", {});
    
    if (setupResult.success) {
      console.log("Custom fields configured:", setupResult.ucr_setup.custom_fields.configured);
      console.log("Missing fields:", setupResult.ucr_setup.custom_fields.missing);
      
      if (setupResult.ucr_setup.custom_fields.missing.length > 0) {
        console.error("\nERROR: Missing required custom fields!");
        console.error("Please create these fields in intervals.icu Settings > Custom Fields:");
        setupResult.ucr_setup.custom_fields.missing.forEach((field: string) => {
          console.error(`  - ${field}`);
        });
        console.error("\nCustom field types:");
        console.error("  - UCRMomentum: Number");
        console.error("  - UCRVolatility: Number");
        console.error("  - UCRTrendState: Select (options 1-9)");
        console.error("  - UCRTrendInterpretation: Text");
        console.error("  - UCRVolatilityLevel: Text");
        console.error("  - UCRVolatilityBandPosition: Number");
        return;
      }
    } else {
      console.error("Failed to check custom fields:", setupResult.error);
      return;
    }
    
    // Step 2: Get wellness data before update
    console.log("\n=== Step 2: Getting wellness data before update ===");
    let beforeData: any = null;
    try {
      beforeData = await client.getWellnessEntry(TEST_DATE);
      console.log("Current wellness data:");
      console.log(`  readiness: ${beforeData.readiness}`);
      console.log(`  UCRMomentum: ${beforeData.UCRMomentum}`);
      console.log(`  UCRVolatility: ${beforeData.UCRVolatility}`);
      console.log(`  UCRTrendState: ${beforeData.UCRTrendState}`);
      console.log(`  UCRTrendInterpretation: ${beforeData.UCRTrendInterpretation}`);
      console.log(`  fatigue: ${beforeData.fatigue}`);
      console.log(`  stress: ${beforeData.stress}`);
      console.log(`  motivation: ${beforeData.motivation}`);
    } catch (error) {
      console.log("No existing wellness data for this date");
    }
    
    // Step 3: Calculate UCR without updating
    console.log("\n=== Step 3: Calculating UCR (without updating intervals.icu) ===");
    const assessmentResult = await handler.handleTool("get_ucr_assessment", {
      date: TEST_DATE,
      include_trends: true,
      update_intervals: false
    });
    
    if (assessmentResult.success) {
      console.log(`Calculated UCR Score: ${assessmentResult.ucr_assessment.score}`);
      console.log(`Base Score: ${assessmentResult.ucr_assessment.base_score}`);
      if (assessmentResult.ucr_assessment.trend) {
        console.log("Trend data:");
        console.log(`  Momentum: ${assessmentResult.ucr_assessment.trend.momentum}`);
        console.log(`  Volatility: ${assessmentResult.ucr_assessment.trend.volatility}`);
        console.log(`  Trend State: ${assessmentResult.ucr_assessment.trend.trend_state}`);
      }
    } else {
      console.error("Failed to calculate UCR:", assessmentResult.error);
      return;
    }
    
    // Step 4: Update with UCR data
    console.log("\n=== Step 4: Updating intervals.icu with UCR data ===");
    const updateResult = await handler.handleTool("get_ucr_assessment", {
      date: TEST_DATE,
      include_trends: true,
      update_intervals: true
    });
    
    if (!updateResult.success) {
      console.error("Failed to update UCR:", updateResult.error);
      return;
    }
    
    console.log("Update request sent successfully");
    
    // Step 5: Wait and get wellness data after update
    console.log("\n=== Step 5: Getting wellness data after update (waiting 2 seconds) ===");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const afterData = await client.getWellnessEntry(TEST_DATE);
      console.log("Updated wellness data:");
      console.log(`  readiness: ${afterData.readiness}`);
      console.log(`  UCRMomentum: ${afterData.UCRMomentum}`);
      console.log(`  UCRVolatility: ${afterData.UCRVolatility}`);
      console.log(`  UCRTrendState: ${afterData.UCRTrendState}`);
      console.log(`  UCRTrendInterpretation: ${afterData.UCRTrendInterpretation}`);
      
      // Compare before and after
      console.log("\n=== Comparison ===");
      const fields = ['readiness', 'UCRMomentum', 'UCRVolatility', 'UCRTrendState', 'UCRTrendInterpretation'];
      fields.forEach(field => {
        const before = beforeData ? beforeData[field] : 'N/A';
        const after = afterData[field];
        const changed = before !== after ? '✓ CHANGED' : '✗ NO CHANGE';
        console.log(`${field}: ${before} → ${after} ${changed}`);
      });
      
      // Check if readiness matches UCR score
      const expectedReadiness = Math.round(assessmentResult.ucr_assessment.score);
      if (afterData.readiness !== expectedReadiness) {
        console.error(`\nERROR: readiness field mismatch!`);
        console.error(`  Expected: ${expectedReadiness} (UCR score)`);
        console.error(`  Actual: ${afterData.readiness}`);
      }
      
    } catch (error) {
      console.error("Failed to get wellness data after update:", getErrorMessage(error));
    }
    
    // Step 6: Test subjective data update
    console.log("\n=== Step 6: Testing subjective data update ===");
    const subjectiveResult = await handler.handleTool("update_wellness_assessment", {
      date: TEST_DATE,
      fatigue: 3,
      stress: 2,
      motivation: 3
    });
    
    if (subjectiveResult.success) {
      console.log("Subjective update successful");
      console.log(`New UCR Score: ${subjectiveResult.ucr_assessment.score}`);
      
      // Check final state
      await new Promise(resolve => setTimeout(resolve, 1000));
      const finalData = await client.getWellnessEntry(TEST_DATE);
      console.log("\nFinal wellness data:");
      console.log(`  readiness: ${finalData.readiness}`);
      console.log(`  fatigue: ${finalData.fatigue}`);
      console.log(`  stress: ${finalData.stress}`);
      console.log(`  motivation: ${finalData.motivation}`);
    }
    
  } catch (error) {
    console.error("Test failed:", getErrorMessage(error));
    log("ERROR", `Test failed: ${getErrorMessage(error)}`);
  }
}

// Run the test
console.log("Starting detailed UCR update test...");
await testUCRUpdate();
console.log("\nTest completed.");