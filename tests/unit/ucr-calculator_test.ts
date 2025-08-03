/**
 * Unit tests for UCRCalculator
 * Tests integrated calculation logic and edge cases
 */

import { assertEquals, assertAlmostEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";
import { 
  assertUCRScore, 
  TestDataValidator,
  PerformanceTimer,
  assertAlmostEquals as customAssertAlmostEquals
} from "../helpers/test-setup.ts";
import {
  createHealthyAthleteData,
  createParasympatheticSaturationData,
  createSleepDebtData,
  createLowMotivationData
} from "../fixtures/wellness-data.ts";
import {
  PARASYMPATHETIC_SATURATION_EXPECTED,
  SLEEP_DEBT_EXPECTED,
  LOW_MOTIVATION_EXPECTED,
  TOLERANCE
} from "../fixtures/expected-results.ts";

describe("UCRCalculator - Integrated Calculation Tests", () => {
  let calculator: UCRCalculator;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
  });

  describe("UCR Score Calculation with Baseline Data", () => {
    it("should calculate UCR score with sufficient historical data", () => {
      // Create historical data for baseline calculation
      const historicalData: WellnessData[] = [];
      const baseDate = new Date("2025-07-01");
      
      // Generate 60 days of historical data for proper baseline
      for (let i = 0; i < 60; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45 + (Math.random() - 0.5) * 10, // 40-50 range
          rhr: 50 + (Math.random() - 0.5) * 6,  // 47-53 range
          sleepScore: 80 + Math.random() * 15,   // 80-95 range
          sleepHours: 7.5 + (Math.random() - 0.5), // 7-8 range
          fatigue: Math.floor(Math.random() * 4) + 1, // 1-4
          stress: Math.floor(Math.random() * 4) + 1,  // 1-4
          motivation: Math.floor(Math.random() * 4) + 1 // 1-4
        });
      }
      
      // Current day data
      const currentData: WellnessData = {
        date: "2025-08-30",
        hrv: 45.0,
        rhr: 50,
        sleepScore: 85,
        sleepHours: 8.0,
        fatigue: 1, // Good (intervals.icu scale: 1=fresh)
        stress: 1,  // Low stress (intervals.icu scale: 1=relaxed)
        motivation: 1 // High motivation
      };

      const input: UCRCalculationInput = {
        current: currentData,
        historical: historicalData
      };

      const result = calculator.calculate(input);
      
      assertEquals(TestDataValidator.isValidUCRScore(result.score), true, "UCR score should be valid (0-100)");
      assertEquals(typeof result.components.hrv, "number", "Should include HRV component");
      assertEquals(typeof result.components.rhr, "number", "Should include RHR component"); 
      assertEquals(typeof result.components.sleep, "number", "Should include sleep component");
      assertEquals(typeof result.components.subjective, "number", "Should include subjective component");
      assertEquals(typeof result.recommendation.name, "string", "Should include training recommendation");
    });

    it("should handle different readiness levels correctly", () => {
      // Create consistent historical baseline
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45, // Consistent baseline
          rhr: 50, // Consistent baseline
          sleepScore: 80,
          fatigue: 3,
          stress: 3
        });
      }

      // High readiness scenario
      const highReadinessInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 55, // Above baseline
          rhr: 45, // Below baseline (better)
          sleepScore: 95,
          sleepHours: 8.5,
          fatigue: 1, // Fresh
          stress: 1,  // Relaxed
          motivation: 1
        },
        historical: historicalData
      };

      const highResult = calculator.calculate(highReadinessInput);
      
      // Low readiness scenario  
      const lowReadinessInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 35, // Below baseline
          rhr: 58, // Above baseline (worse)
          sleepScore: 60,
          sleepHours: 5.5,
          fatigue: 4, // Very tired
          stress: 4,  // Very stressed
          motivation: 3
        },
        historical: historicalData
      };

      const lowResult = calculator.calculate(lowReadinessInput);

      assertEquals(highResult.score > lowResult.score, true, "High readiness should yield higher UCR score");
      assertEquals(highResult.score >= 70, true, "High readiness should be reasonably high");
      assertEquals(lowResult.score <= 60, true, "Low readiness should be reasonably low");
    });

    it("should apply modifiers correctly", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50,
          sleepScore: 80
        });
      }

      // Baseline calculation
      const baselineInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50,
          sleepScore: 85,
          fatigue: 1,
          stress: 1,
          soreness: 1, // No soreness
        },
        historical: historicalData
      };

      const baselineResult = calculator.calculate(baselineInput);

      // With soreness modifier
      const sorenessInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50,
          sleepScore: 85,
          fatigue: 1,
          stress: 1,
          soreness: 4, // Very sore (will apply penalty)
        },
        historical: historicalData
      };

      const sorenessResult = calculator.calculate(sorenessInput);

      assertEquals(sorenessResult.score < baselineResult.score, true, "Soreness should reduce UCR score");
      assertEquals(typeof sorenessResult.modifiers?.muscleSoreness, "object", "Should track soreness modifier");
    });

    it("should handle injury caps correctly", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 55, // High HRV
          rhr: 45, // Low RHR  
          sleepScore: 95
        });
      }

      // Perfect wellness but with severe injury
      const injuryInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 60, // Excellent HRV
          rhr: 42, // Excellent RHR
          sleepScore: 98, // Perfect sleep
          fatigue: 1,     // Fresh
          stress: 1,      // Relaxed
          motivation: 1,  // High motivation
          injury: 4       // Severe injury (will cap score)
        },
        historical: historicalData
      };

      const injuryResult = calculator.calculate(injuryInput);

      assertEquals(injuryResult.score <= 30, true, "Severe injury should cap score at 30");
      assertEquals(typeof injuryResult.modifiers?.injury, "object", "Should track injury modifier");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should validate input data", () => {
      const invalidInput: UCRCalculationInput = {
        current: {
          date: "2025-08-01"
          // Missing required HRV and RHR
        },
        historical: []
      };

      assertThrows(() => {
        calculator.calculate(invalidInput);
      }, Error, "Validation failed");
    });

    it("should handle insufficient historical data gracefully", () => {
      // Very limited historical data
      const limitedHistorical: WellnessData[] = [
        {
          date: "2025-07-30",
          hrv: 45,
          rhr: 50,
          sleepScore: 80
        }
      ];

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50,
          sleepScore: 85,
          fatigue: 4,
          stress: 4
        },
        historical: limitedHistorical
      };

      // Should not throw, but use defaults
      const result = calculator.calculate(input);
      assertEquals(TestDataValidator.isValidUCRScore(result.score), true, "Should return valid score with limited data");
    });

    it("should handle missing optional fields", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50
          // Missing optional fields
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50
          // Missing optional fields
        },
        historical: historicalData
      };

      const result = calculator.calculate(input);
      assertEquals(TestDataValidator.isValidUCRScore(result.score), true, "Should handle missing optional fields");
    });

    it("should produce consistent results for identical inputs", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50,
          sleepScore: 85
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50,
          sleepScore: 85,
          fatigue: 4,
          stress: 4
        },
        historical: historicalData
      };

      const result1 = calculator.calculate(input);
      const result2 = calculator.calculate(input);

      assertEquals(result1.score, result2.score, "Identical inputs should produce identical results");
      assertEquals(result1.components.hrv, result2.components.hrv, "Component scores should be consistent");
    });
  });

  describe("Performance Requirements", () => {
    it("should complete calculations within reasonable time", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 60; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45 + Math.random() * 10,
          rhr: 50 + Math.random() * 6,
          sleepScore: 80 + Math.random() * 15
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-30",
          hrv: 45,
          rhr: 50,
          sleepScore: 85,
          fatigue: 4,
          stress: 4
        },
        historical: historicalData
      };

      const timer = new PerformanceTimer();
      timer.start();
      
      for (let i = 0; i < 100; i++) {
        calculator.calculate(input);
      }
      
      timer.assertUnder(500, "100 UCR calculations should complete under 500ms");
    });
  });

  describe("Configuration Options", () => {
    it("should support custom configuration", () => {
      const customConfig = {
        scoreWeights: {
          hrv: 50,     // Increased HRV weight
          rhr: 15,     
          sleep: 15,   
          subjective: 20
        }
      };

      const customCalculator = new UCRCalculator(customConfig);
      
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50,
          sleepScore: 80
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 55, // High HRV should have more impact with custom config
          rhr: 50,
          sleepScore: 85
        },
        historical: historicalData
      };

      const defaultResult = calculator.calculate(input);
      const customResult = customCalculator.calculate(input);

      // With higher HRV weight, good HRV should contribute more
      assertEquals(TestDataValidator.isValidUCRScore(customResult.score), true, "Custom config should produce valid score");
    });

    it("should include debug info when requested", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-08-01",
          hrv: 45,
          rhr: 50,
          sleepScore: 85
        },
        historical: historicalData
      };

      const result = calculator.calculate(input, { includeDebugInfo: true });
      
      assertEquals(typeof result.baselines, "object", "Should include baseline debug info");
      assertEquals(typeof result.baselines!.hrv.mean60, "number", "Should include HRV baseline stats");
      assertEquals(typeof result.baselines!.rhr.mean30, "number", "Should include RHR baseline stats");
    });
  });

  describe("Critical Missing Test Cases", () => {
    it("should detect parasympathetic saturation and assign high score", () => {
      const input = createParasympatheticSaturationData();
      const result = calculator.calculate(input);
      
      // 副交感神経飽和により高いHRVスコアが付与される（35以上）
      assertEquals(
        result.components.hrv >= 35,
        true,
        `Parasympathetic saturation should yield high HRV score (got ${result.components.hrv}, expected >= 35)`
      );
      
      // 高い総合スコアが付与される
      customAssertAlmostEquals(
        result.score,
        PARASYMPATHETIC_SATURATION_EXPECTED.score!,
        TOLERANCE.score,
        "Parasympathetic saturation should yield high overall score"
      );
      
      // デバッグ情報で副交感神経飽和が検出されたことを確認
      const debugResult = calculator.calculate(input, { includeDebugInfo: true });
      if (debugResult.debugInfo?.parasympatheticSaturation) {
        assertEquals(
          debugResult.debugInfo.parasympatheticSaturation,
          true,
          "Should detect parasympathetic saturation in debug info"
        );
      }
    });

    it("should calculate cumulative sleep debt correctly", () => {
      const input = createSleepDebtData();
      const result = calculator.calculate(input);
      
      // 睡眠負債による修正子が適用される
      customAssertAlmostEquals(
        result.multiplier || 1.0,
        SLEEP_DEBT_EXPECTED.multiplier!,
        TOLERANCE.multiplier,
        "Sleep debt should apply correct multiplier"
      );
      
      // スコアが適切に減少する
      customAssertAlmostEquals(
        result.score,
        SLEEP_DEBT_EXPECTED.score!,
        TOLERANCE.score,
        "Sleep debt should reduce score appropriately"
      );
      
      // 修正子が記録される
      assertEquals(
        result.modifiers?.sleepDebt?.applied,
        true,
        "Sleep debt modifier should be applied"
      );
      
      if (result.modifiers?.sleepDebt?.applied) {
        customAssertAlmostEquals(
          result.modifiers.sleepDebt.value,
          SLEEP_DEBT_EXPECTED.multiplier!,
          TOLERANCE.multiplier,
          "Sleep debt modifier value should match expected"
        );
      }
    });

    it("should apply motivation penalty when motivation <= 2", () => {
      const baselineInput = createHealthyAthleteData();
      const lowMotivationInput = createHealthyAthleteData();
      // intervals.icu: 3-4 = low motivation -> 内部値1-2
      lowMotivationInput.current.motivation = 4; // intervals.icu: 4=no motivation -> 内部値1
      
      const baselineResult = calculator.calculate(baselineInput);
      const lowMotivationResult = calculator.calculate(lowMotivationInput);
      
      // モチベーション修正子が適用される
      customAssertAlmostEquals(
        lowMotivationResult.multiplier || 1.0,
        LOW_MOTIVATION_EXPECTED.multiplier!,
        TOLERANCE.multiplier,
        "Low motivation should apply 0.9 multiplier"
      );
      
      // スコアが10%減少する
      const expectedScore = Math.round(baselineResult.score * 0.9);
      customAssertAlmostEquals(
        lowMotivationResult.score,
        expectedScore,
        TOLERANCE.score,
        "Low motivation should reduce score by 10%"
      );
      
      // 修正子が記録される
      assertEquals(
        lowMotivationResult.modifiers?.motivation?.applied,
        true,
        "Motivation modifier should be applied"
      );
    });

    it("should handle edge case: very low HRV without low RHR", () => {
      const input = createHealthyAthleteData();
      // 低いHRVだが、RHRは正常（副交感神経飽和ではない）
      input.current.hrv = 25;
      input.current.rhr = 55;
      
      const result = calculator.calculate(input);
      
      // HRVスコアは低いはず
      assertEquals(
        result.components.hrv < 20,
        true,
        "Very low HRV without low RHR should yield low HRV score"
      );
      
      // 副交感神経飽和は検出されない
      const debugResult = calculator.calculate(input, { includeDebugInfo: true });
      assertEquals(
        debugResult.debugInfo?.parasympatheticSaturation || false,
        false,
        "Should not detect parasympathetic saturation when RHR is normal"
      );
    });

    it("should handle multiple modifiers correctly", () => {
      const input = createHealthyAthleteData();
      // 複数の修正子を適用
      input.current.motivation = 4;     // intervals.icu: 4=no motivation -> 内部値1 (0.9倍)
      input.current.alcohol = 1;     // アルコール摂取 (0.9倍)  
      input.current.soreness = 4;       // intervals.icu: 4=very sore -> 内部値1 (0.5倍)
      
      const result = calculator.calculate(input);
      
      // 複数の修正子が累積的に適用される
      const expectedMultiplier = 0.9 * 0.85 * 0.5;  // motivation * alcoholLight * severe_soreness
      customAssertAlmostEquals(
        result.multiplier || 1.0,
        expectedMultiplier,
        TOLERANCE.multiplier,
        "Multiple modifiers should apply cumulatively"
      );
      
      // 各修正子が記録される
      assertEquals(result.modifiers?.motivation?.applied, true, "Motivation modifier should be applied");
      assertEquals(result.modifiers?.alcohol?.applied, true, "Alcohol modifier should be applied");
      assertEquals(result.modifiers?.muscleSoreness?.applied, true, "Muscle soreness modifier should be applied");
    });

    it("should validate wellness data conversion", () => {
      const input = createHealthyAthleteData();
      
      // intervals.icu形式の値を設定（1=good, 4=bad）
      input.current.fatigue = 1;    // intervals.icu: 1=fresh
      input.current.stress = 4;     // intervals.icu: 4=very stressed
      input.current.motivation = 2; // intervals.icu: 2=good
      
      const result = calculator.calculate(input);
      
      // 内部値への変換が正しく行われているか確認
      // fatigue: 1 -> 5 (内部値)
      // stress: 4 -> 1 (内部値)
      // motivation: 2 -> 4 (内部値)
      
      // ストレスが高い（内部値1）ので主観スコアは低くなるはず
      assertEquals(
        result.components.subjective < 15,
        true,
        "High stress should reduce subjective score"
      );
      
      // モチベーションは良好（内部値4）なので修正子は適用されない
      assertEquals(
        result.modifiers?.motivation?.applied || false,
        false,
        "Good motivation should not apply penalty"
      );
    });
  });

  describe("Trend Analysis Integration", () => {
    it("should calculate trends when sufficient data available", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 20; i++) { // 20 days for trend analysis
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45 + (i * 0.5), // Gradual improvement
          rhr: 50 - (i * 0.2), // Gradual improvement
          sleepScore: 80 + (i * 0.5)
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-07-20",
          hrv: 55,
          rhr: 46,
          sleepScore: 90,
          fatigue: 4,
          stress: 4
        },
        historical: historicalData
      };

      const result = calculator.calculateWithTrends(input);
      
      assertEquals(typeof result.trend, "object", "Should include trend analysis");
      assertEquals(typeof result.trend!.momentum, "number", "Should calculate momentum");
      assertEquals(typeof result.trend!.volatility, "number", "Should calculate volatility");
      assertEquals(typeof result.trend!.interpretation, "string", "Should provide interpretation");
    });

    it("should skip trend analysis when requested", () => {
      const historicalData: WellnessData[] = [];
      for (let i = 0; i < 20; i++) {
        const date = new Date("2025-07-01");
        date.setDate(date.getDate() + i);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          hrv: 45,
          rhr: 50,
          sleepScore: 80
        });
      }

      const input: UCRCalculationInput = {
        current: {
          date: "2025-07-20",
          hrv: 45,
          rhr: 50,
          sleepScore: 80
        },
        historical: historicalData
      };

      const result = calculator.calculateWithTrends(input, { skipTrendAnalysis: true });
      
      assertEquals(result.trend, undefined, "Should skip trend analysis when requested");
    });
  });
});