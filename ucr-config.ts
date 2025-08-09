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
 * Modifier thresholds for subjective wellness indicators
 * Based on intervals.icu scale: 1=best, 5=worst
 */
export const UCR_MODIFIER_THRESHOLDS = {
  soreness: {
    none: 2,      // 1-2: no penalty
    mild: 3,      // 3: mild penalty
    moderate: 4,  // 4: moderate penalty
    severe: 5     // 5: severe penalty
  },
  motivation: {
    high: 3,      // 1-3: no penalty
    low: 4        // 4-5: low motivation penalty
  },
  injury: {
    none: 2,      // 1-2: no cap
    minor: 3,     // 3: cap at 70
    moderate: 4,  // 4: cap at 50
    severe: 5     // 5: cap at 30
  }
} as const;

/**
 * Penalty multipliers for various conditions
 */
export const UCR_PENALTIES = {
  alcoholLight: 0.85,
  alcoholHeavy: 0.6,
  muscleSorenessSevere: 0.5,
  musclesorenessModerate: 0.75,
  sleepDebt: -15,
  injuryModerate: -15,
  injuryLight: -5,
  motivationLow: 0.9
} as const;

/**
 * Trend analysis configuration
 */
export const UCR_TREND_CONFIG = {
  momentum: {
    lookbackDays: 7,
    thresholds: {
      strongPositive: 10,
      positive: 2,
      negative: -2,
      strongNegative: -10
    }
  },
  volatility: {
    period: 14,
    emaAlpha: 2 / (14 + 1),
    bollinger: {
      period: 20,
      stdDevMultiplier: 1.5
    }
  },
  minDataPoints: 15
} as const;

/**
 * Export configuration for ucr-calculator.ts compatibility
 * This maintains backward compatibility with existing code
 */
export const UCR_CALCULATOR_CONFIG = {
  scoreWeights: UCR_COMPONENT_WEIGHTS,
  modifierThresholds: UCR_MODIFIER_THRESHOLDS,
  penalties: UCR_PENALTIES,
  trend: UCR_TREND_CONFIG,
  // Other configuration values used by ucr-calculator.ts
  hrv: {
    baselineDays: 60,
    rollingDays: 7,
    sensitivityFactor: 0.75,
    sigmoid: {
      k: 1.0,
      c: -0.5,
      saturationZ: 1.5
    }
  },
  rhr: {
    baselineDays: 30,
    thresholdSd: 1.0,
    linear: {
      baseline: 17.5,  // 25点満点の70%ベースライン
      slope: 7.5       // 25点満点に対応した傾き
    }
  },
  sleep: {
    minHours: 5,
    targetHours: 5.5,
    debtDays: 3
  }
} as const;