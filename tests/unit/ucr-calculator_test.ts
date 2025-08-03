/**
 * Unit tests for UCRCalculator
 * Tests integrated calculation logic and edge cases
 */

import { assertEquals, assertAlmostEquals, assertThrows } from "std/assert/mod.ts";
import { describe, it, beforeEach } from "std/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";
import { 
  assertUCRScore, 
  TestDataValidator,
  PerformanceTimer 
} from "../helpers/test-setup.ts";

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
      assertEquals(typeof sorenessResult.modifiers.muscleSoreness, "number", "Should track soreness modifier");
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
      assertEquals(typeof injuryResult.modifiers.injury, "number", "Should track injury modifier");
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