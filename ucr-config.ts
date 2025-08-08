/**
 * UCR (Unified Continuous Readiness) Configuration
 * Central configuration for all UCR-related calculations and scoring
 * This ensures consistency across all components (API, MCP, calculations)
 */

/**
 * Component weight configuration
 * These values define the maximum score for each UCR component
 * Total must equal 100 for percentage calculations
 */
export const UCR_COMPONENT_WEIGHTS = {
  hrv: 40,        // HRV component weight
  rhr: 25,        // RHR component weight (increased from 20 for HRV double-counting correction)
  sleep: 15,      // Sleep component weight (reduced from 20 for Garmin HRV overlap reduction)
  subjective: 20  // Subjective component weight
} as const;

/**
 * Verify that component weights sum to 100
 */
const TOTAL_WEIGHT = Object.values(UCR_COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
if (TOTAL_WEIGHT !== 100) {
  throw new Error(`UCR component weights must sum to 100, but got ${TOTAL_WEIGHT}`);
}

/**
 * Component status thresholds (percentage-based)
 */
export const UCR_STATUS_THRESHOLDS = {
  excellent: 90,
  good: 75,
  fair: 60,
  belowAverage: 45
} as const;

/**
 * Get component status based on score and maximum score
 * @param score Current score
 * @param maxScore Maximum possible score for the component
 * @returns Status string
 */
export function getComponentStatus(score: number, maxScore: number): string {
  const percentage = (score / maxScore) * 100;
  if (percentage >= UCR_STATUS_THRESHOLDS.excellent) return "Excellent";
  if (percentage >= UCR_STATUS_THRESHOLDS.good) return "Good";
  if (percentage >= UCR_STATUS_THRESHOLDS.fair) return "Fair";
  if (percentage >= UCR_STATUS_THRESHOLDS.belowAverage) return "Below average";
  return "Poor";
}

/**
 * UCR readiness level thresholds
 */
export const UCR_READINESS_LEVELS = {
  excellent: 85,
  good: 70,
  moderate: 55,
  poor: 45
} as const;

/**
 * Get readiness level based on UCR score
 * @param score UCR score (0-100)
 * @returns Readiness level description
 */
export function getReadinessLevel(score: number): string {
  if (score >= UCR_READINESS_LEVELS.excellent) return "Excellent - Peak performance ready";
  if (score >= UCR_READINESS_LEVELS.good) return "Good - Ready for hard training";
  if (score >= UCR_READINESS_LEVELS.moderate) return "Moderate - Normal training appropriate";
  if (score >= UCR_READINESS_LEVELS.poor) return "Poor - Recovery focus recommended";
  return "Very poor - Rest recommended";
}

/**
 * Type definitions for UCR components
 */
export interface UCRComponentScore {
  score: number;
  weight: number;
  contribution: number;
  status: string;
}

export interface UCRComponentsBreakdown {
  hrv: UCRComponentScore;
  rhr: UCRComponentScore;
  sleep: UCRComponentScore;
  subjective: UCRComponentScore;
}

/**
 * Create a component score object
 * @param score The actual score for the component
 * @param componentType The type of component (hrv, rhr, sleep, subjective)
 * @returns UCRComponentScore object
 */
export function createComponentScore(
  score: number, 
  componentType: keyof typeof UCR_COMPONENT_WEIGHTS
): UCRComponentScore {
  const weight = UCR_COMPONENT_WEIGHTS[componentType];
  return {
    score,
    weight,
    contribution: score,
    status: getComponentStatus(score, weight)
  };
}

/**
 * Export configuration for ucr-calculator.ts compatibility
 * This maintains backward compatibility with existing code
 */
export const UCR_CALCULATOR_CONFIG = {
  scoreWeights: UCR_COMPONENT_WEIGHTS,
  // Other configuration values used by ucr-calculator.ts
  hrv: {
    baselineDays: 60,
    sigmoid: {
      k: 1.3,
      c: 0,
      saturationZ: 2.5
    },
    sensitivityFactor: 3.5
  },
  rhr: {
    baselineDays: 30,
    linear: {
      baseline: 12.5,
      slope: 3.125
    }
  },
  sleep: {
    minHours: 5,
    targetHours: 5.5,
    debtDays: 3
  }
} as const;