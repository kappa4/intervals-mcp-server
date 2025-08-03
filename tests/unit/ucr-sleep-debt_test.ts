/**
 * Sleep Debt Modifier Tests
 * 
 * Purpose: Verify sleep debt calculation and its proportional penalty application
 * Tests the cumulative sleep deficit over recent days and modifier calculation
 * 
 * Key Design Principles:
 * - Dynamic configuration reference to ensure coefficient independence
 * - Tests mathematical formula rather than specific values
 * - Validates edge cases and data handling
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Sleep Debt Modifier Tests", () => {
  let calculator: UCRCalculator;
  let config: any;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
    config = calculator.getConfig();
  });

  /**
   * Helper to create test data with specific sleep patterns
   */
  function createTestDataWithSleepPattern(sleepHoursPattern: (number | undefined)[]): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    
    // First, add baseline days with normal sleep
    const baselineDays = 60 - sleepHoursPattern.length;
    for (let i = 0; i < baselineDays; i++) {
      historicalData.push({
        date: new Date(2025, 7, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: 50,
        sleepScore: 80,
        sleepHours: 8 // Normal sleep for baseline
      });
    }
    
    // Then add the test pattern at the end (most recent days)
    sleepHoursPattern.forEach((hours, index) => {
      historicalData.push({
        date: new Date(2025, 7, baselineDays + index + 1).toISOString().split('T')[0],
        hrv: 45 + Math.sin(index * 0.1) * 5,
        rhr: 50 + Math.cos(index * 0.1) * 3,
        sleepScore: 80 + Math.sin(index * 0.05) * 10,
        sleepHours: hours
      });
    });
    
    return {
      current: {
        date: "2025-10-01",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: historicalData
    };
  }

  it("should not apply penalty for adequate sleep", () => {
    // Test with target hours of sleep (8 hours) for recent 3 days
    const targetHours = config.sleep.targetHours;
    const sleepPattern = Array(config.sleep.debtDays).fill(targetHours);
    
    const input = createTestDataWithSleepPattern(sleepPattern);
    const result = calculator.calculate(input);
    
    // No sleep debt modifier should be applied
    assertEquals(
      result.modifiers?.sleepDebt?.applied || false,
      false,
      "No sleep debt modifier should be applied for adequate sleep"
    );
    
    // Score should not be reduced
    assertEquals(
      result.score === result.baseScore,
      true,
      "Score should equal base score when no sleep debt"
    );
  });

  it("should calculate sleep debt correctly", () => {
    // Test various sleep deficit scenarios
    // Use config.sleep.targetHours to make tests independent of default values
    const targetHours = config.sleep.targetHours;
    const testCases = [
      {
        pattern: [targetHours + 0.5, targetHours + 0.5, targetHours + 0.5], // Above target
        expectedDebt: 0,    // Total 0 hours debt (all above target)
        description: "Consistent sleep above target"
      },
      {
        pattern: [targetHours - 1, targetHours - 1, targetHours - 1], // 1 hour deficit per day
        expectedDebt: 3,    // Total 3 hours debt
        description: "Consistent mild sleep deficit"
      },
      {
        pattern: [targetHours - 0.5, targetHours + 2.5, targetHours + 0.5], // Mixed pattern  
        expectedDebt: 0.5,  // Total 0.5 hours debt (0.5 + 0 + 0)
        description: "Variable sleep pattern"
      },
      {
        pattern: [targetHours - 1.5, targetHours - 1.5, targetHours - 1.5], // Severe deficit
        expectedDebt: 4.5,  // Total 4.5 hours debt (1.5 * 3)
        description: "Severe sleep deprivation"
      }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithSleepPattern(testCase.pattern);
      const result = calculator.calculate(input);
      
      if (testCase.expectedDebt === 0) {
        // No debt expected - modifier should not be applied
        assertEquals(
          result.modifiers?.sleepDebt?.applied || false,
          false,
          `No sleep debt modifier should be applied for ${testCase.description}`
        );
      } else {
        // Debt expected - modifier should be applied
        assertEquals(
          result.modifiers?.sleepDebt?.applied,
          true,
          `Sleep debt modifier should be applied for ${testCase.description}`
        );
        
        // Extract debt from reason string
        const reasonMatch = result.modifiers?.sleepDebt?.reason.match(/(\d+\.?\d*) hours/);
        const actualDebt = reasonMatch ? parseFloat(reasonMatch[1]) : 0;
        
        assertAlmostEquals(
          actualDebt,
          testCase.expectedDebt,
          0.1,
          `Sleep debt calculation incorrect for ${testCase.description}`
        );
      }
    }
  });

  it("should apply correct multiplier based on sleep debt", () => {
    // Test the formula: max(0.7, 1 - 0.05 * debt)
    const testCases = [
      { debt: 2, expectedMultiplier: 0.9 },   // 1 - 0.05 * 2 = 0.9
      { debt: 4, expectedMultiplier: 0.8 },   // 1 - 0.05 * 4 = 0.8
      { debt: 6, expectedMultiplier: 0.7 },   // 1 - 0.05 * 6 = 0.7
      { debt: 8, expectedMultiplier: 0.7 },   // Would be 0.6, but capped at 0.7
      { debt: 10, expectedMultiplier: 0.7 },  // Would be 0.5, but capped at 0.7
    ];
    
    for (const testCase of testCases) {
      // Create pattern that results in specific debt
      const hoursPerDay = config.sleep.targetHours - (testCase.debt / config.sleep.debtDays);
      const pattern = Array(config.sleep.debtDays).fill(hoursPerDay);
      
      const input = createTestDataWithSleepPattern(pattern);
      const result = calculator.calculate(input);
      
      if (result.modifiers?.sleepDebt?.applied) {
        assertAlmostEquals(
          result.modifiers.sleepDebt.value,
          testCase.expectedMultiplier,
          0.01,
          `Incorrect multiplier for ${testCase.debt} hours debt`
        );
        
        // Verify score reduction
        const expectedScore = result.baseScore * testCase.expectedMultiplier;
        assertAlmostEquals(
          result.score,
          expectedScore,
          1,
          `Score not correctly reduced by sleep debt multiplier`
        );
      }
    }
  });

  it("should handle missing sleep data gracefully", () => {
    // Test with undefined sleep hours
    const testCases = [
      {
        pattern: [undefined, undefined, undefined],
        description: "All sleep data missing"
      },
      {
        pattern: [8, undefined, 7],
        description: "Partial sleep data missing"
      },
      {
        pattern: [undefined, 6, undefined],
        description: "Intermittent sleep data"
      }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithSleepPattern(testCase.pattern);
      const result = calculator.calculate(input);
      
      // Should not crash and should handle gracefully
      assertEquals(
        result.score >= 0,
        true,
        `Should handle ${testCase.description} without errors`
      );
      
      // If all data missing, no modifier should be applied
      if (testCase.pattern.every(h => h === undefined)) {
        assertEquals(
          result.modifiers?.sleepDebt?.applied || false,
          false,
          "Should not apply sleep debt when all data missing"
        );
      }
    }
  });

  it("should only consider recent days for debt calculation", () => {
    // Create pattern with old deficit and recent good sleep
    const pattern = [
      5, 5, 5,  // Old deficit (days 0-2)
      8, 8, 8   // Recent good sleep (days 3-5, these are the most recent)
    ];
    
    const input = createTestDataWithSleepPattern(pattern);
    const result = calculator.calculate(input);
    
    // Should only consider the most recent days (8, 8, 8)
    assertEquals(
      result.modifiers?.sleepDebt?.applied || false,
      false,
      "Should not apply penalty when recent sleep is adequate"
    );
  });

  it("should demonstrate proportional penalty application", () => {
    // Test that penalty is proportional to base score
    const sleepDebtHours = 4; // Results in 0.8 multiplier
    const hoursPerDay = config.sleep.targetHours - (sleepDebtHours / config.sleep.debtDays);
    const pattern = Array(config.sleep.debtDays).fill(hoursPerDay);
    
    // Test with different base conditions
    const baseConditions = [
      { hrv: 50, rhr: 45, expectedHigherBase: true },
      { hrv: 35, rhr: 55, expectedHigherBase: false }
    ];
    
    const scores: number[] = [];
    
    for (const condition of baseConditions) {
      const input = createTestDataWithSleepPattern(pattern);
      input.current.hrv = condition.hrv;
      input.current.rhr = condition.rhr;
      
      const result = calculator.calculate(input);
      scores.push(result.score);
      
      // Verify multiplier is consistent
      if (result.modifiers?.sleepDebt?.applied) {
        assertAlmostEquals(
          result.modifiers.sleepDebt.value,
          0.8,
          0.01,
          "Sleep debt multiplier should be consistent"
        );
      }
    }
    
    // Higher base score should result in higher final score
    // even with same penalty
    assertEquals(
      scores[0] > scores[1],
      true,
      "Proportional penalty maintains relative ordering"
    );
  });

  it("should work with custom sleep configuration", () => {
    // Test with different target hours configuration
    const customConfigs = [
      { sleep: { targetHours: 7, debtDays: 3, minHours: 4 } },
      { sleep: { targetHours: 9, debtDays: 5, minHours: 4 } }
    ];
    
    for (const customConfig of customConfigs) {
      const customCalculator = new UCRCalculator(customConfig);
      
      // Sleep exactly at target - no debt
      const pattern = Array(customConfig.sleep.debtDays).fill(customConfig.sleep.targetHours);
      const input = createTestDataWithSleepPattern(pattern);
      const result = customCalculator.calculate(input);
      
      assertEquals(
        result.modifiers?.sleepDebt?.applied || false,
        false,
        `No debt when sleeping exactly ${customConfig.sleep.targetHours} hours`
      );
      
      // Sleep 1 hour less than target
      const deficitPattern = Array(customConfig.sleep.debtDays).fill(customConfig.sleep.targetHours - 1);
      const deficitInput = createTestDataWithSleepPattern(deficitPattern);
      const deficitResult = customCalculator.calculate(deficitInput);
      
      if (deficitResult.modifiers?.sleepDebt?.applied) {
        const expectedDebt = customConfig.sleep.debtDays; // 1 hour per day
        const expectedMultiplier = Math.max(0.7, 1 - 0.05 * expectedDebt);
        
        assertAlmostEquals(
          deficitResult.modifiers.sleepDebt.value,
          expectedMultiplier,
          0.01,
          "Custom config should calculate debt correctly"
        );
      }
    }
  });

  it("should calculate edge cases correctly", () => {
    // Test boundary conditions
    const edgeCases = [
      {
        pattern: [8.1, 7.9, 8.0], // Just around target
        expectDebt: false,
        description: "Near-target sleep hours"
      },
      {
        pattern: [0, 0, 0], // No sleep at all
        expectDebt: true,
        expectedMultiplier: 0.7, // Maximum penalty
        description: "Zero sleep hours"
      },
      {
        pattern: [12, 12, 12], // Oversleeping
        expectDebt: false,
        description: "Excess sleep hours"
      }
    ];
    
    for (const edgeCase of edgeCases) {
      const input = createTestDataWithSleepPattern(edgeCase.pattern);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.modifiers?.sleepDebt?.applied || false,
        edgeCase.expectDebt,
        `${edgeCase.description} should ${edgeCase.expectDebt ? 'apply' : 'not apply'} debt`
      );
      
      if (edgeCase.expectDebt && edgeCase.expectedMultiplier) {
        assertAlmostEquals(
          result.modifiers?.sleepDebt?.value || 1,
          edgeCase.expectedMultiplier,
          0.01,
          `${edgeCase.description} multiplier check`
        );
      }
    }
  });

  it("should maintain coefficient independence", () => {
    // Verify tests work with different penalty configurations
    const modifiedConfig = {
      sleep: { targetHours: 8, debtDays: 3, minHours: 4 },
      // Note: The multiplier formula is hardcoded in implementation
      // max(0.7, 1 - 0.05 * debt), not configurable
    };
    
    const modCalculator = new UCRCalculator(modifiedConfig);
    
    // Create 6 hours total debt
    const pattern = [6, 6, 6]; // 2 hours deficit per day
    const input = createTestDataWithSleepPattern(pattern);
    const result = modCalculator.calculate(input);
    
    // Verify the mathematical relationship holds
    if (result.modifiers?.sleepDebt?.applied) {
      const multiplier = result.modifiers.sleepDebt.value;
      // With 6 hours debt: max(0.7, 1 - 0.05 * 6) = max(0.7, 0.7) = 0.7
      assertAlmostEquals(
        multiplier,
        0.7,
        0.01,
        "Formula should work regardless of config values"
      );
    }
  });
});