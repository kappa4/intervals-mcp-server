/**
 * Debug HRV baseline calculation
 */

import { UCRCalculator } from "./ucr-calculator.ts";
import { UCRCalculationInput, WellnessData } from "./ucr-types.ts";

const calculator = new UCRCalculator();

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

// High HRV scenario
const highHRVInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 55, // Above baseline
    rhr: 45, // Below baseline (better)
    sleepScore: 95,
    sleepHours: 8.5,
    fatigue: 4, // Fresh
    stress: 4,  // Relaxed
    motivation: 4
  },
  historical: historicalData
};

const highResult = calculator.calculate(highHRVInput, { includeDebugInfo: true });

// Low HRV scenario  
const lowHRVInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 35, // Below baseline
    rhr: 58, // Above baseline (worse)
    sleepScore: 60,
    sleepHours: 5.5,
    fatigue: 1, // Very tired
    stress: 1,  // Very stressed
    motivation: 2
  },
  historical: historicalData
};

const lowResult = calculator.calculate(lowHRVInput, { includeDebugInfo: true });

console.log("High HRV Baseline Data:", highResult.baselines?.hrv);
console.log("High HRV Score:", highResult.components.hrv);

console.log("Low HRV Baseline Data:", lowResult.baselines?.hrv);
console.log("Low HRV Score:", lowResult.components.hrv);

// Test with better rolling data
const rollingData: WellnessData[] = [...historicalData];

// Add recent 7 days with different HRV patterns
for (let i = 0; i < 7; i++) {
  const date = new Date("2025-07-25");
  date.setDate(date.getDate() + i);
  rollingData.push({
    date: date.toISOString().split('T')[0],
    hrv: 50 + (i * 2), // Gradually increasing: 50, 52, 54, 56, 58, 60, 62
    rhr: 50,
    sleepScore: 80
  });
}

const trendingInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 62, // End of trending data
    rhr: 50,
    sleepScore: 85,
    fatigue: 4,
    stress: 4
  },
  historical: rollingData
};

const trendingResult = calculator.calculate(trendingInput, { includeDebugInfo: true });

console.log("Trending HRV Baseline Data:", trendingResult.baselines?.hrv);
console.log("Trending HRV Score:", trendingResult.components.hrv);