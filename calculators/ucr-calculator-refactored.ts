/**
 * UCR Calculator (Refactored)
 * ファサードパターンを使用した新しいUCRCalculator
 * 各種計算クラスを統合して、既存のインターフェースを維持
 */

import {
  WellnessData,
  UCRCalculationInput,
  UCRResult,
  UCRWithTrend,
  UCRComponents,
  UCRModifiers,
  ModifierDetail,
  BaselineData,
  TrainingRecommendation,
  UCRConfig,
  UCRValidationError,
  UCRCalculationOptions
} from '../ucr-types.ts';

import { UCR_CALCULATOR_CONFIG, UCR_MODIFIER_THRESHOLDS, UCR_PENALTIES } from '../ucr-config.ts';
import { UCRStatistics } from '../analyzers/ucr-statistics.ts';
import { UCRTrendAnalyzer } from '../analyzers/ucr-trend-analyzer.ts';
import { HRVScoreCalculator } from './hrv-score-calculator.ts';
import { RHRScoreCalculator } from './rhr-score-calculator.ts';
import { SleepScoreCalculator } from './sleep-score-calculator.ts';
import { SubjectiveScoreCalculator, SubjectiveData } from './subjective-score-calculator.ts';
import { enrichBaselineData } from '../utils/baseline-converter.ts';

// トレーニング推奨ゾーン
const TRAINING_ZONES = {
  PRIME: {
    threshold: 85,
    name: 'プライム' as const,
    color: '#4CAF50',
    description: '身体はトレーニング負荷に完全に適応し、超回復が起きている可能性が高い。',
    action: '計画通りの高強度、あるいはそれ以上',
    approach: '身体の感覚が良ければ、計画のボリュームや強度を少し上乗せすることも検討できる。',
    examples: '計画通りの実行: VO2 Maxインターバル、全力でのタイムトライアル、1RMに近い高重量筋力トレーニングなど。'
  },
  MODERATE: {
    threshold: 65,
    name: '中程度' as const,
    color: '#FFA500',
    description: '生産的なトレーニングは可能だが、最高のストレスには不適',
    action: '低強度トレーニング',
    approach: '高強度は可能だが、注意深い自己調整が必須',
    examples: 'ゾーン2持久走、技術練習、中程度ボリュームの筋力トレーニング'
  },
  LOW: {
    threshold: 0,
    name: '低い' as const,
    color: '#F44336',
    description: '身体は回復が追いついておらず、生理的・心理的なストレスが高い状態。',
    action: '回復の最大化が最優先',
    approach: '高強度トレーニングは強く非推奨。トレーニングを行う場合でも、目的を「回復の促進」に切り替える。',
    examples: '積極的休養または完全休養: 完全な休息、軽い散歩、ストレッチ、フォームローリング、ヨガなど。'
  }
};

export class UCRCalculatorRefactored {
  private config: UCRConfig;
  private hrvCalculator: HRVScoreCalculator;
  private rhrCalculator: RHRScoreCalculator;
  private sleepCalculator: SleepScoreCalculator;
  private subjectiveCalculator: SubjectiveScoreCalculator;
  private trendAnalyzer: UCRTrendAnalyzer;

  constructor(config: Partial<UCRConfig> = {}) {
    this.config = { ...UCR_CALCULATOR_CONFIG, ...config };
    
    // 各計算クラスをインスタンス化
    this.hrvCalculator = new HRVScoreCalculator();
    this.rhrCalculator = new RHRScoreCalculator();
    this.sleepCalculator = new SleepScoreCalculator();
    this.subjectiveCalculator = new SubjectiveScoreCalculator();
    this.trendAnalyzer = new UCRTrendAnalyzer();
  }

  /**
   * 設定を取得（テスト用）
   */
  public getConfig(): UCRConfig {
    return this.config;
  }

