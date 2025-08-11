/**
 * UCR Statistics Calculator
 * 統計計算に関する共通機能を提供
 */

import { WellnessData, BaselineData } from '../ucr-types.ts';

export class UCRStatistics {
  /**
   * 平均値を計算
   */
  static calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * 標準偏差を計算
   */
  static calculateStdDev(values: number[]): number {
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = this.calculateMean(squaredDiffs);
    return Math.sqrt(variance);
  }

  /**
   * Zスコアを計算
   */
  static calculateZScore(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  /**
   * パーセンタイルを計算
   */
  static calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 移動平均を計算
   */
  static calculateMovingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const windowValues = values.slice(start, i + 1);
      result.push(this.calculateMean(windowValues));
    }
    return result;
  }

  /**
   * 指数移動平均（EMA）を計算
   */
  static calculateEMA(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    
    const alpha = 2 / (period + 1);
    const ema: number[] = [values[0]];
    
    for (let i = 1; i < values.length; i++) {
      ema.push(values[i] * alpha + ema[i - 1] * (1 - alpha));
    }
    
    return ema;
  }

  /**
   * ボリンジャーバンドを計算
   */
  static calculateBollingerBands(
    values: number[], 
    period: number = 20, 
    stdDevMultiplier: number = 2
  ): {upper: number[], middle: number[], lower: number[]} {
    const sma = this.calculateMovingAverage(values, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - period + 1);
      const windowValues = values.slice(start, i + 1);
      
      if (windowValues.length >= 2) {
        const stdDev = this.calculateStdDev(windowValues);
        upper.push(sma[i] + stdDev * stdDevMultiplier);
        lower.push(sma[i] - stdDev * stdDevMultiplier);
      } else {
        upper.push(sma[i]);
        lower.push(sma[i]);
      }
    }
    
    return { upper, middle: sma, lower };
  }

  /**
   * 副交感神経系飽和を検出
   */
  static detectParasympatheticSaturation(
    currentHRV: number, 
    currentRHR: number, 
    baselines: BaselineData
  ): boolean {
    // 互換性のため、新旧両方のプロパティ名をサポート
    const hrvMean = baselines.hrv.mean ?? baselines.hrv.mean60;
    const hrvStdDev = baselines.hrv.stdDev ?? baselines.hrv.sd60;
    const rhrMean = baselines.rhr.mean ?? baselines.rhr.mean30;
    const rhrStdDev = baselines.rhr.stdDev ?? baselines.rhr.sd30;
    
    const hrvZScore = this.calculateZScore(currentHRV, hrvMean, hrvStdDev);
    const rhrZScore = this.calculateZScore(currentRHR, rhrMean, rhrStdDev);
    return hrvZScore > 2.0 && rhrZScore < -1.5;
  }

  /**
   * データ品質を評価（新しいシグネチャ）
   */
  static evaluateDataQuality(
    baselines: BaselineData, 
    historical: WellnessData[]
  ): {hrvDays: number; rhrDays: number; message: string; isReliable: boolean} {
    // 互換性のため、新旧両方のプロパティ名をサポート
    const hrvDays = baselines.hrv.dataCount ?? baselines.hrv.count ?? 0;
    const rhrDays = baselines.rhr.dataCount ?? baselines.rhr.count ?? 0;
    
    let message = '';
    let isReliable = false;
    
    if (hrvDays < 7 || rhrDays < 7) {
      message = 'データが不足しています。最低7日分のデータが必要です。';
      isReliable = false;
    } else if (hrvDays < 30 || rhrDays < 30) {
      message = 'データが少なめです。より正確な分析には30日分以上のデータが推奨されます。';
      isReliable = true; // 7日以上あれば最低限信頼できる
    } else {
      message = '十分なデータがあります。';
      isReliable = true;
    }
    
    return { hrvDays, rhrDays, message, isReliable };
  }
  
  /**
   * データ品質を評価（旧シグネチャ - 後方互換性のため）
   */
  static evaluateDataQualityLegacy(
    baselines: BaselineData, 
    historical: WellnessData[]
  ): { confidence: string; quality: any } {
    const dataPoints = historical.filter(d => d.hrv && d.rhr).length;
    
    let confidence = 'low';
    if (dataPoints >= 60) confidence = 'high';
    else if (dataPoints >= 30) confidence = 'medium';
    
    // 互換性のため、新旧両方のプロパティ名をサポート
    const hrvCount = baselines.hrv.count ?? baselines.hrv.dataCount;
    const rhrCount = baselines.rhr.count ?? baselines.rhr.dataCount;
    
    return {
      confidence,
      quality: {
        hrvDataPoints: hrvCount,
        rhrDataPoints: rhrCount,
        totalDays: historical.length,
        completeness: (dataPoints / historical.length) * 100
      }
    };
  }
}