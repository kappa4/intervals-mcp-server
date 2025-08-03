/**
 * UCRテスト用期待値データ
 * calcReadinessの計算結果を基準に作成
 */

import type { UCRResult } from "../../ucr-types.ts";

/**
 * 健康的アスリートの期待結果
 */
export const HEALTHY_ATHLETE_EXPECTED: Partial<UCRResult> = {
  score: 78,  // 75-82の範囲が期待値
  baseScore: 78,
  trainingRecommendation: "Normal training recommended",
  confidence: "high",
  components: {
    hrv: 28,       // HRV 40点満点中
    rhr: 14,       // RHR 20点満点中
    sleep: 18,     // Sleep 20点満点中
    subjective: 18 // Subjective 20点満点中
  }
};

/**
 * 副交感神経飽和の期待結果
 */
export const PARASYMPATHETIC_SATURATION_EXPECTED: Partial<UCRResult> = {
  score: 92,  // 副交感神経飽和により非常に高いスコア (35+19+18+20=92)
  baseScore: 92,
  trainingRecommendation: "Excellent readiness - high intensity training possible",
  confidence: "high",
  components: {
    hrv: 35,       // 副交感神経飽和により高いHRVスコア
    rhr: 19,       // 低いRHRによる高スコア（20点満点に近い）
    sleep: 18,     // 良好な睡眠
    subjective: 20 // 完璧な主観スコア（fatigue=1, stress=1）
  }
};

/**
 * 睡眠負債蓄積の期待結果
 */
export const SLEEP_DEBT_EXPECTED: Partial<UCRResult> = {
  // baseScoreが82の場合、睡眠負債4.5時間で0.775倍
  score: 64,  // 82 * 0.775 = 63.55 → 64
  baseScore: 82,
  trainingRecommendation: "Light recovery training suggested",
  confidence: "high",
  multiplier: 0.775,
  modifiers: {
    sleepDebt: {
      applied: true,
      value: 0.775,
      reason: "Sleep debt: 4.5 hours"
    }
  }
};

/**
 * 低モチベーションの期待結果
 */
export const LOW_MOTIVATION_EXPECTED: Partial<UCRResult> = {
  // baseScoreが82の場合、モチベーション修正子0.9倍
  score: 74,  // 82 * 0.9 = 73.8 → 74
  baseScore: 82,
  trainingRecommendation: "Normal training recommended",
  confidence: "high",
  multiplier: 0.9,
  modifiers: {
    motivation: {
      applied: true,
      value: 0.9,
      reason: "Low motivation"
    }
  }
};

/**
 * 軽度のケガの期待結果
 */
export const MINOR_INJURY_EXPECTED: Partial<UCRResult> = {
  score: 66,  // スコア上限66
  baseScore: 78,
  trainingRecommendation: "Light recovery training suggested",
  confidence: "high",
  modifiers: {
    injury: {
      applied: true,
      value: 66,
      reason: "Minor injury present"
    }
  }
};

/**
 * 重度のケガの期待結果
 */
export const SEVERE_INJURY_EXPECTED: Partial<UCRResult> = {
  score: 33,  // スコア上限33
  baseScore: 78,
  trainingRecommendation: "Rest day - injury present",
  confidence: "high",
  modifiers: {
    injury: {
      applied: true,
      value: 33,
      reason: "Significant injury - training not recommended"
    }
  }
};

/**
 * アルコール摂取の期待結果
 */
export const ALCOHOL_CONSUMED_EXPECTED: Partial<UCRResult> = {
  score: 66,  // 78 * 0.85 = 66.3 → 66
  baseScore: 78,
  trainingRecommendation: "Light recovery training suggested",
  confidence: "high",
  multiplier: 0.85,
  modifiers: {
    alcohol: {
      applied: true,
      value: 0.85,
      reason: "Alcohol consumed"
    }
  }
};

/**
 * 高ストレス状態の期待結果
 */
export const HIGH_STRESS_EXPECTED: Partial<UCRResult> = {
  score: 58,  // 低いHRV、高いRHR、低い睡眠スコアによる低スコア
  baseScore: 58,
  trainingRecommendation: "Light recovery training suggested",
  confidence: "high",
  components: {
    hrv: 15,       // 低いHRVスコア
    rhr: 8,        // 高いRHRによる低スコア
    sleep: 14,     // 低い睡眠スコア
    subjective: 21 // ストレスの影響を含む主観スコア
  }
};

/**
 * 完全回復状態の期待結果
 */
export const FULLY_RECOVERED_EXPECTED: Partial<UCRResult> = {
  score: 95,  // 非常に高いスコア
  baseScore: 95,
  trainingRecommendation: "Excellent readiness - high intensity training possible",
  confidence: "high",
  components: {
    hrv: 38,       // 高いHRVスコア
    rhr: 19,       // 低いRHRによる高スコア
    sleep: 19,     // 優れた睡眠スコア
    subjective: 19 // 高い主観スコア
  }
};

/**
 * データ不足の期待結果
 */
export const INSUFFICIENT_DATA_EXPECTED: Partial<UCRResult> = {
  score: 75,  // デフォルト値に近いスコア
  baseScore: 75,
  trainingRecommendation: "Normal training recommended",
  confidence: "low",  // データ不足による低信頼度
  dataQuality: {
    hrvDays: 20,
    rhrDays: 20,
    message: "Limited historical data (20 days). Accuracy will improve with more data."
  }
};

/**
 * 極端な値の期待結果
 */
export const EXTREME_VALUES_EXPECTED: Partial<UCRResult> = {
  score: 33,  // ケガによる上限適用
  baseScore: 41, // 極端な主観スコアの影響
  trainingRecommendation: "Rest day - injury present",
  confidence: "medium",  // 異常値による信頼度低下
  components: {
    hrv: 40,       // 高いHRVだが上限でクリップ
    rhr: 20,       // 低いRHRだが上限でクリップ
    sleep: 20,     // 完璧な睡眠スコア
    subjective: 4  // 極端に低い主観スコア
  },
  modifiers: {
    injury: {
      applied: true,
      value: 33,
      reason: "Significant injury - training not recommended"
    },
    alcohol: {
      applied: true,
      value: 0.9,
      reason: "Alcohol consumed"
    }
  }
};

/**
 * 期待値の許容誤差
 */
export const TOLERANCE = {
  score: 2,        // UCRスコアの許容誤差
  component: 1,    // 各コンポーネントスコアの許容誤差
  multiplier: 0.01 // 修正子の許容誤差
};