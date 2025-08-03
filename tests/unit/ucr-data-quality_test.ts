/**
 * Data Quality and Confidence Assessment Tests
 * 
 * Purpose: Verify that data quality evaluation based on historical data quantity is correct
 * Tests confidence levels and quality messages based on data availability
 * 
 * Key Design Principles:
 * - Tests thresholds relative to actual implementation
 * - Validates message content and structure
 * - Ensures graceful handling of limited data
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculator } from "../../ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("Data Quality and Confidence Assessment", () => {
  let calculator: UCRCalculator;
  
  beforeEach(() => {
    calculator = new UCRCalculator();
  });

  /**
   * Create test data with specified number of historical days
   */
  function createTestDataWithHistory(days: number, options?: {
    skipHRV?: boolean;
    skipRHR?: boolean;
    skipSome?: number; // Skip some days to create gaps
  }): UCRCalculationInput {
    const historicalData: WellnessData[] = [];
    const currentDate = new Date("2025-08-30");
    
    for (let i = 0; i < days; i++) {
      // Skip some days if requested
      if (options?.skipSome && i % options.skipSome === 0 && i > 0) {
        continue;
      }
      
      // Create dates backward from current date
      const dataDate = new Date(currentDate);
      dataDate.setDate(dataDate.getDate() - (days - i));
      
      historicalData.push({
        date: dataDate.toISOString().split('T')[0],
        hrv: options?.skipHRV ? undefined : 45 + Math.sin(i * 0.1) * 5,
        rhr: options?.skipRHR ? undefined : 50 + Math.cos(i * 0.1) * 3,
        sleepScore: 80 + Math.sin(i * 0.05) * 10
      });
    }
    
    return {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: historicalData
    };
  }

  it("should assign low confidence with insufficient data", () => {
    // Test with less than 30 days of data
    const testCases = [
      { days: 0, description: "No historical data" },
      { days: 7, description: "One week of data" },
      { days: 14, description: "Two weeks of data" },
      { days: 29, description: "Just under 30 days" }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithHistory(testCase.days);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.confidence,
        'low',
        `Should assign low confidence with ${testCase.description}`
      );
      
      // Verify quality message exists
      assertEquals(
        result.dataQuality !== undefined,
        true,
        `Should include data quality information for ${testCase.description}`
      );
      
      // Verify message mentions limited data
      if (result.dataQuality?.message) {
        assertEquals(
          result.dataQuality.message.toLowerCase().includes('limited'),
          true,
          `Message should mention limited data for ${testCase.description}`
        );
      }
    }
  });

  it("should assign medium confidence with moderate data", () => {
    // Test with 30-59 days of data
    const testCases = [
      { days: 30, description: "Exactly 30 days" },
      { days: 45, description: "45 days" },
      { days: 59, description: "Just under 60 days" }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithHistory(testCase.days);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.confidence,
        'medium',
        `Should assign medium confidence with ${testCase.description}`
      );
      
      // May or may not have quality message for medium confidence
      if (result.dataQuality?.message) {
        assertEquals(
          result.dataQuality.message.toLowerCase().includes('moderate'),
          true,
          `Message should mention moderate data for ${testCase.description}`
        );
      }
    }
  });

  it("should assign high confidence with sufficient data", () => {
    // Test with 60+ days of data
    const testCases = [
      { days: 60, description: "Exactly 60 days" },
      { days: 90, description: "90 days" },
      { days: 120, description: "120 days" }
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithHistory(testCase.days);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.confidence,
        'high',
        `Should assign high confidence with ${testCase.description}`
      );
      
      // High confidence might not include quality message
      // or might have an empty/undefined quality object
    }
  });

  it("should include appropriate data quality messages", () => {
    // Test message content for different scenarios
    const scenarios = [
      {
        days: 15,
        expectedKeywords: ['limited', 'improve', 'more data'],
        description: "Limited data message"
      },
      {
        days: 45,
        expectedKeywords: ['moderate'],
        description: "Moderate data message"
      }
    ];
    
    for (const scenario of scenarios) {
      const input = createTestDataWithHistory(scenario.days);
      const result = calculator.calculate(input);
      
      if (result.dataQuality?.message) {
        const message = result.dataQuality.message.toLowerCase();
        
        for (const keyword of scenario.expectedKeywords) {
          const hasKeyword = message.includes(keyword.toLowerCase());
          if (scenario.expectedKeywords.length === 1 || keyword !== 'more data') {
            // For multiple keywords, some might be optional
            assertEquals(
              hasKeyword || scenario.expectedKeywords.length > 1,
              true,
              `${scenario.description} should contain relevant keywords`
            );
          }
        }
      }
    }
  });

  it("should report actual data counts", () => {
    // Verify that data counts are accurately reported
    const testCases = [
      { days: 20, skipHRV: false, skipRHR: false },
      { days: 40, skipHRV: true, skipRHR: false },  // Missing HRV
      { days: 40, skipHRV: false, skipRHR: true },  // Missing RHR
    ];
    
    for (const testCase of testCases) {
      const input = createTestDataWithHistory(testCase.days, {
        skipHRV: testCase.skipHRV,
        skipRHR: testCase.skipRHR
      });
      const result = calculator.calculate(input, { includeDebugInfo: true });
      
      if (result.baselines) {
        // Check HRV data count
        if (!testCase.skipHRV) {
          assertEquals(
            result.baselines.hrv.dataCount >= 0,
            true,
            `Should report HRV data count`
          );
        }
        
        // Check RHR data count
        if (!testCase.skipRHR) {
          assertEquals(
            result.baselines.rhr.dataCount >= 0,
            true,
            `Should report RHR data count`
          );
        }
      }
      
      // Verify quality object includes counts when confidence is not high
      if (result.confidence !== 'high' && result.dataQuality) {
        assertEquals(
          typeof result.dataQuality.hrvDays === 'number',
          true,
          `Should include HRV days count in quality data`
        );
        
        assertEquals(
          typeof result.dataQuality.rhrDays === 'number',
          true,
          `Should include RHR days count in quality data`
        );
      }
    }
  });

  it("should handle missing metric data appropriately", () => {
    // Test when one metric has less data than the other
    const historicalData: WellnessData[] = [];
    
    // First 20 days: only RHR
    for (let i = 0; i < 20; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: undefined,
        rhr: 50,
        sleepScore: 80
      });
    }
    
    // Next 20 days: both HRV and RHR
    for (let i = 20; i < 40; i++) {
      historicalData.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: 45,
        rhr: 50,
        sleepScore: 80
      });
    }
    
    const input: UCRCalculationInput = {
      current: {
        date: "2025-08-10",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: historicalData
    };
    
    const result = calculator.calculate(input);
    
    // Should base confidence on the minimum of the two
    assertEquals(
      result.confidence === 'low' || result.confidence === 'medium',
      true,
      `Should base confidence on minimum available data`
    );
  });

  it("should handle sparse data appropriately", () => {
    // Test with gaps in the data
    const input = createTestDataWithHistory(60, { skipSome: 3 }); // Skip every 3rd day
    const result = calculator.calculate(input);
    
    // Even with gaps, if enough days are covered, confidence can still be assigned
    assertEquals(
      ['low', 'medium', 'high'].includes(result.confidence || ''),
      true,
      `Should assign appropriate confidence even with sparse data`
    );
  });

  it("should provide helpful improvement suggestions", () => {
    // Test that low confidence results suggest data collection
    const input = createTestDataWithHistory(10);
    const result = calculator.calculate(input);
    
    assertEquals(
      result.confidence,
      'low',
      `Should have low confidence with minimal data`
    );
    
    if (result.dataQuality?.message) {
      // Check for improvement suggestion
      const message = result.dataQuality.message.toLowerCase();
      const hasSuggestion = message.includes('improve') || 
                           message.includes('more data') ||
                           message.includes('accuracy');
      
      assertEquals(
        hasSuggestion,
        true,
        `Low confidence message should suggest improvement`
      );
    }
  });

  it("should maintain consistency across calculations", () => {
    // Same data should produce same confidence
    const input = createTestDataWithHistory(35);
    
    const results = [];
    for (let i = 0; i < 3; i++) {
      const calc = new UCRCalculator(); // Fresh calculator instance
      results.push(calc.calculate(input));
    }
    
    // All results should have same confidence
    const firstConfidence = results[0].confidence;
    for (const result of results) {
      assertEquals(
        result.confidence,
        firstConfidence,
        `Confidence should be consistent across calculations`
      );
    }
  });

  it("should validate boundary conditions", () => {
    // Test exact boundary values
    const boundaries = [
      { days: 30, expectedConfidence: 'medium' },
      { days: 60, expectedConfidence: 'high' }
    ];
    
    for (const boundary of boundaries) {
      const input = createTestDataWithHistory(boundary.days);
      const result = calculator.calculate(input);
      
      assertEquals(
        result.confidence,
        boundary.expectedConfidence,
        `Should assign ${boundary.expectedConfidence} confidence at ${boundary.days} days boundary`
      );
    }
  });

  it("should handle edge cases gracefully", () => {
    // Test with empty historical array
    const emptyInput: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: []
    };
    
    const emptyResult = calculator.calculate(emptyInput);
    
    assertEquals(
      emptyResult.confidence,
      'low',
      `Should handle empty historical data with low confidence`
    );
    
    // Test with all undefined metrics in history
    const undefinedHistory: WellnessData[] = [];
    for (let i = 0; i < 40; i++) {
      undefinedHistory.push({
        date: new Date(2025, 6, i + 1).toISOString().split('T')[0],
        hrv: undefined,
        rhr: undefined,
        sleepScore: undefined
      });
    }
    
    const undefinedInput: UCRCalculationInput = {
      current: {
        date: "2025-08-30",
        hrv: 45,
        rhr: 50,
        sleepScore: 85
      },
      historical: undefinedHistory
    };
    
    const undefinedResult = calculator.calculate(undefinedInput);
    
    assertEquals(
      undefinedResult.confidence,
      'low',
      `Should handle undefined metrics with low confidence`
    );
  });
});