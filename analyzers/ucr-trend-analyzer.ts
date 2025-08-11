/**
 * UCR Trend Analyzer
 * UCRトレンド分析を担当
 */

import { WellnessData, TrendResult } from '../ucr-types.ts';
import { UCRStatistics } from './ucr-statistics.ts';
import { UCR_CALCULATOR_CONFIG } from '../ucr-config.ts';
import { UCRInterpretationGenerator } from '../generators/ucr-interpretation-generator.ts';

export class UCRTrendAnalyzer {
  private config = UCR_CALCULATOR_CONFIG.trend;
  private interpretationGenerator = new UCRInterpretationGenerator();

  /**
   * トレンド分析を実行
   */
  analyzeTrends(historicalData: WellnessData[], targetDate: string): TrendResult {
    // 時系列データを準備
    const timeSeriesData = this.prepareTimeSeriesData(historicalData, targetDate);
    
    if (!timeSeriesData || timeSeriesData.length < this.config.minDataPoints) {
      return {
        momentum: null,
        volatility: null,
        prediction: null,
        confidence: 'low',
        interpretation: 'データ不足のため、トレンド分析を実行できません。最低15日分のデータが必要です。'
      };
    }
    
    // 現在のUCRスコア
    const currentScore = timeSeriesData[timeSeriesData.length - 1].score;
    
    // モメンタムを計算
    const momentum = this.calculateMomentum(timeSeriesData, targetDate);
    
    // ボラティリティを計算
    const volatilityResult = this.calculateVolatility(timeSeriesData);
    
    // トレンド状態を判定
    let trendStateKey = '';
    let trendStateName = '均衡状態';
    let trendStateCode = 5;
    
    if (momentum && volatilityResult) {
      const momentumCategory = this.categorizeMomentum(momentum.value);
      trendStateKey = this.interpretationGenerator.determineTrendStateKey(currentScore, momentumCategory);
      trendStateName = this.interpretationGenerator.getTrendStateName(trendStateKey);
      trendStateCode = this.interpretationGenerator.getTrendStateCode(trendStateKey);
    }
    
    // 解釈を生成
    const interpretation = momentum && volatilityResult
      ? this.interpretationGenerator.generateInterpretation(
          currentScore,
          momentum.value,
          volatilityResult.value,
          volatilityResult.level,
          trendStateName
        )
      : 'トレンドデータが不足しています。';
    
    // 信頼度を判定
    const confidence = timeSeriesData.length >= 30 ? 'high' : 
                      timeSeriesData.length >= 15 ? 'medium' : 'low';
    
    return {
      momentum,
      volatility: volatilityResult,
      prediction: null, // 予測機能は将来実装
      confidence,
      interpretation,
      trendState: trendStateName,
      trendStateCode
    };
  }

