/**
 * Debug test to check actual UCR calculation results
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
    fatigue: 2,
    stress: 2
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

console.log("High Readiness Result:", {
  score: highResult.score,
  baseScore: highResult.baseScore,
  components: highResult.components,
  modifiers: highResult.modifiers
});

console.log("Low Readiness Result:", {
  score: lowResult.score,
  baseScore: lowResult.baseScore,
  components: lowResult.components,
  modifiers: lowResult.modifiers
});

// Test modifiers
const baselineInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 45,
    rhr: 50,
    sleepScore: 85,
    fatigue: 1,
    stress: 1,
    soreness: 1, // No soreness (intervals.icu scale: 1=no soreness)
  },
  historical: historicalData
};

const baselineResult = calculator.calculate(baselineInput);

const sorenessInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 45,
    rhr: 50,
    sleepScore: 85,
    fatigue: 1,
    stress: 1,
    soreness: 4, // Very sore (intervals.icu scale: 4=very sore)
  },
  historical: historicalData
};

const sorenessResult = calculator.calculate(sorenessInput);

console.log("Baseline Result:", {
  score: baselineResult.score,
  modifiers: baselineResult.modifiers
});

console.log("Soreness Result:", {
  score: sorenessResult.score,
  modifiers: sorenessResult.modifiers
});

// Test injury cap
const injuryInput: UCRCalculationInput = {
  current: {
    date: "2025-08-01",
    hrv: 60, // Excellent HRV
    rhr: 42, // Excellent RHR
    sleepScore: 98, // Perfect sleep
    fatigue: 1,     // Fresh
    stress: 1,      // Relaxed
    motivation: 1,  // High motivation
    injury: 4       // Severe injury (intervals.icu scale: 4=severe)
  },
  historical: historicalData
};

const injuryResult = calculator.calculate(injuryInput);

console.log("Injury Result:", {
  score: injuryResult.score,
  baseScore: injuryResult.baseScore,
  components: injuryResult.components,
  modifiers: injuryResult.modifiers
});