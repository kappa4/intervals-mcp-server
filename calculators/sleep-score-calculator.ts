/**
 * Sleep Score Calculator
 * 睡眠スコアの計算を担当
 */

import { WellnessData } from '../ucr-types.ts';
import { UCRStatistics } from '../analyzers/ucr-statistics.ts';
import { UCR_CALCULATOR_CONFIG } from '../ucr-config.ts';

export class SleepScoreCalculator {
  private config = UCR_CALCULATOR_CONFIG;

  /**
   * 睡眠スコアを計算
   */
  calculate(current: WellnessData): number {
    // Garmin睡眠スコアが利用可能な場合は優先使用
    const sleepScore = current.sleepScore ?? this.calculateFromHours(current.sleepHours);
    
    if (sleepScore === null) {
      return this.config.scoreWeights.sleep * 0.7; // デフォルト値
    }

    // 睡眠時間による調整係数
    const adjustmentFactor = this.calculateAdjustmentFactor(current.sleepHours);
    
    // 負の値は0にクリップ、100超は100にクリップ
    const clippedScore = Math.max(0, Math.min(100, sleepScore));
    const baseScore = (clippedScore / 100) * this.config.scoreWeights.sleep;
    
    // 調整係数を適用（短時間睡眠の場合はスコアが減少）
    return baseScore * adjustmentFactor;
  }

  /**
   * 睡眠時間からスコアを計算
   */
  private calculateFromHours(sleepHours?: number): number | null {
    if (!sleepHours) return null;
    
    const { minHours, targetHours } = this.config.sleep;
    
    if (sleepHours >= targetHours) {
      return 100; // 目標時間以上は満点
    } else if (sleepHours >= minHours) {
      // 最小〜目標時間の間は線形補間
      return 70 + ((sleepHours - minHours) / (targetHours - minHours)) * 30;
    } else {
      // 最小時間未満は急激に減少
      return Math.max(0, 70 * (sleepHours / minHours));
    }
  }

  /**
   * 睡眠時間による調整係数を計算
   */
  private calculateAdjustmentFactor(sleepHours?: number): number {
    if (!sleepHours) return 1.0;
    
    const { minHours } = this.config.sleep;
    
    if (sleepHours >= minHours) {
      return 1.0; // 最小時間以上なら調整なし
    } else {
      // 最小時間未満は係数を減少
      return Math.max(0.5, sleepHours / minHours);
    }
  }

  /**
   * 睡眠負債を計算
   */
  calculateSleepDebt(historicalData: WellnessData[]): number {
    const { targetHours, debtDays } = this.config.sleep;
    
    // 直近のdebtDays日間のデータ
    const recentData = historicalData.slice(-debtDays);
    
    let totalDebt = 0;
    for (const data of recentData) {
      const hours = data.sleepHours || 0;
      if (hours < targetHours) {
        totalDebt += (targetHours - hours);
      }
    }
    
    return totalDebt;
  }
}