  /**
   * 時系列データを準備
   */
  private prepareTimeSeriesData(
    historicalData: WellnessData[], 
    targetDate: string
  ): Array<{date: string, score: number}> | null {
    const targetDateTime = new Date(targetDate).getTime();
    
    // 対象日から過去90日間のデータをフィルタ
    const filtered = historicalData.filter(d => {
      const dataDateTime = new Date(d.date).getTime();
      const daysDiff = (targetDateTime - dataDateTime) / (1000 * 60 * 60 * 24);
      return daysDiff >= 0 && daysDiff <= 90;
    });
    
    // UCRスコアが計算可能なデータのみを抽出
    const withScores = filtered
      .filter(d => this.hasValidUCRData(d))
      .map(d => ({
        date: d.date,
        score: this.calculateSimpleUCRScore(d)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return withScores.length >= this.config.minDataPoints ? withScores : null;
  }

  /**
   * UCRデータの有効性を確認
   */
  private hasValidUCRData(data: WellnessData): boolean {
    return !!(data.hrv || data.rhr || data.sleepHours || data.sleepScore);
  }

  /**
   * 簡易UCRスコアを計算（トレンド分析用）
   */
  private calculateSimpleUCRScore(data: WellnessData): number {
    // 仮の簡易計算（実際のUCR計算ロジックの簡略版）
    let score = 50; // ベースライン
    
    if (data.hrv) {
      // HRVが高いほど良い（簡易計算）
      score += Math.min(20, (data.hrv - 30) * 0.5);
    }
    
    if (data.rhr) {
      // RHRが低いほど良い（簡易計算）
      score += Math.max(-10, (60 - data.rhr) * 0.3);
    }
    
    if (data.sleepScore) {
      // 睡眠スコアの貢献
      score += (data.sleepScore - 50) * 0.2;
    } else if (data.sleepHours) {
      // 睡眠時間の貢献
      score += Math.min(10, (data.sleepHours - 5) * 3);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * モメンタムを計算
   */
  private calculateMomentum(
    timeSeriesData: Array<{date: string, score: number}>, 
    targetDate: string
  ): {value: number, category: string} | null {
    const lookbackDays = this.config.momentum.lookbackDays;
    
    if (timeSeriesData.length < lookbackDays + 1) {
      return null;
    }
    
    const currentIndex = timeSeriesData.findIndex(d => d.date === targetDate);
    if (currentIndex === -1) {
      // targetDateが見つからない場合は最後のデータを使用
      const lastIndex = timeSeriesData.length - 1;
      const lookbackIndex = Math.max(0, lastIndex - lookbackDays);
      
      const currentScore = timeSeriesData[lastIndex].score;
      const pastScore = timeSeriesData[lookbackIndex].score;
      
      const momentum = ((currentScore - pastScore) / pastScore) * 100;
      return {
        value: momentum,
        category: this.categorizeMomentum(momentum)
      };
    }
    
    const lookbackIndex = Math.max(0, currentIndex - lookbackDays);
    const currentScore = timeSeriesData[currentIndex].score;
    const pastScore = timeSeriesData[lookbackIndex].score;
    
    const momentum = ((currentScore - pastScore) / pastScore) * 100;
    
    return {
      value: momentum,
      category: this.categorizeMomentum(momentum)
    };
  }

  /**
   * モメンタムをカテゴリ分類
   */
  private categorizeMomentum(momentum: number): string {
    const thresholds = this.config.momentum.thresholds;
    
    if (momentum > thresholds.strongPositive) return 'STRONG_POSITIVE';
    if (momentum > thresholds.positive) return 'POSITIVE';
    if (momentum < thresholds.strongNegative) return 'STRONG_NEGATIVE';
    if (momentum < thresholds.negative) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  /**
   * ボラティリティを計算
   */
  private calculateVolatility(
    timeSeriesData: Array<{date: string, score: number}>
  ): {value: number, level: string, bandPosition: number} | null {
    const period = this.config.volatility.period;
    
    if (timeSeriesData.length < period) {
      return null;
    }
    
    // True Range（日次変動）を計算
    const trueRanges: number[] = [];
    for (let i = 1; i < timeSeriesData.length; i++) {
      const tr = Math.abs(timeSeriesData[i].score - timeSeriesData[i-1].score);
      trueRanges.push(tr);
    }
    
    // ATR（Average True Range）を計算
    const atr = UCRStatistics.calculateEMA(trueRanges, period);
    const currentATR = atr[atr.length - 1];
    
    // ボラティリティバンドを計算
    const volatilityHistory = atr.slice(-this.config.volatility.bollinger.period);
    const bands = this.calculateVolatilityBands(volatilityHistory);
    
    if (!bands) {
      return {
        value: currentATR,
        level: 'MODERATE',
        bandPosition: 0
      };
    }
    
    // ボラティリティレベルを判定
    let level = 'MODERATE';
    let bandPosition = 0;
    
    if (currentATR > bands.upper) {
      level = 'HIGH';
      bandPosition = Math.min(100, ((currentATR - bands.upper) / bands.stdDev) * 20 + 100);
    } else if (currentATR < bands.lower) {
      level = 'LOW';
      bandPosition = Math.max(-100, ((currentATR - bands.lower) / bands.stdDev) * 20 - 100);
    } else {
      bandPosition = ((currentATR - bands.middle) / (bands.upper - bands.middle)) * 100;
    }
    
    return {
      value: currentATR,
      level,
      bandPosition
    };
  }

  /**
   * ボラティリティバンドを計算
   */
  private calculateVolatilityBands(
    volatilityHistory: number[]
  ): {upper: number, middle: number, lower: number, stdDev: number} | null {
    if (volatilityHistory.length < 2) {
      return null;
    }
    
    const mean = UCRStatistics.calculateMean(volatilityHistory);
    const stdDev = UCRStatistics.calculateStdDev(volatilityHistory);
    const multiplier = this.config.volatility.bollinger.stdDevMultiplier;
    
    return {
      upper: mean + (stdDev * multiplier),
      middle: mean,
      lower: Math.max(0, mean - (stdDev * multiplier)),
      stdDev
    };
  }
}