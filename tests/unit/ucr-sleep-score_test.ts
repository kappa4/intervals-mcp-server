/**
 * Sleep Score Linear Scaling Tests
 * 
 * Purpose: Verify Garmin sleep score (0-100) to UCR sleep score (0-20) conversion
 * Tests linear scaling, edge cases, and sleep hour constraints
 * 
 * Key Design Principles:
 * - Dynamic configuration reference to ensure coefficient independence
 * - Tests proportional relationships rather than absolute values
 * - Validates sleep hour minimum threshold behavior
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Sleep Score Linear Scaling", () => {
  let calculator: UCRCalculator;
  let config: any;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
    config = calculator.getConfig();
  });

  /**
   * Create test data with specific sleep score and hours
   */
  function createTestDataWithSleep(sleepScore: number, sleepHours?: number): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    
    // Create minimal historical data for other metrics
    for (let i = 0; i < 30; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: 50,
        sleepScore: 80,
        sleepHours: 7.5
      });
    }
    
    const current: WellnessData = {
      date: "2025-08-30",
      hrv: 45,
      rhr: 50,
      sleepScore: sleepScore,
      sleepHours: sleepHours
    };
    
    return {
      current,
      historical: historicalData
    };
  }

  it("should scale sleep scores proportionally", () => {
    // Test linear scaling from 0-100 to 0-maxScore
    const testScores = [0, 25, 50, 75, 100];
    const maxSleepScore = config.scoreWeights.sleep;
    
    for (const garminScore of testScores) {
      const input = createTestDataWithSleep(garminScore, 8); // 8 hours sleep
      const result = calculator.calculate(input);
      
      const expectedScore = (garminScore / 100) * maxSleepScore;
      
      assertAlmostEquals(
        result.components.sleep,
        expectedScore,
        0.01,
        `Garmin score ${garminScore} should scale to ${expectedScore.toFixed(2)}`
      );
    }
  });

  it("should preserve relative differences", () => {
    // Test that differences are preserved proportionally
    const scorePairs = [
      { score1: 60, score2: 80 },
      { score1: 40, score2: 60 },
      { score1: 70, score2: 90 },
      { score1: 85, score2: 95 }
    ];
    
    for (const pair of scorePairs) {
      const input1 = createTestDataWithSleep(pair.score1, 8);
      const input2 = createTestDataWithSleep(pair.score2, 8);
      
      const result1 = calculator.calculate(input1);
      const result2 = calculator.calculate(input2);
      
      // Calculate relative difference
      const garminDiff = pair.score2 - pair.score1;
      const garminRelativeDiff = garminDiff / 100;
      
      const ucrDiff = result2.components.sleep - result1.components.sleep;
      const expectedUcrDiff = garminRelativeDiff * config.scoreWeights.sleep;
      
      assertAlmostEquals(
        ucrDiff,
        expectedUcrDiff,
        0.01,
        `Relative difference should be preserved: ${garminDiff}% Garmin = ${expectedUcrDiff.toFixed(2)} UCR points`
      );
    }
  });

  it("should handle sleep hour constraints", () => {
    // Test minimum sleep hours threshold
    const minHours = config.sleep.minHours;
    
    // Below minimum hours should yield 0
    if (minHours > 0) {
      const belowMinInput = createTestDataWithSleep(80, minHours - 0.5);
      const belowMinResult = calculator.calculate(belowMinInput);
      
      assertEquals(
        belowMinResult.components.sleep,
        0,
        `Sleep score should be 0 when sleep hours (${minHours - 0.5}) are below minimum (${minHours})`
      );
    }
    
    // At or above minimum should use normal scaling
    const atMinInput = createTestDataWithSleep(80, minHours);
    const atMinResult = calculator.calculate(atMinInput);
    
    const expectedScore = (80 / 100) * config.scoreWeights.sleep;
    assertAlmostEquals(
      atMinResult.components.sleep,
      expectedScore,
      0.01,
      `Sleep score should scale normally at minimum hours (${minHours})`
    );
  });

  it("should handle missing data appropriately", () => {
    // Test with no sleep data
    const noDataInput = createTestDataWithSleep(0, 0);
    const noDataResult = calculator.calculate(noDataInput);
    
    // Should return default value (50% of max)
    const expectedDefault = config.scoreWeights.sleep * 0.5;
    assertAlmostEquals(
      noDataResult.components.sleep,
      expectedDefault,
      0.01,
      `Should return default value when both sleep score and hours are 0`
    );
    
    // Test with sleep score but no hours
    const scoreOnlyInput = createTestDataWithSleep(75, undefined);
    const scoreOnlyResult = calculator.calculate(scoreOnlyInput);
    
    // Should still scale normally when hours are not provided
    const expectedScoreOnly = (75 / 100) * config.scoreWeights.sleep;
    assertAlmostEquals(
      scoreOnlyResult.components.sleep,
      expectedScoreOnly,
      0.01,
      `Should scale normally when only sleep score is provided`
    );
    
    // Test with hours but no score
    const hoursOnlyInput = createTestDataWithSleep(0, 7.5);
    const hoursOnlyResult = calculator.calculate(hoursOnlyInput);
    
    // With valid hours but 0 score, should return 0
    assertEquals(
      hoursOnlyResult.components.sleep,
      0,
      `Should return 0 when sleep score is 0 but hours are valid`
    );
  });

  it("should validate edge cases", () => {
    // Test boundary values
    const edgeCases = [
      { score: 0, hours: 8, description: "Zero sleep score" },
      { score: 100, hours: 8, description: "Perfect sleep score" },
      { score: 50, hours: 0, description: "No sleep hours recorded" },
      { score: -10, hours: 8, description: "Negative sleep score" },
      { score: 150, hours: 8, description: "Over 100 sleep score" }
    ];
    
    for (const testCase of edgeCases) {
      const input = createTestDataWithSleep(testCase.score, testCase.hours);
      const result = calculator.calculate(input);
      
      // Verify result is within valid range
      assertEquals(
        result.components.sleep >= 0,
        true,
        `Sleep score should be non-negative for ${testCase.description}`
      );
      
      assertEquals(
        result.components.sleep <= config.scoreWeights.sleep,
        true,
        `Sleep score should not exceed maximum for ${testCase.description}`
      );
      
      // Specific validations
      if (testCase.score < 0) {
        assertEquals(
          result.components.sleep,
          0,
          `Negative Garmin scores should yield 0`
        );
      }
      
      if (testCase.score > 100) {
        assertEquals(
          result.components.sleep,
          config.scoreWeights.sleep,
          `Scores over 100 should be capped at maximum`
        );
      }
    }
  });

  it("should demonstrate linear relationship", () => {
    // Test multiple points to verify linearity
    const testPoints = [];
    for (let i = 0; i <= 100; i += 10) {
      testPoints.push(i);
    }
    
    const results: { garmin: number; ucr: number }[] = [];
    
    for (const garminScore of testPoints) {
      const input = createTestDataWithSleep(garminScore, 8);
      const result = calculator.calculate(input);
      results.push({
        garmin: garminScore,
        ucr: result.components.sleep
      });
    }
    
    // Verify constant ratio (linear relationship)
    for (let i = 1; i < results.length; i++) {
      const ratio1 = results[i - 1].ucr / (results[i - 1].garmin || 1);
      const ratio2 = results[i].ucr / (results[i].garmin || 1);
      
      // Skip division by zero case
      if (results[i - 1].garmin > 0 && results[i].garmin > 0) {
        assertAlmostEquals(
          ratio1,
          ratio2,
          0.001,
          `Ratio should be constant (linear): ${ratio1.toFixed(3)} ≈ ${ratio2.toFixed(3)}`
        );
      }
    }
  });

  it("should work with custom configurations", () => {
    // Test with different sleep weight configurations
    const customWeights = [10, 15, 25, 30];
    
    for (const sleepWeight of customWeights) {
      const customConfig = {
        scoreWeights: {
          hrv: 40,
          rhr: 20,
          sleep: sleepWeight,
          subjective: 100 - 60 - sleepWeight
        }
      };
      
      const customCalculator = new UCRCalculator(customConfig);
      const customCalcConfig = customCalculator.getConfig();
      
      // Test at 75% sleep score
      const input = createTestDataWithSleep(75, 8);
      const result = customCalculator.calculate(input);
      
      const expectedScore = (75 / 100) * sleepWeight;
      
      assertAlmostEquals(
        result.components.sleep,
        expectedScore,
        0.01,
        `Should scale correctly with custom weight=${sleepWeight}`
      );
    }
  });

  it("should handle sleep hours edge cases", () => {
    // Test various sleep hour scenarios
    const sleepHourTests = [
      { hours: 0, score: 80, description: "No sleep" },
      { hours: 3, score: 60, description: "Very short sleep" },
      { hours: 5, score: 70, description: "Short sleep" },
      { hours: 7.5, score: 85, description: "Normal sleep" },
      { hours: 9, score: 90, description: "Long sleep" },
      { hours: 12, score: 95, description: "Very long sleep" }
    ];
    
    for (const test of sleepHourTests) {
      const input = createTestDataWithSleep(test.score, test.hours);
      const result = calculator.calculate(input);
      
      if (test.hours < config.sleep.minHours && test.hours > 0) {
        assertEquals(
          result.components.sleep,
          0,
          `Should yield 0 for ${test.description} (${test.hours}h < ${config.sleep.minHours}h minimum)`
        );
      } else if (test.hours === 0 && test.score === 0) {
        // No data case
        assertAlmostEquals(
          result.components.sleep,
          config.scoreWeights.sleep * 0.5,
          0.01,
          `Should return default for no data`
        );
      } else {
        // Normal scaling
        const expectedScore = (test.score / 100) * config.scoreWeights.sleep;
        assertAlmostEquals(
          result.components.sleep,
          expectedScore,
          0.01,
          `Should scale normally for ${test.description}`
        );
      }
    }
  });

  it("should maintain independence from other components", () => {
    // Verify sleep score is independent of HRV, RHR, Subjective
    const baseSleep = { sleepScore: 85, sleepHours: 7.5 };
    
    const variations = [
      { hrv: 30, rhr: 60, fatigue: 4, stress: 4 },
      { hrv: 60, rhr: 40, fatigue: 1, stress: 1 },
      { hrv: 45, rhr: 50, fatigue: 2, stress: 2 }
    ];
    
    const sleepScores: number[] = [];
    
    for (const variation of variations) {
      const input = createTestDataWithSleep(baseSleep.sleepScore, baseSleep.sleepHours);
      input.current = { ...input.current, ...variation };
      
      const result = calculator.calculate(input);
      sleepScores.push(result.components.sleep);
    }
    
    // All sleep scores should be identical
    const firstScore = sleepScores[0];
    for (const score of sleepScores) {
      assertEquals(
        score,
        firstScore,
        `Sleep score should be independent of other metrics`
      );
    }
  });

  it("should demonstrate scaling formula", () => {
    // Verify exact formula: (garminScore / 100) * maxScore
    const testCases = [
      { garmin: 0, expectedRatio: 0 },
      { garmin: 20, expectedRatio: 0.2 },
      { garmin: 40, expectedRatio: 0.4 },
      { garmin: 60, expectedRatio: 0.6 },
      { garmin: 80, expectedRatio: 0.8 },
      { garmin: 100, expectedRatio: 1.0 }
    ];
    
    for (const test of testCases) {
      const input = createTestDataWithSleep(test.garmin, 8);
      const result = calculator.calculate(input);
      
      const expectedScore = test.expectedRatio * config.scoreWeights.sleep;
      
      assertAlmostEquals(
        result.components.sleep,
        expectedScore,
        0.001,
        `Garmin ${test.garmin} should yield ${test.expectedRatio * 100}% of max (${expectedScore.toFixed(2)})`
      );
    }
  });
});