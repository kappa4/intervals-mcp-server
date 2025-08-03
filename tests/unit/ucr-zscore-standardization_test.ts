/**
 * Z-score Standardization Tests
 * 
 * Purpose: Verify statistical standardization is correctly implemented
 * Tests mean/SD calculation, logarithmic transformation, and distribution properties
 * 
 * Key Design Principles:
 * - Mathematical accuracy verification
 * - Edge case handling
 * - Transformation correctness
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Z-score Standardization", () => {
  let calculator: UCRCalculator;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
  });

  /**
   * Generate normally distributed data with specified mean and SD
   */
  function generateNormalData(mean: number, sd: number, count: number, seed: number = 12345): number[] {
    const random = seedRandom(seed);
    const data: number[] = [];
    
    for (let i = 0; i < count; i++) {
      data.push(mean + normalDistribution(random) * sd);
    }
    
    return data;
  }
  
  /**
   * Seeded random number generator
   */
  function seedRandom(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
  }
  
  /**
   * Box-Muller transform for normal distribution
   */
  function normalDistribution(random: () => number): number {
    const u1 = random();
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Calculate sample mean
   */
  function calculateMean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  
  /**
   * Calculate sample standard deviation
   */
  function calculateStdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = calculateMean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  it("should calculate correct mean and standard deviation", () => {
    // Test with known distribution
    const targetMean = 50;
    const targetSD = 5;
    const data = generateNormalData(targetMean, targetSD, 100);
    
    // Create historical data
    const historicalData: WellnessData[] = data.map((value, i) => ({
      date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
      hrv: 45,
      rhr: value,
      sleepScore: 80
    }));
    
    const input: UCRCalculationInput = {
      current: {
        date: "2025-10-10",
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      },
      historical: historicalData
    };
    
    // Calculate result with debug info
    const result = calculator.calculate(input, { includeDebugInfo: true });
    
    // Verify mean calculation
    const actualMean = calculateMean(data);
    const tolerance = 0.5; // Allow some sampling variation
    
    if (result.baselines?.rhr) {
      assertAlmostEquals(
        result.baselines.rhr.mean30,
        actualMean,
        tolerance,
        `Mean calculation should be accurate`
      );
      
      // Verify SD calculation
      const actualSD = calculateStdDev(data.slice(-30)); // Last 30 days
      assertAlmostEquals(
        result.baselines.rhr.sd30,
        actualSD,
        tolerance,
        `Standard deviation calculation should be accurate`
      );
    }
  });

  it("should handle logarithmic transformation for HRV", () => {
    // Create HRV data with known values
    const hrvValues = [30, 40, 50, 60, 70]; // Raw HRV values
    const expectedLnValues = hrvValues.map(v => Math.log(v));
    
    const historicalData: WellnessData[] = [];
    for (let i = 0; i < 60; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: hrvValues[i % hrvValues.length],
        rhr: 50,
        sleepScore: 80
      });
    }
    
    const input: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      },
      historical: historicalData
    };
    
    const result = calculator.calculate(input, { includeDebugInfo: true });
    
    if (result.baselines?.hrv) {
      // Verify that mean is calculated on ln-transformed values
      const lnValues = historicalData.map(d => Math.log(d.hrv!));
      const expectedMean = calculateMean(lnValues);
      
      assertAlmostEquals(
        result.baselines.hrv.mean60,
        expectedMean,
        0.1,
        `HRV mean should be calculated on ln-transformed values`
      );
      
      // Verify SD is also on ln-transformed values
      const expectedSD = calculateStdDev(lnValues);
      assertAlmostEquals(
        result.baselines.hrv.sd60,
        expectedSD,
        0.1,
        `HRV SD should be calculated on ln-transformed values`
      );
    }
  });

  it("should produce normalized distribution", () => {
    // Create data with known distribution
    const mean = 50;
    const sd = 10;
    const dataPoints = 60;
    
    // Generate varying HRV data
    const historicalData: WellnessData[] = [];
    for (let i = 0; i < dataPoints; i++) {
      // Create a sinusoidal pattern with noise
      const trend = Math.sin(i * 0.1) * 5;
      const noise = (Math.random() - 0.5) * 10;
      const hrv = 45 + trend + noise;
      
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: Math.max(20, hrv), // Ensure positive HRV
        rhr: mean + (Math.random() - 0.5) * sd,
        sleepScore: 80 + (Math.random() - 0.5) * 20
      });
    }
    
    // Test multiple current values to check z-score distribution
    const testValues = [mean - 2*sd, mean - sd, mean, mean + sd, mean + 2*sd];
    const zScores: number[] = [];
    
    for (const testRHR of testValues) {
      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-30",
          hrv: 45,
          rhr: testRHR,
          sleepScore: 80
        },
        historical: historicalData
      };
      
      const result = calculator.calculate(input, { includeDebugInfo: true });
      
      if (result.debugInfo?.calculations?.rhr) {
        const rhrCalc = result.debugInfo.calculations.rhr;
        if ('zScore' in rhrCalc) {
          zScores.push(rhrCalc.zScore);
        }
      }
    }
    
    // Verify z-scores follow expected pattern
    // Z-scores should roughly be -2, -1, 0, 1, 2 for our test values
    for (let i = 0; i < zScores.length; i++) {
      const expectedZ = i - 2; // -2, -1, 0, 1, 2
      
      // RHR uses inverted z-score
      const actualZ = -zScores[i];
      
      // Allow for sampling variation
      assertEquals(
        Math.abs(actualZ - expectedZ) < 1.0,
        true,
        `Z-score should approximate expected value (expected: ${expectedZ}, actual: ${actualZ.toFixed(2)})`
      );
    }
  });

  it("should handle edge cases in standardization", () => {
    // Test with minimal data
    const minimalData: WellnessData[] = [
      { date: "2025-08-29", hrv: 45, rhr: 50, sleepScore: 80 }
    ];
    
    const minimalInput: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      },
      historical: minimalData
    };
    
    // Should not throw
    const minimalResult = calculator.calculate(minimalInput);
    assertEquals(
      typeof minimalResult.score === 'number',
      true,
      `Should handle minimal data without error`
    );
    
    // Test with zero variance (all same values)
    const constantData: WellnessData[] = [];
    for (let i = 0; i < 30; i++) {
      constantData.push({
        date: new Date(2025, 7, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      });
    }
    
    const constantInput: UCRCalculationInput = {
      current: {
        date: "2025-08-31",
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      },
      historical: constantData
    };
    
    const constantResult = calculator.calculate(constantInput, { includeDebugInfo: true });
    
    // Should handle zero variance gracefully
    assertEquals(
      typeof constantResult.score === 'number',
      true,
      `Should handle zero variance data`
    );
    
    // Verify SD is handled correctly
    // When all values are identical, SD = 0, but calculateStdDev returns 0.1 as minimum
    if (constantResult.baselines?.rhr) {
      // Check if SD is either 0 (mathematical result) or 0.1 (safeguard)
      const sd = constantResult.baselines.rhr.sd30;
      assertEquals(
        sd === 0 || sd === 0.1,
        true,
        `SD should be 0 for constant data or minimum safeguard value (actual: ${sd})`
      );
    }
  });

  it("should correctly standardize different time windows", () => {
    // Create data with a trend
    const historicalData: WellnessData[] = [];
    
    // First 30 days: stable around 45
    for (let i = 0; i < 30; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45 + (Math.random() - 0.5) * 5,
        rhr: 50 + (Math.random() - 0.5) * 3,
        sleepScore: 80
      });
    }
    
    // Next 30 days: improving trend
    for (let i = 30; i < 60; i++) {
      const improvement = (i - 30) * 0.3; // Gradual improvement
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45 + improvement + (Math.random() - 0.5) * 5,
        rhr: 50 - improvement * 0.2 + (Math.random() - 0.5) * 3,
        sleepScore: 80 + improvement * 0.5
      });
    }
    
    const input: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 55,
        rhr: 48,
        sleepScore: 85
      },
      historical: historicalData
    };
    
    const result = calculator.calculate(input, { includeDebugInfo: true });
    
    if (result.baselines?.hrv) {
      // 7-day mean should be higher than 60-day mean due to improvement trend
      assertEquals(
        result.baselines.hrv.mean7 > result.baselines.hrv.mean60,
        true,
        `Recent mean should reflect improvement trend`
      );
      
      // This should result in positive HRV z-score and higher HRV component
      assertEquals(
        result.components.hrv > 20, // Above midpoint
        true,
        `Improvement trend should yield higher HRV score`
      );
    }
  });

  it("should maintain numerical stability", () => {
    // Test with extreme values
    const extremeData: WellnessData[] = [];
    
    // Mix of very high and very low values
    for (let i = 0; i < 60; i++) {
      const extreme = i % 2 === 0 ? 100 : 20; // Alternating extremes
      extremeData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: extreme,
        rhr: 50,
        sleepScore: 80
      });
    }
    
    const extremeInput: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 60,
        rhr: 50,
        sleepScore: 80
      },
      historical: extremeData
    };
    
    // Should not throw or produce NaN/Infinity
    const extremeResult = calculator.calculate(extremeInput);
    
    assertEquals(
      Number.isFinite(extremeResult.score),
      true,
      `Should maintain numerical stability with extreme values`
    );
    
    assertEquals(
      extremeResult.score >= 0 && extremeResult.score <= 100,
      true,
      `Score should remain in valid range despite extreme inputs`
    );
  });

  it("should verify z-score calculation formula", () => {
    // Create controlled data to verify formula
    const knownMean = 50;
    const knownSD = 5;
    const testValue = 55;
    const expectedZ = (testValue - knownMean) / knownSD; // Should be 1.0
    
    // Create historical data with exact distribution
    const historicalData: WellnessData[] = [];
    const values = [
      45, 45, 45, 45, 45, // 5 values at mean - SD
      50, 50, 50, 50, 50, 50, 50, 50, 50, 50, // 10 values at mean
      55, 55, 55, 55, 55  // 5 values at mean + SD
    ];
    
    // Shuffle to avoid ordering effects
    const shuffled = [...values].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < 30; i++) {
      historicalData.push({
        date: new Date(2025, 7, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: shuffled[i % shuffled.length],
        sleepScore: 80
      });
    }
    
    const input: UCRCalculationInput = {
      current: {
        date: "2025-08-31",
        hrv: 45,
        rhr: testValue,
        sleepScore: 80
      },
      historical: historicalData
    };
    
    const result = calculator.calculate(input, { includeDebugInfo: true });
    
    if (result.debugInfo?.calculations?.rhr && 'zScore' in result.debugInfo.calculations.rhr) {
      const actualZ = result.debugInfo.calculations.rhr.zScore;
      
      // RHR uses inverted z-score
      const invertedActualZ = -actualZ;
      
      // Due to sampling, we won't get exactly 1.0, but should be close
      assertAlmostEquals(
        invertedActualZ,
        expectedZ,
        0.5,
        `Z-score calculation should follow standard formula`
      );
    }
  });
});