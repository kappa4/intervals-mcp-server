/**
 * HRV Score Calculator
 * HRV（心拍変動）スコアの計算を担当
 */

import { BaselineData } from '../ucr-types.ts';
import { UCRStatistics } from '../analyzers/ucr-statistics.ts';
import { UCR_CALCULATOR_CONFIG } from '../ucr-config.ts';

export class HRVScoreCalculator {
  private config = UCR_CALCULATOR_CONFIG;

  /**
   * HRVスコアを計算（副交感神経系飽和を考慮）
   */
  calculate(
    currentHRV: number, 
    currentRHR: number, 
    hrvBaseline: BaselineData['hrv'], 
    rhrBaseline: BaselineData['rhr']
  ): number {
    // 互換性のため、新旧両方のプロパティ名をサポート
    const hrvMean = hrvBaseline.mean ?? hrvBaseline.mean60;
    const hrvStdDev = hrvBaseline.stdDev ?? hrvBaseline.sd60;
    
    if (!currentHRV || hrvStdDev === 0) {
      return this.config.scoreWeights.hrv * 0.5;
    }

    // Zスコアを計算
    const zScore = UCRStatistics.calculateZScore(
      currentHRV, 
      hrvMean, 
      hrvStdDev
    );
    
    // 副交感神経系飽和の検出
    const isParasympatheticSaturation = UCRStatistics.detectParasympatheticSaturation(
      currentHRV,
      currentRHR,
      { hrv: hrvBaseline, rhr: rhrBaseline } as BaselineData
    );
    
    // シグモイド関数でスコアを計算
    const sigmoid = this.config.hrv.sigmoid;
    let adjustedZ = zScore;
    
    // 副交感神経系飽和時の調整
    if (isParasympatheticSaturation && zScore > sigmoid.saturationZ) {
      adjustedZ = sigmoid.saturationZ + (zScore - sigmoid.saturationZ) * this.config.hrv.sensitivityFactor;
    }
    
    // シグモイド変換（0-1の範囲に正規化）
    const normalizedScore = 1 / (1 + Math.exp(-sigmoid.k * (adjustedZ + sigmoid.c)));
    
    return normalizedScore * this.config.scoreWeights.hrv;
  }

  /**
   * HRVベースラインを計算
   */
  calculateBaseline(
    hrvValues: number[], 
    targetDate: string, 
    rollingDays: number = 7
  ): BaselineData['hrv'] {
    if (hrvValues.length === 0) {
      return { 
        mean60: 50, 
        sd60: 10, 
        mean7: 50,
        dataCount: 0,
        isValid: false,
        mean: 50, 
        stdDev: 10, 
        count: 0 
      };
    }

    // 直近のrollingDays分のデータを取得
    const recentValues = hrvValues.slice(-rollingDays);
    
    const mean = UCRStatistics.calculateMean(recentValues);
    const stdDev = UCRStatistics.calculateStdDev(recentValues);
    const count = recentValues.length;
    
    return {
      mean60: mean,
      sd60: stdDev,
      mean7: mean,  // 簡略化のため同じ値を使用
      dataCount: count,
      isValid: count > 0,
      // エイリアスプロパティ
      mean,
      stdDev,
      count
    };
  }
}