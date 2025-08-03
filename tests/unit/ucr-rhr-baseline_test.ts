/**
 * RHR Baseline and Slope Validation Tests
 * 
 * Purpose: Verify RHR linear function baseline and slope design
 * Tests linear scoring function and clipping behavior
 * 
 * Key Design Principles:
 * - Dynamic configuration reference to ensure coefficient independence
 * - Relative validation rather than absolute values
 * - Mathematical properties verification
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("RHR Baseline and Slope Validation", () => {
  let calculator: UCRCalculator;
  let config: any;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
    config = calculator.getConfig();
  });

  /**
   * Helper function to create test data with specific RHR z-score
   * RHR uses inverted z-score: -(current - mean30) / sd30
   */
  function createTestDataWithRHRZScore(targetZScore: number): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    
    // Base RHR value with realistic variation
    const baseRHR = 50;
    const sdRHR = 5; // Realistic standard deviation for RHR
    
    // Create 30-day baseline with normal distribution
    const random = seedRandom(12345); // Seeded random for consistency
    for (let i = 0; i < 30; i++) {
      const variation = normalDistribution(random) * sdRHR;
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45 + normalDistribution(random) * 5, // Add variation to HRV too
        rhr: baseRHR + variation,
        sleepScore: 80 + normalDistribution(random) * 10
      });
    }
    
    // Calculate actual mean and SD from the generated data
    const rhrValues = historicalData.map(d => d.rhr!);
    const actualMean = rhrValues.reduce((sum, v) => sum + v, 0) / rhrValues.length;
    const actualSD = Math.sqrt(
      rhrValues.reduce((sum, v) => sum + Math.pow(v - actualMean, 2), 0) / (rhrValues.length - 1)
    );
    
    // Calculate target current RHR to achieve desired z-score
    // Inverted z-score: z = -(current - mean) / sd
    // current = mean - (z * sd)
    const targetRHR = actualMean - (targetZScore * actualSD);
    
    return {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: targetRHR,
        sleepScore: 85
      },
      historical: historicalData
    };
  }
  
  // Seeded random number generator for consistent test data
  function seedRandom(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
  }
  
  // Box-Muller transform for normal distribution
  function normalDistribution(random: () => number): number {
    const u1 = random();
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Calculate expected RHR score using linear function
   * score = baseline + (z * slope), clipped to [0, max]
   */
  function calculateExpectedRHRScore(zScore: number, config: any): number {
    const { baseline, slope } = config.rhr.linear;
    const maxScore = config.scoreWeights.rhr;
    const score = baseline + (zScore * slope);
    return Math.max(0, Math.min(maxScore, score));
  }

  it("should give proportional score for average RHR", () => {
    // Test z-score = 0 (average RHR)
    const input = createTestDataWithRHRZScore(0);
    const result = calculator.calculate(input);
    
    // At z=0, score should equal baseline
    const expectedScore = config.rhr.linear.baseline;
    const tolerance = config.scoreWeights.rhr * 0.1; // 10% tolerance
    
    assertAlmostEquals(
      result.components.rhr,
      expectedScore,
      tolerance,
      `Average RHR (z=0) should yield baseline score`
    );
    
    // Verify score is reasonable (not at extremes)
    const midpoint = config.scoreWeights.rhr / 2;
    assertEquals(
      Math.abs(result.components.rhr - midpoint) < config.scoreWeights.rhr * 0.4,
      true,
      `Average RHR should yield a moderate score`
    );
  });

  it("should apply linear scaling with configured slope", () => {
    // Test multiple z-scores to verify linear relationship
    const testZScores = [-2, -1, 0, 1, 2];
    const results: { z: number, score: number, expected: number }[] = [];
    
    for (const z of testZScores) {
      const input = createTestDataWithRHRZScore(z);
      const result = calculator.calculate(input);
      const expected = calculateExpectedRHRScore(z, config);
      
      results.push({
        z,
        score: result.components.rhr,
        expected
      });
    }
    
    // Verify linear relationship
    for (let i = 1; i < results.length; i++) {
      const deltaZ = results[i].z - results[i - 1].z;
      const deltaScore = results[i].score - results[i - 1].score;
      const expectedDelta = deltaZ * config.rhr.linear.slope;
      
      // Account for clipping at boundaries
      if (results[i].score > 0 && results[i].score < config.scoreWeights.rhr &&
          results[i - 1].score > 0 && results[i - 1].score < config.scoreWeights.rhr) {
        assertAlmostEquals(
          deltaScore,
          expectedDelta,
          Math.abs(expectedDelta) * 0.2, // 20% tolerance
          `Score change should match slope * z-change`
        );
      }
    }
    
    // Verify scores match expected values
    for (const result of results) {
      assertAlmostEquals(
        result.score,
        result.expected,
        config.scoreWeights.rhr * 0.15,
        `Score at z=${result.z} should match expected linear calculation`
      );
    }
  });

  it("should clip scores within valid range", () => {
    // Test extreme z-scores to verify clipping
    const extremeTestCases = [
      { z: -3, description: "very low RHR (excellent)" },
      { z: 3, description: "very high RHR (poor)" }
    ];
    
    for (const testCase of extremeTestCases) {
      const input = createTestDataWithRHRZScore(testCase.z);
      const result = calculator.calculate(input);
      
      // Verify score is within valid range
      assertEquals(
        result.components.rhr >= 0,
        true,
        `RHR score should not be negative (${testCase.description})`
      );
      
      assertEquals(
        result.components.rhr <= config.scoreWeights.rhr,
        true,
        `RHR score should not exceed maximum (${testCase.description})`
      );
    }
    
    // Test that very good RHR (HIGH z-score due to inverted scoring) approaches maximum score
    // Note: RHR uses inverted z-score, so positive z means lower (better) RHR
    const excellentRHRInput = createTestDataWithRHRZScore(2.5);
    const excellentResult = calculator.calculate(excellentRHRInput);
    assertEquals(
      excellentResult.components.rhr > config.scoreWeights.rhr * 0.8,
      true,
      `Excellent RHR should yield high score`
    );
    
    // Test that very poor RHR (LOW z-score due to inverted scoring) approaches minimum score
    // Note: RHR uses inverted z-score, so negative z means higher (worse) RHR
    const poorRHRInput = createTestDataWithRHRZScore(-2.5);
    const poorResult = calculator.calculate(poorRHRInput);
    assertEquals(
      poorResult.components.rhr < config.scoreWeights.rhr * 0.2,
      true,
      `Poor RHR should yield low score`
    );
  });

  it("should handle inverted z-score correctly", () => {
    // RHR uses inverted z-score (lower is better)
    const betterRHR = createTestDataWithRHRZScore(1);  // z=1 means lower than average RHR
    const worseRHR = createTestDataWithRHRZScore(-1);  // z=-1 means higher than average RHR
    
    const betterResult = calculator.calculate(betterRHR);
    const worseResult = calculator.calculate(worseRHR);
    
    assertEquals(
      betterResult.components.rhr > worseResult.components.rhr,
      true,
      `Lower RHR should yield higher score (inverted relationship)`
    );
  });

  it("should scale properly with custom configurations", () => {
    // Test with different baseline and slope configurations
    const customConfigs = [
      { rhr: { linear: { baseline: 10, slope: 8 }, baselineDays: 30, thresholdSd: 2 } },
      { rhr: { linear: { baseline: 16, slope: 4 }, baselineDays: 30, thresholdSd: 2 } },
      { rhr: { linear: { baseline: 12, slope: 10 }, baselineDays: 30, thresholdSd: 2 } }
    ];
    
    for (const customConfig of customConfigs) {
      const customCalculator = new UCRCalculator(customConfig);
      const customCalcConfig = customCalculator.getConfig();
      
      // Test at multiple z-scores
      const testZScores = [-1, 0, 1];
      
      for (const z of testZScores) {
        const input = createTestDataWithRHRZScore(z);
        const result = customCalculator.calculate(input);
        
        const expectedScore = calculateExpectedRHRScore(z, customCalcConfig);
        const tolerance = customCalcConfig.scoreWeights.rhr * 0.15;
        
        assertAlmostEquals(
          result.components.rhr,
          expectedScore,
          tolerance,
          `Custom config should produce expected score at z=${z}`
        );
      }
    }
  });

  it("should demonstrate baseline effect", () => {
    // Compare different baseline values with same slope
    const lowBaseline = { rhr: { linear: { baseline: 10, slope: 6 }, baselineDays: 30, thresholdSd: 2 } };
    const highBaseline = { rhr: { linear: { baseline: 16, slope: 6 }, baselineDays: 30, thresholdSd: 2 } };
    
    const lowCalculator = new UCRCalculator(lowBaseline);
    const highCalculator = new UCRCalculator(highBaseline);
    
    // Test at z=0 (average)
    const input = createTestDataWithRHRZScore(0);
    
    const lowResult = lowCalculator.calculate(input);
    const highResult = highCalculator.calculate(input);
    
    // At z=0, difference should equal baseline difference
    const actualDiff = highResult.components.rhr - lowResult.components.rhr;
    const expectedDiff = 16 - 10;
    
    assertAlmostEquals(
      actualDiff,
      expectedDiff,
      1,
      `Baseline difference should be reflected in scores at z=0`
    );
  });

  it("should demonstrate slope effect", () => {
    // Compare different slopes with same baseline
    const gentleSlope = { rhr: { linear: { baseline: 14, slope: 4 }, baselineDays: 30, thresholdSd: 2 } };
    const steepSlope = { rhr: { linear: { baseline: 14, slope: 8 }, baselineDays: 30, thresholdSd: 2 } };
    
    const gentleCalculator = new UCRCalculator(gentleSlope);
    const steepCalculator = new UCRCalculator(steepSlope);
    
    // Test at z=1 (better than average)
    const input = createTestDataWithRHRZScore(1);
    
    const gentleResult = gentleCalculator.calculate(input);
    const steepResult = steepCalculator.calculate(input);
    
    // Steeper slope should produce larger change from baseline
    const gentleChange = gentleResult.components.rhr - 14;
    const steepChange = steepResult.components.rhr - 14;
    
    assertEquals(
      Math.abs(steepChange) > Math.abs(gentleChange),
      true,
      `Steeper slope should produce larger deviation from baseline`
    );
    
    // Verify the ratio matches slope ratio
    const changeRatio = Math.abs(steepChange / gentleChange);
    const slopeRatio = 8 / 4;
    
    assertAlmostEquals(
      changeRatio,
      slopeRatio,
      1.0, // Increased tolerance to account for clipping effects
      `Change ratio should approximately match slope ratio`
    );
  });

  it("should validate linear function properties", () => {
    // Test mathematical properties of linear function
    const zScores = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
    const scores: number[] = [];
    
    for (const z of zScores) {
      const input = createTestDataWithRHRZScore(z);
      const result = calculator.calculate(input);
      scores.push(result.components.rhr);
    }
    
    // Check for consistent differences (within unclipped range)
    const middleIndex = Math.floor(scores.length / 2);
    const unclippedIndices = [];
    
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > 0 && scores[i] < config.scoreWeights.rhr) {
        unclippedIndices.push(i);
      }
    }
    
    // For unclipped values, verify linear relationship
    if (unclippedIndices.length >= 2) {
      const i1 = unclippedIndices[0];
      const i2 = unclippedIndices[unclippedIndices.length - 1];
      
      const actualSlope = (scores[i2] - scores[i1]) / (zScores[i2] - zScores[i1]);
      const expectedSlope = config.rhr.linear.slope;
      
      assertAlmostEquals(
        actualSlope,
        expectedSlope,
        Math.abs(expectedSlope) * 0.2,
        `Measured slope should match configured slope`
      );
    }
  });

  it("should handle edge cases gracefully", () => {
    // Test with minimal historical data
    const minimalHistory: WellnessData[] = [
      { date: "2025-08-29", hrv: 45, rhr: 50, sleepScore: 80 },
      { date: "2025-08-28", hrv: 44, rhr: 51, sleepScore: 82 },
      { date: "2025-08-27", hrv: 46, rhr: 49, sleepScore: 78 }
    ];
    
    const minimalInput: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: minimalHistory
    };
    
    const result = calculator.calculate(minimalInput);
    
    // Should still produce valid score
    assertEquals(
      result.components.rhr >= 0 && result.components.rhr <= config.scoreWeights.rhr,
      true,
      `Should handle minimal data gracefully`
    );
    
    // Test with extreme RHR values
    const extremeInput = createTestDataWithRHRZScore(0);
    extremeInput.current.rhr = 35; // Unusually low RHR
    
    const extremeResult = calculator.calculate(extremeInput);
    
    assertEquals(
      extremeResult.components.rhr >= 0 && extremeResult.components.rhr <= config.scoreWeights.rhr,
      true,
      `Should handle extreme RHR values`
    );
  });
});