  /**
   * UCRスコアを計算する
   */
  public calculate(input: UCRCalculationInput, options?: UCRCalculationOptions): UCRResult {
    // 入力検証
    const errors = this.validateInput(input);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.map(e => e.message).join(', ')}`);
    }

    const { current, historical } = input;
    
    // ベースラインを計算
    const baselines = this.calculateBaselines(historical, current.date, current);
    
    // 各コンポーネントスコアを計算
    const components: UCRComponents = {
      hrv: this.hrvCalculator.calculate(
        current.hrv || 0, 
        current.rhr || 0, 
        baselines.hrv, 
        baselines.rhr
      ),
      rhr: this.rhrCalculator.calculate(current.rhr || 0, baselines.rhr),
      sleep: this.sleepCalculator.calculate(current),
      subjective: this.calculateSubjectiveScore(current)
    };

    // 基本スコアを計算
    const baseScore = components.hrv + components.rhr + components.sleep + components.subjective;
    
    // 修正因子を適用
    const subjectiveData = this.subjectiveCalculator.convertSubjectiveData(current);
    const { finalScore, modifiers, multiplier } = this.applyModifiers(
      baseScore, 
      subjectiveData, 
      historical
    );

    // トレーニング推奨を取得
    const recommendation = this.getTrainingRecommendation(finalScore);

    // データ品質を評価
    const dataQuality = UCRStatistics.evaluateDataQuality(baselines, historical);

    // 結果を構築
    const result: UCRResult = {
      score: Math.round(finalScore * 10) / 10,
      components,
      modifiers,
      baselines,
      recommendation,
      dataQuality,
      timestamp: new Date().toISOString(),
      date: current.date,
      multiplier
    };

    // デバッグ情報を含める場合
    if (options?.includeDebugInfo) {
      result.debug = {
        baseScore,
        finalScore,
        config: this.config
      };
    }

    return result;
  }

  /**
   * トレンド分析を含むUCR計算
   */
  public calculateWithTrends(input: UCRCalculationInput): UCRWithTrend {
    const baseResult = this.calculate(input);
    const trends = this.trendAnalyzer.analyzeTrends(input.historical, input.current.date);
    
    return {
      ...baseResult,
      trends
    };
  }

  /**
   * 入力データの検証
   */
  private validateInput(input: UCRCalculationInput): UCRValidationError[] {
    const errors: UCRValidationError[] = [];
    
    if (!input.current) {
      errors.push({ field: 'current', message: 'Current wellness data is required' });
    }
    
    if (!input.historical || input.historical.length === 0) {
      errors.push({ field: 'historical', message: 'Historical data is required' });
    }
    
    if (input.current && !input.current.date) {
      errors.push({ field: 'current.date', message: 'Current date is required' });
    }
    
    return errors;
  }

  /**
   * ベースラインを計算
   */
  private calculateBaselines(
    historicalData: WellnessData[], 
    currentDate: string, 
    currentData: WellnessData
  ): BaselineData {
    // HRVデータを抽出
    const hrvValues = historicalData
      .filter(d => d.hrv && d.date <= currentDate)
      .map(d => d.hrv as number);
    
    // RHRデータを抽出
    const rhrValues = historicalData
      .filter(d => d.rhr && d.date <= currentDate)
      .map(d => d.rhr as number);
    
    // ベースラインを計算
    const baselines: BaselineData = {
      hrv: this.calculateHRVBaseline(hrvValues, currentData.hrv),
      rhr: this.calculateRHRBaseline(rhrValues)
    };
    
    // エイリアスプロパティを追加
    return enrichBaselineData(baselines);
  }

  /**
   * HRVベースラインを計算
   */
  private calculateHRVBaseline(hrvValues: number[], currentHRV?: number): BaselineData['hrv'] {
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

    // ln変換を適用
    const lnValues = hrvValues.map(v => Math.log(v));
    
    // 60日と7日の統計を計算
    const last60 = lnValues.slice(-60);
    const last7 = lnValues.slice(-7);
    
    const mean60 = UCRStatistics.calculateMean(last60);
    const sd60 = UCRStatistics.calculateStdDev(last60);
    const mean7 = UCRStatistics.calculateMean(last7);
    
    return {
      mean60,
      sd60,
      mean7,
      dataCount: hrvValues.length,
      isValid: hrvValues.length >= 7,
      // エイリアス
      mean: mean60,
      stdDev: sd60,
      count: hrvValues.length
    };
  }

  /**
   * RHRベースラインを計算
   */
  private calculateRHRBaseline(rhrValues: number[]): BaselineData['rhr'] {
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

    const last30 = rhrValues.slice(-30);
    const mean30 = UCRStatistics.calculateMean(last30);
    const sd30 = UCRStatistics.calculateStdDev(last30);
    
    return {
      mean30,
      sd30,
      dataCount: rhrValues.length,
      isValid: rhrValues.length >= 7,
      // エイリアス
      mean: mean30,
      stdDev: sd30,
      count: rhrValues.length
    };
  }

  /**
   * 主観的スコアを計算
   */
  private calculateSubjectiveScore(current: WellnessData): number {
    const subjectiveData = this.subjectiveCalculator.convertSubjectiveData(current);
    return this.subjectiveCalculator.calculate(subjectiveData);
  }

  /**
   * 修正因子を適用
   */
  private applyModifiers(
    baseScore: number, 
    subjectiveData: SubjectiveData, 
    historicalData: WellnessData[]
  ): { finalScore: number; modifiers: UCRModifiers; multiplier: number } {
    let finalScore = baseScore;
    let multiplier = 1.0;
    
    const modifiers: UCRModifiers = {
      alcoholPenalty: { applied: false, value: 0, reason: '' },
      sleepDebtPenalty: { applied: false, value: 0, reason: '' },
      muscleSorenessPenalty: { applied: false, value: 0, reason: '' },
      injuryCap: { applied: false, value: 100, reason: '' },
      motivationPenalty: { applied: false, value: 0, reason: '' }
    };

    // アルコールペナルティ
    if (subjectiveData.alcohol === 1) {
      multiplier *= UCR_PENALTIES.alcoholLight;
      modifiers.alcoholPenalty = { applied: true, value: UCR_PENALTIES.alcoholLight, reason: '軽度の飲酒' };
    } else if (subjectiveData.alcohol === 2) {
      multiplier *= UCR_PENALTIES.alcoholHeavy;
      modifiers.alcoholPenalty = { applied: true, value: UCR_PENALTIES.alcoholHeavy, reason: '過度の飲酒' };
    }

    // 筋肉痛ペナルティ（intervals.icuでは高い値が悪い状態）
    if (subjectiveData.soreness !== null && subjectiveData.soreness !== undefined) {
      const soreness = subjectiveData.soreness;
      if (soreness >= UCR_MODIFIER_THRESHOLDS.soreness.severe) {  // 5: 重度
        multiplier *= UCR_PENALTIES.muscleSorenessSevere;
        modifiers.muscleSorenessPenalty = { applied: true, value: UCR_PENALTIES.muscleSorenessSevere, reason: '重度の筋肉痛' };
      } else if (soreness >= UCR_MODIFIER_THRESHOLDS.soreness.moderate) {  // 4: 中程度
        multiplier *= UCR_PENALTIES.musclesorenessModerate;
        modifiers.muscleSorenessPenalty = { applied: true, value: UCR_PENALTIES.musclesorenessModerate, reason: '中程度の筋肉痛' };
      }
    }

    // モチベーションペナルティ
    if (subjectiveData.motivation !== null && subjectiveData.motivation !== undefined && subjectiveData.motivation >= UCR_MODIFIER_THRESHOLDS.motivation.low) {
      multiplier *= UCR_PENALTIES.motivationLow;
      modifiers.motivationPenalty = { applied: true, value: UCR_PENALTIES.motivationLow, reason: '低モチベーション' };
    }

    // 乗算ペナルティを適用
    finalScore *= multiplier;

    // 睡眠負債ペナルティ（減算）
    const sleepDebt = this.sleepCalculator.calculateSleepDebt(historicalData);
    if (sleepDebt > 3) {
      finalScore += UCR_PENALTIES.sleepDebt;
      modifiers.sleepDebtPenalty = { applied: true, value: UCR_PENALTIES.sleepDebt, reason: '睡眠負債の蓄積' };
    }

    // ケガによる上限設定（intervals.icuでは高い値が悪い状態）
    if (subjectiveData.injury !== null && subjectiveData.injury !== undefined) {
      const injury = subjectiveData.injury;
      if (injury >= UCR_MODIFIER_THRESHOLDS.injury.severe) {  // 5: 重度
        finalScore = Math.min(finalScore, 30);
        modifiers.injuryCap = { applied: true, value: 30, reason: '重度のケガ' };
      } else if (injury >= UCR_MODIFIER_THRESHOLDS.injury.moderate) {  // 4: 中程度
        finalScore = Math.min(finalScore, 50);
        modifiers.injuryCap = { applied: true, value: 50, reason: '中程度のケガ' };
      } else if (injury >= UCR_MODIFIER_THRESHOLDS.injury.minor) {  // 3: 軽度
        finalScore = Math.min(finalScore, 70);
        modifiers.injuryCap = { applied: true, value: 70, reason: '軽度のケガ' };
      }
    }

    return { 
      finalScore: Math.max(0, Math.min(100, finalScore)), 
      modifiers,
      multiplier
    };
  }

  /**
   * トレーニング推奨を取得
   */
  private getTrainingRecommendation(score: number): TrainingRecommendation {
    if (score >= TRAINING_ZONES.PRIME.threshold) {
      return TRAINING_ZONES.PRIME;
    } else if (score >= TRAINING_ZONES.MODERATE.threshold) {
      return TRAINING_ZONES.MODERATE;
    } else {
      return TRAINING_ZONES.LOW;
    }
  }
}