/**
 * Motivation Modifier Tests
 * 
 * Purpose: Verify motivation modifier calculation and proportional penalty application
 * Tests low motivation detection and score reduction logic
 * 
 * Key Design Principles:
 * - Dynamic configuration reference to ensure coefficient independence
 * - Tests mathematical formula rather than specific values
 * - Validates motivation scale conversion from intervals.icu format
 * - Tests boundary conditions for motivation threshold
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Motivation Modifier Tests", () => {
  let calculator: UCRCalculator;
  let config: any;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
    config = calculator.getConfig();
  });

  /**
   * Helper to create test data with specific motivation values
   */
  function createTestDataWithMotivation(motivation: number): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    
    // Create baseline data for stable calculations
    for (let i = 0; i < 60; i++) {
      historicalData.push({
        date: new Date(2025, 7, i + 1).toISOString().split('T')[0],
        hrv: 45 + Math.sin(i * 0.1) * 5,
        rhr: 50 + Math.cos(i * 0.1) * 3,
        sleepScore: 80 + Math.sin(i * 0.05) * 10,
        sleepHours: 8
      });
    }
    
    return {
      current: {
        date: "2025-10-01",
        hrv: 45,
        rhr: 50,
        sleepScore: 85,
        motivation: motivation // intervals.icu format (1-4)
      },
      historical: historicalData
    };
  }

  it("should not apply penalty for good motivation", () => {
    // Test with good motivation levels that should not trigger penalty
    const goodMotivationLevels = [1, 2]; // intervals.icu: 1=very motivated, 2=good
    
    for (const motivationLevel of goodMotivationLevels) {
      const input = createTestDataWithMotivation(motivationLevel);
      const result = calculator.calculate(input);
      
      // No motivation modifier should be applied
      assertEquals(
        result.modifiers?.motivation?.applied || false,
        false,
        `No motivation modifier should be applied for intervals.icu motivation level ${motivationLevel}`
      );
      
      // Score should not be reduced by motivation
      assertEquals(
        result.score === result.baseScore,
        true,
        `Score should equal base score when motivation is good (level ${motivationLevel})`
      );
    }
  });

  it("should apply penalty for low motivation", () => {
    // Test with low motivation levels that should trigger penalty
    const lowMotivationLevels = [4]; // intervals.icu: 4=no motivation -> internal 1 -> penalty
    
    for (const motivationLevel of lowMotivationLevels) {
      const input = createTestDataWithMotivation(motivationLevel);
      const result = calculator.calculate(input);
      
      // Motivation modifier should be applied
      assertEquals(
        result.modifiers?.motivation?.applied,
        true,
        `Motivation modifier should be applied for intervals.icu motivation level ${motivationLevel}`
      );
      
      // Should apply the configured penalty
      const expectedMultiplier = config.penalties.motivationLow;
      assertAlmostEquals(
        result.modifiers?.motivation?.value || 1,
        expectedMultiplier,
        0.01,
        `Motivation modifier should be ${expectedMultiplier} for level ${motivationLevel}`
      );
      
      // Score should be reduced proportionally
      const expectedScore = result.baseScore * expectedMultiplier;
      assertAlmostEquals(
        result.score,
        expectedScore,
        1,
        `Score should be reduced by motivation penalty for level ${motivationLevel}`
      );
      
      // Should have appropriate reason message
      assertEquals(
        result.modifiers?.motivation?.reason,
        "Low motivation",
        "Should have correct reason message"
      );
    }
  });

  it("should convert intervals.icu motivation scale correctly", () => {
    // Test the conversion from intervals.icu scale (1-4) to internal scale (1-5)
    // Only internal values <= 2 trigger penalty
    const conversionTests = [
      { icuValue: 1, expectedInternal: 5, shouldTriggerPenalty: false }, // very motivated
      { icuValue: 2, expectedInternal: 4, shouldTriggerPenalty: false }, // good
      { icuValue: 3, expectedInternal: 3, shouldTriggerPenalty: false }, // ok (above threshold)
      { icuValue: 4, expectedInternal: 1, shouldTriggerPenalty: true }   // no motivation (triggers penalty)
    ];
    
    for (const test of conversionTests) {
      const input = createTestDataWithMotivation(test.icuValue);
      const result = calculator.calculate(input);
      
      // Debug conversion - we can't directly test internal value but can test penalty application
      if (test.shouldTriggerPenalty) {
        assertEquals(
          result.modifiers?.motivation?.applied,
          true,
          `intervals.icu motivation ${test.icuValue} should trigger penalty (internal: ${test.expectedInternal})`
        );
      } else {
        assertEquals(
          result.modifiers?.motivation?.applied || false,
          false,
          `intervals.icu motivation ${test.icuValue} should not trigger penalty (internal: ${test.expectedInternal})`
        );
      }
    }
  });

  it("should apply motivation penalty at correct threshold", () => {
    // Test boundary conditions around the threshold (internal motivation <= 2)
    // intervals.icu 2 -> internal 4 (no penalty)
    // intervals.icu 3 -> internal 3 (no penalty)
    // intervals.icu 4 -> internal 1 (penalty applied)
    
    const boundaryTests = [
      { icuValue: 2, description: "Good motivation", expectPenalty: false },
      { icuValue: 3, description: "OK motivation (above threshold)", expectPenalty: false },
      { icuValue: 4, description: "No motivation (triggers penalty)", expectPenalty: true }
    ];
    
    for (const test of boundaryTests) {
      const input = createTestDataWithMotivation(test.icuValue);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.modifiers?.motivation?.applied || false,
        test.expectPenalty,
        `${test.description} (intervals.icu ${test.icuValue}) penalty expectation`
      );
    }
  });

  it("should demonstrate proportional penalty application", () => {
    // Test that penalty is proportional to base score
    const motivationLevel = 4; // intervals.icu: no motivation
    
    // Test with different base conditions to verify proportional application
    const baseConditions = [
      { hrv: 50, rhr: 45, expectedHigherBase: true },
      { hrv: 35, rhr: 55, expectedHigherBase: false }
    ];
    
    const scores: number[] = [];
    const multipliers: number[] = [];
    
    for (const condition of baseConditions) {
      const input = createTestDataWithMotivation(motivationLevel);
      input.current.hrv = condition.hrv;
      input.current.rhr = condition.rhr;
      
      const result = calculator.calculate(input);
      scores.push(result.score);
      
      // Verify multiplier is consistent
      if (result.modifiers?.motivation?.applied) {
        multipliers.push(result.modifiers.motivation.value);
        
        // Verify proportional reduction
        const expectedScore = result.baseScore * result.modifiers.motivation.value;
        assertAlmostEquals(
          result.score,
          expectedScore,
          1,
          "Score should be proportionally reduced"
        );
      }
    }
    
    // All multipliers should be the same
    if (multipliers.length > 1) {
      for (let i = 1; i < multipliers.length; i++) {
        assertAlmostEquals(
          multipliers[i],
          multipliers[0],
          0.01,
          "Motivation multiplier should be consistent across different base scores"
        );
      }
    }
    
    // Higher base score should result in higher final score even with same penalty
    assertEquals(
      scores[0] > scores[1],
      true,
      "Proportional penalty maintains relative ordering"
    );
  });

  it("should work with custom motivation configuration", () => {
    // Test with different penalty configurations
    const baseConfig = calculator.getConfig();
    const customConfigs = [
      { 
        penalties: { 
          ...baseConfig.penalties,
          motivationLow: 0.8 
        } 
      },
      { 
        penalties: { 
          ...baseConfig.penalties,
          motivationLow: 0.95 
        } 
      }
    ];
    
    for (const customConfig of customConfigs) {
      const customCalculator = new UCRCalculator(customConfig);
      
      // Apply low motivation
      const input = createTestDataWithMotivation(4); // intervals.icu: no motivation
      const result = customCalculator.calculate(input);
      
      if (result.modifiers?.motivation?.applied) {
        assertAlmostEquals(
          result.modifiers.motivation.value,
          customConfig.penalties.motivationLow,
          0.01,
          `Custom motivation penalty ${customConfig.penalties.motivationLow} should be applied`
        );
        
        // Verify score reduction
        const expectedScore = result.baseScore * customConfig.penalties.motivationLow;
        assertAlmostEquals(
          result.score,
          expectedScore,
          1,
          "Score should be reduced by custom motivation penalty"
        );
      }
    }
  });

  it("should handle missing motivation data gracefully", () => {
    // Test with undefined motivation
    const input = createTestDataWithMotivation(1);
    delete input.current.motivation; // Remove motivation data
    
    const result = calculator.calculate(input);
    
    // Should not crash and should handle gracefully
    assertEquals(
      result.score >= 0,
      true,
      "Should handle missing motivation data without errors"
    );
    
    // No motivation modifier should be applied when data is missing
    assertEquals(
      result.modifiers?.motivation?.applied || false,
      false,
      "Should not apply motivation penalty when data is missing"
    );
  });

  it("should maintain coefficient independence", () => {
    // Verify tests work with different penalty configurations
    const baseConfig = calculator.getConfig();
    const modifiedConfig = {
      penalties: { 
        ...baseConfig.penalties,
        motivationLow: 0.85 
      }
    };
    
    const modCalculator = new UCRCalculator(modifiedConfig);
    
    // Apply low motivation
    const input = createTestDataWithMotivation(4); // intervals.icu: no motivation
    const result = modCalculator.calculate(input);
    
    // Verify the mathematical relationship holds
    if (result.modifiers?.motivation?.applied) {
      const multiplier = result.modifiers.motivation.value;
      assertAlmostEquals(
        multiplier,
        0.85,
        0.01,
        "Custom motivation penalty should be applied correctly"
      );
      
      // Verify score calculation
      const expectedScore = result.baseScore * 0.85;
      assertAlmostEquals(
        result.score,
        expectedScore,
        1,
        "Score should be calculated with custom penalty"
      );
    }
  });

  it("should interact correctly with other modifiers", () => {
    // Test motivation modifier combined with other modifiers
    const input = createTestDataWithMotivation(4); // Low motivation
    
    // Add alcohol consumption (should also apply penalty)
    input.current.alcohol = 1; // Light alcohol consumption
    
    const result = calculator.calculate(input);
    
    // Both modifiers should be applied
    assertEquals(
      result.modifiers?.motivation?.applied,
      true,
      "Motivation modifier should be applied"
    );
    
    assertEquals(
      result.modifiers?.alcohol?.applied,
      true,
      "Alcohol modifier should also be applied"
    );
    
    // Combined penalty should be applied
    const expectedMultiplier = config.penalties.motivationLow * config.penalties.alcoholLight;
    assertAlmostEquals(
      result.multiplier || 1,
      expectedMultiplier,
      0.01,
      "Combined multiplier should be product of individual penalties"
    );
    
    // Score should reflect combined penalty
    const expectedScore = result.baseScore * expectedMultiplier;
    assertAlmostEquals(
      result.score,
      expectedScore,
      1,
      "Score should reflect combined penalty effects"
    );
  });
});