/**
 * RHR Score Calculator
 * 安静時心拍数スコアの計算を担当
 */

import { BaselineData } from '../ucr-types.ts';
import { UCRStatistics } from '../analyzers/ucr-statistics.ts';
import { UCR_CALCULATOR_CONFIG } from '../ucr-config.ts';

export class RHRScoreCalculator {
  private config = UCR_CALCULATOR_CONFIG;

  /**
   * RHRスコアを計算
   */
  calculate(currentRHR: number, rhrBaseline: BaselineData['rhr']): number {
    if (!currentRHR || rhrBaseline.stdDev === 0) {
      return this.config.scoreWeights.rhr * 0.5;
    }

    // Zスコアを計算（RHRは低い方が良いので符号を反転）
    const zScore = -UCRStatistics.calculateZScore(
      currentRHR,
      rhrBaseline.mean,
      rhrBaseline.stdDev
    );
    
    // 線形スコアリング（改善されたモデル）
    const linear = this.config.rhr.linear;
    const score = linear.baseline + linear.slope * zScore;
    
    // 0-25の範囲にクリップ
    return Math.max(0, Math.min(this.config.scoreWeights.rhr, score));
  }

  /**
   * RHRベースラインを計算
   */
  calculateBaseline(rhrValues: number[]): BaselineData['rhr'] {
    if (rhrValues.length === 0) {
      return { mean: 60, stdDev: 5, count: 0 };
    }

    return {
      mean: UCRStatistics.calculateMean(rhrValues),
      stdDev: UCRStatistics.calculateStdDev(rhrValues),
      count: rhrValues.length
    };
  }
}