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
    // 互換性のため、新旧両方のプロパティ名をサポート
    const rhrMean = rhrBaseline.mean ?? rhrBaseline.mean30;
    const rhrStdDev = rhrBaseline.stdDev ?? rhrBaseline.sd30;
    
    if (!currentRHR || rhrStdDev === 0) {
      return this.config.scoreWeights.rhr * 0.5;
    }

    // Zスコアを計算（RHRは低い方が良いので符号を反転）
    const zScore = -UCRStatistics.calculateZScore(
      currentRHR,
      rhrMean,
      rhrStdDev
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
      return { 
        mean30: 60, 
        sd30: 5, 
        dataCount: 0,
        isValid: false,
        mean: 60, 
        stdDev: 5, 
        count: 0 
      };
    }

    const mean = UCRStatistics.calculateMean(rhrValues);
    const stdDev = UCRStatistics.calculateStdDev(rhrValues);
    const count = rhrValues.length;
    
    return {
      mean30: mean,
      sd30: stdDev,
      dataCount: count,
      isValid: count > 0,
      // エイリアスプロパティ
      mean,
      stdDev,
      count
    };
  }
}