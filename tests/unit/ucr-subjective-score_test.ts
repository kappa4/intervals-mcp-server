/**
 * Subjective Score Calculation Tests
 * 
 * Purpose: Verify wellness data averaging and normalization
 * Tests the conversion from intervals.icu scale to internal scale and score calculation
 * 
 * Key Design Principles:
 * - Dynamic configuration reference to ensure coefficient independence
 * - Tests mathematical properties rather than specific values
 * - Validates scale conversions and averaging logic
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Subjective Score Calculation", () => {
  let calculator: UCRCalculator;
  let config: any;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
    config = calculator.getConfig();
  });

  /**
   * Create test data with specific wellness values
   */
  function createTestDataWithWellness(wellnessData: Partial<WellnessData>): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    
    // Create minimal historical data
    for (let i = 0; i < 30; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      });
    }
    
    const currentDate = "2025-08-30";
    const current: WellnessData = {
      date: currentDate,
      hrv: 45,
      rhr: 50,
      sleepScore: 80,
      ...wellnessData
    };
    
    return {
      current,
      historical: historicalData
    };
  }

  it("should correctly average wellness inputs", () => {
    // Test with multiple wellness inputs
    const testCases = [
      {
        wellness: { fatigue: 2, stress: 2 }, // Both "Good" (icu value 2 -> internal 4)
        description: "Both fatigue and stress good"
      },
      {
        wellness: { fatigue: 1, stress: 3 }, // Fresh (5) and Moderate stress (2)
        description: "Fresh but moderate stress"
      },
      {
        wellness: { fatigue: 3, stress: 3 }, // Both moderate (icu 3 -> internal 2)
        description: "Both moderate"
      },
      {
        wellness: { fatigue: 1, stress: 1 }, // Both excellent (icu 1 -> internal 5)
        description: "Both excellent"
      }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithWellness(testCase.wellness);
      const result = calculator.calculate(input, { includeDebugInfo: true });
      
      // Calculate expected average
      // intervals.icu to internal conversion:
      // fatigue/stress: 1->5, 2->4, 3->2, 4->1
      const fatigueInternal = testCase.wellness.fatigue === 1 ? 5 :
                             testCase.wellness.fatigue === 2 ? 4 :
                             testCase.wellness.fatigue === 3 ? 2 : 1;
      const stressInternal = testCase.wellness.stress === 1 ? 5 :
                            testCase.wellness.stress === 2 ? 4 :
                            testCase.wellness.stress === 3 ? 2 : 1;
      
      const expectedAverage = (fatigueInternal + stressInternal) / 2;
      const expectedScore = ((expectedAverage - 1) / 4) * config.scoreWeights.subjective;
      
      assertAlmostEquals(
        result.components.subjective,
        expectedScore,
        config.scoreWeights.subjective * 0.1,
        `Should correctly average for ${testCase.description}`
      );
    }
  });

  it("should normalize scores to 0-20 range", () => {
    // Test normalization formula: (Avg-1)/(MaxScale-1)*20
    // where MaxScale = 5 (internal scale 1-5)
    // Note: Subjective score uses average of fatigue and stress
    const testCases = [
      { fatigue: 4, stress: 4, description: "Both worst", expectedInternal: 1 },
      { fatigue: 3, stress: 3, description: "Both moderate", expectedInternal: 2 },
      { fatigue: 2, stress: 2, description: "Both good", expectedInternal: 4 },
      { fatigue: 1, stress: 1, description: "Both best", expectedInternal: 5 }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithWellness({ 
        fatigue: testCase.fatigue,
        stress: testCase.stress 
      });
      const result = calculator.calculate(input);
      
      const expectedScore = ((testCase.expectedInternal - 1) / 4) * config.scoreWeights.subjective;
      
      assertAlmostEquals(
        result.components.subjective,
        expectedScore,
        config.scoreWeights.subjective * 0.15, // Allow 15% tolerance
        `${testCase.description} should yield correct score`
      );
    }
  });

  it("should handle missing wellness data gracefully", () => {
    // Test various missing data scenarios
    const testCases = [
      {
        wellness: {},
        description: "All wellness data missing"
      },
      {
        wellness: { fatigue: 2 },
        description: "Only fatigue provided"
      },
      {
        wellness: { stress: 2 },
        description: "Only stress provided"
      },
      {
        wellness: { fatigue: undefined, stress: 2 },
        description: "Fatigue explicitly undefined"
      }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithWellness(testCase.wellness);
      const result = calculator.calculate(input);
      
      // Verify score is within valid range
      assertEquals(
        result.components.subjective >= 0,
        true,
        `Score should be non-negative for ${testCase.description}`
      );
      
      assertEquals(
        result.components.subjective <= config.scoreWeights.subjective,
        true,
        `Score should not exceed maximum for ${testCase.description}`
      );
      
      // When all data is missing, check against actual default behavior
      // UCRCalculator uses DEFAULT_WELLNESS_VALUES which are typically 4-5 (good values)
      if (Object.keys(testCase.wellness).length === 0) {
        // Default values are around 4 (good), which maps to 75% score
        assertEquals(
          result.components.subjective >= config.scoreWeights.subjective * 0.6,
          true,
          `Should return reasonable default when all data missing`
        );
      }
    }
  });

  it("should correctly map intervals.icu scale to internal scale", () => {
    // Test the conversion mapping with both fatigue and stress
    // intervals.icu: 1=best, 4=worst
    // internal: 1=worst, 5=best
    const conversionTests = [
      { fatigue: 1, stress: 1, expectedAvg: 5 },     // Both best
      { fatigue: 2, stress: 2, expectedAvg: 4 },     // Both good
      { fatigue: 3, stress: 3, expectedAvg: 2 },     // Both moderate
      { fatigue: 4, stress: 4, expectedAvg: 1 },     // Both worst
      { fatigue: 1, stress: 4, expectedAvg: 3 },     // Mixed: best + worst
      { fatigue: 2, stress: 3, expectedAvg: 3 }      // Mixed: good + moderate = (4+2)/2=3
    ];
    
    for (const test of conversionTests) {
      const input = createTestDataWithWellness({
        fatigue: test.fatigue,
        stress: test.stress
      });
      const result = calculator.calculate(input);
      
      // Calculate expected score based on internal average
      const expectedScore = ((test.expectedAvg - 1) / 4) * config.scoreWeights.subjective;
      
      assertAlmostEquals(
        result.components.subjective,
        expectedScore,
        config.scoreWeights.subjective * 0.15,
        `fatigue=${test.fatigue}, stress=${test.stress} should average to ${test.expectedAvg}`
      );
    }
  });

  it("should handle different combinations of wellness fields", () => {
    // Test with soreness and motivation (not used in subjective score)
    const testCases = [
      {
        wellness: { soreness: 1, motivation: 1 },
        description: "Only soreness and motivation (not used)"
      },
      {
        wellness: { fatigue: 2, soreness: 3, motivation: 2 },
        description: "Mixed fields (only fatigue used)"
      },
      {
        wellness: { fatigue: 2, stress: 2, injury: 1 },
        description: "All scoring fields plus injury"
      }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithWellness(testCase.wellness);
      const result = calculator.calculate(input);
      
      // When only non-scoring fields are provided, defaults are used for fatigue/stress
      // Default values are typically 4 (good), yielding ~75% score
      if (!testCase.wellness.fatigue && !testCase.wellness.stress) {
        assertEquals(
          result.components.subjective >= config.scoreWeights.subjective * 0.6,
          true,
          `Should use defaults for ${testCase.description}`
        );
      } else {
        // Otherwise verify score is in valid range
        assertEquals(
          result.components.subjective >= 0 && 
          result.components.subjective <= config.scoreWeights.subjective,
          true,
          `Should handle ${testCase.description}`
        );
      }
    }
  });

  it("should maintain score proportions with different configurations", () => {
    // Test with different subjective weight configurations
    const customWeights = [10, 20, 30]; // Different subjective max scores
    
    for (const subjectiveWeight of customWeights) {
      const customConfig = {
        scoreWeights: {
          hrv: 40,
          rhr: 20,
          sleep: 20,
          subjective: subjectiveWeight
        }
      };
      
      const customCalculator = new UCRCalculator(customConfig);
      const customCalcConfig = customCalculator.getConfig();
      
      // Test with good wellness values
      const input = createTestDataWithWellness({ fatigue: 2, stress: 2 }); // Both good (4)
      const result = customCalculator.calculate(input);
      
      // Expected: average of 4, normalized to (4-1)/4 = 0.75 of max
      const expectedScore = 0.75 * subjectiveWeight;
      
      assertAlmostEquals(
        result.components.subjective,
        expectedScore,
        subjectiveWeight * 0.1,
        `Should scale correctly with weight=${subjectiveWeight}`
      );
    }
  });

  it("should validate formula consistency", () => {
    // Test the exact formula: ((average - 1) / 4) * maxScore
    const testData = [
      { fatigue: 1, stress: 1 }, // Both 5 -> avg 5
      { fatigue: 2, stress: 2 }, // Both 4 -> avg 4
      { fatigue: 3, stress: 3 }, // Both 2 -> avg 2
      { fatigue: 4, stress: 4 }, // Both 1 -> avg 1
      { fatigue: 1, stress: 4 }, // 5 and 1 -> avg 3
      { fatigue: 2, stress: 3 }  // 4 and 2 -> avg 3
    ];
    
    for (const wellness of testData) {
      const input = createTestDataWithWellness(wellness);
      const result = calculator.calculate(input);
      
      // Calculate expected manually
      const fatigueInternal = wellness.fatigue === 1 ? 5 :
                             wellness.fatigue === 2 ? 4 :
                             wellness.fatigue === 3 ? 2 : 1;
      const stressInternal = wellness.stress === 1 ? 5 :
                            wellness.stress === 2 ? 4 :
                            wellness.stress === 3 ? 2 : 1;
      
      const average = (fatigueInternal + stressInternal) / 2;
      const normalized = (average - 1) / 4; // Maps 1-5 to 0-1
      const expectedScore = normalized * config.scoreWeights.subjective;
      
      assertAlmostEquals(
        result.components.subjective,
        expectedScore,
        0.01,
        `Formula should be exact for fatigue=${wellness.fatigue}, stress=${wellness.stress}`
      );
    }
  });

  it("should handle edge cases", () => {
    // Test with null values
    const nullInput = createTestDataWithWellness({ 
      fatigue: null as any,
      stress: null as any 
    });
    const nullResult = calculator.calculate(nullInput);
    
    // Should treat null as missing data and use defaults
    // Default values result in ~75% score
    assertEquals(
      nullResult.components.subjective >= config.scoreWeights.subjective * 0.6,
      true,
      `Should handle null values with defaults`
    );
    
    // Test with out-of-range values
    const outOfRangeInput = createTestDataWithWellness({ 
      fatigue: 5 as any,  // Invalid icu value
      stress: 0 as any    // Invalid icu value
    });
    const outOfRangeResult = calculator.calculate(outOfRangeInput);
    
    // Should handle gracefully (map to default)
    assertEquals(
      outOfRangeResult.components.subjective >= 0,
      true,
      `Should handle out-of-range values gracefully`
    );
  });

  it("should demonstrate independence from other components", () => {
    // Verify subjective score is independent of HRV, RHR, Sleep
    const baseWellness = { fatigue: 2, stress: 2 };
    
    const variations = [
      { hrv: 30, rhr: 60, sleepScore: 50 },
      { hrv: 60, rhr: 40, sleepScore: 90 },
      { hrv: 45, rhr: 50, sleepScore: 70 }
    ];
    
    const subjectiveScores: number[] = [];
    
    for (const variation of variations) {
      const input = createTestDataWithWellness({ ...baseWellness, ...variation });
      const result = calculator.calculate(input);
      subjectiveScores.push(result.components.subjective);
    }
    
    // All subjective scores should be identical
    const firstScore = subjectiveScores[0];
    for (const score of subjectiveScores) {
      assertEquals(
        score,
        firstScore,
        `Subjective score should be independent of other metrics`
      );
    }
  });
});