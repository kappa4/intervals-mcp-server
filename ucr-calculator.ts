/**
 * UCR (Unified Continuous Readiness) Calculator
 * calcReadinessのGAS実装からの移植
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
  TrendResult,
  TrainingRecommendation,
  UCRConfig,
  UCRValidationError,
  UCRCalculationOptions,
  WellnessConversionMap,
  DefaultWellnessValues,
  IntervalsIcuWellnessUpdate
} from './ucr-types.ts';

// ========================================
// デフォルト設定
// ========================================

const DEFAULT_UCR_CONFIG: UCRConfig = {
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
      baseline: 17.5,  // 14 → 17.5: 25点満点の70%ベースライン (20点の70%=14 → 25点の70%=17.5)
      slope: 7.5       // 6 → 7.5: 25点満点に対応した傾き (20点の30%/SD=6 → 25点の30%/SD=7.5)
    }
  },
  sleep: {
    minHours: 5,
    targetHours: 5.5,
    debtDays: 3
  },
  scoreWeights: {
    hrv: 40,
    rhr: 25,    // 20 → 25: HRV二重計上補正のため増加
    sleep: 15,  // 20 → 15: Garmin睡眠スコア内のHRV成分による重複を削減
    subjective: 20
  },
  penalties: {
    alcoholLight: 0.85,
    alcoholHeavy: 0.6,
    muscleSorenessSevere: 0.5,
    musclesorenessModerate: 0.75,
    sleepDebt: -15,
    injuryModerate: -15,
    injuryLight: -5,
    motivationLow: 0.9
  },
  trend: {
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
  }
};

// intervals.icu wellness scale conversion (1-4 → 1-5)
// intervals.icu: 1=good, 4=bad -> internal: 1=bad, 5=good
const WELLNESS_CONVERSION: WellnessConversionMap = {
  'fatigue': { 1: 5, 2: 4, 3: 2, 4: 1 },      // 疲労度: 1=fresh -> 5, 4=very tired -> 1
  'soreness': { 1: 5, 2: 4, 3: 3, 4: 1 },     // 筋肉痛: 1=no soreness -> 5, 3=moderate -> 3, 4=very sore -> 1
  'stress': { 1: 5, 2: 4, 3: 2, 4: 1 },       // ストレス: 1=relaxed -> 5, 4=very stressed -> 1
  'motivation': { 1: 5, 2: 4, 3: 3, 4: 1 },   // モチベーション: 1=very motivated -> 5, 3=ok -> 3, 4=no motivation -> 1
  'injury': { 1: 5, 2: 4, 3: 3, 4: 1 }        // ケガ: 1=no injury -> 5, 3=slight -> 3, 4=severe injury -> 1
};

const DEFAULT_WELLNESS_VALUES: DefaultWellnessValues = {
  'fatigue': 4,      // やや良好（3→4）
  'soreness': 5,     // 痛みなし
  'stress': 4,       // やや良好（3→4）
  'motivation': 4,   // やや高いモチベーション
  'injury': 5        // ケガなし
};

// トレーニング推奨ゾーン
const TRAINING_ZONES = {
  PRIME: {
    threshold: 85,
    name: 'プライム' as const,
    color: '#4CAF50',
    description: '身体はトレーニング負荷に完全に適応し、超回復が起きている可能性が高い。限界に挑戦するためのまたとない機会。',
    action: '計画通りの高強度、あるいはそれ以上',
    approach: '身体の感覚が良ければ、計画のボリュームや強度を少し上乗せすることも検討できる。自信を持って挑戦する日。',
    examples: '計画通りの実行: VO2 Maxインターバル、全力でのタイムトライアル、1RMに近い高重量筋力トレーニングなど、最も要求の高いセッション。'
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
    description: '身体は回復が追いついておらず、生理的・心理的なストレスが高い状態。さらなるストレスは、傷害やオーバートレーニングのリスクを著しく高める。',
    action: '回復の最大化が最優先',
    approach: '高強度トレーニングは強く非推奨。トレーニングを行う場合でも、目的を「回復の促進」に切り替える。何もしないことが最も生産的な選択であることも多い。',
    examples: '積極的休養または完全休養: 完全な休息、軽い散歩、ストレッチ、フォームローリング、ヨガなど、血流を促進し、心身をリラックスさせる活動に限定する。'
  }
};

// ========================================
// UCRCalculator クラス
// ========================================

export class UCRCalculator {
  private config: UCRConfig;

  constructor(config?: Partial<UCRConfig>) {
    this.config = { ...DEFAULT_UCR_CONFIG, ...config };
  }

  // Get current configuration (for testing)
  public getConfig(): UCRConfig {
    return this.config;
  }

  /**
   * UCRスコアを計算する
   */
  calculate(input: UCRCalculationInput, options?: UCRCalculationOptions): UCRResult {
    const validationErrors = this.validateInput(input);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    const { current, historical } = input;
    
    // ベースライン計算
    const baselines = this.calculateBaselines(historical, current.date, current);
    
    // 主観的データの変換
    const subjectiveData = this.convertSubjectiveData(current);
    
    // 各コンポーネントのスコア計算
    const components: UCRComponents = {
      hrv: this.calculateHRVScore(current.hrv!, current.rhr!, baselines.hrv, baselines.rhr),
      rhr: this.calculateRHRScore(current.rhr!, baselines.rhr),
      sleep: this.calculateSleepScore(current),
      subjective: this.calculateSubjectiveScore(subjectiveData)
    };
    
    // ベーススコア
    const baseScore = Object.values(components).reduce((sum: number, score: number) => sum + score, 0);
    
    // 修正因子の適用
    const { finalScore, modifiers, multiplier } = this.applyModifiers(baseScore, subjectiveData, historical);
    
    // 推奨事項
    const recommendation = this.getTrainingRecommendation(finalScore);
    
    // データ品質の評価
    const dataQuality = this.evaluateDataQuality(baselines, historical);
    
    const result: UCRResult = {
      score: Math.round(finalScore),
      baseScore: Math.round(baseScore),
      components,
      modifiers: Object.keys(modifiers).length > 0 ? modifiers : undefined,
      multiplier: multiplier !== 1.0 ? multiplier : undefined,
      recommendation,
      trainingRecommendation: recommendation.action, // テスト互換性
      confidence: dataQuality.confidence,
      baselines: options?.includeDebugInfo ? baselines : undefined,
      dataQuality: dataQuality.quality
    };
    
    // デバッグ情報の追加
    if (options?.includeDebugInfo) {
      result.debugInfo = {
        parasympatheticSaturation: this.detectParasympatheticSaturation(current.hrv || 0, current.rhr || 0, baselines),
        baselines
      };
    }
    
    return result;
  }

  /**
   * トレンド分析付きのUCR計算
   */
  calculateWithTrends(input: UCRCalculationInput, options?: UCRCalculationOptions): UCRWithTrend {
    const baseResult = this.calculate(input, options);
    
    if (options?.skipTrendAnalysis) {
      return baseResult;
    }

    const trend = this.calculateTrends(input.historical, input.current.date);
    
    return {
      ...baseResult,
      trend
    };
  }

  /**
   * intervals.icu用のウェルネスデータ更新オブジェクトを生成
   */
  generateIntervalsIcuUpdate(result: UCRWithTrend): IntervalsIcuWellnessUpdate {
    const update: IntervalsIcuWellnessUpdate = {
      readiness: Math.round(result.score)
    };

    if (result.trend) {
      update.UCRMomentum = Math.round(result.trend.momentum * 10) / 10;
      update.UCRVolatility = Math.round(result.trend.volatility * 100) / 100;
      update.UCRVolatilityLevel = result.trend.volatilityLevel;
      update.UCRVolatilityBandPosition = Math.round(result.trend.volatilityBandPosition * 100) / 100;
      update.UCRTrendState = result.trend.trendStateCode;
      update.UCRTrendInterpretation = result.trend.interpretation;
    }

    return update;
  }

  // ========================================
  // Private メソッド群
  // ========================================

  private validateInput(input: UCRCalculationInput): UCRValidationError[] {
    const errors: UCRValidationError[] = [];
    
    if (!input.current.date) {
      errors.push({ field: 'current.date', message: 'Date is required' });
    }
    
    if (!input.current.hrv || input.current.hrv <= 0) {
      errors.push({ field: 'current.hrv', message: 'Valid HRV value is required', value: input.current.hrv });
    }
    
    if (!input.current.rhr || input.current.rhr <= 0) {
      errors.push({ field: 'current.rhr', message: 'Valid RHR value is required', value: input.current.rhr });
    }
    
    return errors;
  }

  private calculateBaselines(historicalData: WellnessData[], currentDate: string, currentData: WellnessData): BaselineData {
    const now = new Date(currentDate);
    const minHrvDays = 7;
    const minRhrDays = 7;

    // HRV データ（ln変換）- 60日間ベースライン（現在の日は含めない）
    const hrvData60 = historicalData
      .filter(d => {
        const date = new Date(d.date);
        const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff > 0 && daysDiff <= this.config.hrv.baselineDays && d.hrv && d.hrv > 0;
      })
      .map(d => Math.log(d.hrv!));

    // 7日間ローリング平均用データ（現在の日を含む過去7日間）
    const recentData = [...historicalData];
    if (currentData.hrv && currentData.hrv > 0) {
      recentData.push(currentData);
    }
    
    const hrvData7 = recentData
      .filter(d => {
        const date = new Date(d.date);
        const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 0 && daysDiff < this.config.hrv.rollingDays && d.hrv && d.hrv > 0;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, this.config.hrv.rollingDays)
      .map(d => Math.log(d.hrv!));

    // RHR データ
    const rhrData30 = historicalData
      .filter(d => {
        const date = new Date(d.date);
        const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 0 && daysDiff <= this.config.rhr.baselineDays && d.rhr && d.rhr > 0;
      })
      .map(d => d.rhr!);

    const hrvValid = hrvData60.length >= minHrvDays;
    const rhrValid = rhrData30.length >= minRhrDays;

    return {
      hrv: {
        mean60: hrvValid ? this.calculateMean(hrvData60) : (hrvData60.length > 0 ? this.calculateMean(hrvData60) : 0),
        sd60: hrvValid ? this.calculateStdDev(hrvData60) : (hrvData60.length > 0 ? this.calculateStdDev(hrvData60) : 0.1),
        mean7: hrvData7.length > 0 ? this.calculateMean(hrvData7) : 0,
        dataCount: hrvData60.length,
        isValid: hrvValid
      },
      rhr: {
        mean30: rhrValid ? this.calculateMean(rhrData30) : (rhrData30.length > 0 ? this.calculateMean(rhrData30) : 50),
        sd30: rhrValid ? this.calculateStdDev(rhrData30) : (rhrData30.length > 0 ? this.calculateStdDev(rhrData30) : 5),
        dataCount: rhrData30.length,
        isValid: rhrValid
      }
    };
  }

  private calculateHRVScore(currentHRV: number, currentRHR: number, hrvBaseline: BaselineData['hrv'], rhrBaseline: BaselineData['rhr']): number {
    if (!hrvBaseline.isValid || hrvBaseline.mean60 === 0 || hrvBaseline.sd60 === 0) {
      return this.config.scoreWeights.hrv * 0.625; // デフォルト中間値
    }

    const lnCurrentHRV = Math.log(currentHRV);

    // 副交感神経飽和チェック
    if (lnCurrentHRV < (hrvBaseline.mean60 - this.config.hrv.sensitivityFactor * hrvBaseline.sd60) &&
        currentRHR < rhrBaseline.mean30) {
      // 副交感神経飽和：高いZスコアを設定
      const zScore = this.config.hrv.sigmoid.saturationZ;
      const score = this.config.scoreWeights.hrv / (1 + Math.exp(-this.config.hrv.sigmoid.k * (zScore - this.config.hrv.sigmoid.c)));
      return score;
    }

    // 通常評価：7日間平均のZスコア
    const zScore = (hrvBaseline.mean7 - hrvBaseline.mean60) / (hrvBaseline.sd60 || 0.1);
    const score = this.config.scoreWeights.hrv / (1 + Math.exp(-this.config.hrv.sigmoid.k * (zScore - this.config.hrv.sigmoid.c)));
    
    return score;
  }

  private calculateRHRScore(currentRHR: number, rhrBaseline: BaselineData['rhr']): number {
    // 反転Zスコア（RHRは低いほど良い）
    const zScore = -(currentRHR - rhrBaseline.mean30) / (rhrBaseline.sd30 || 5);
    
    // 線形関数マッピング
    const score = this.config.rhr.linear.baseline + (zScore * this.config.rhr.linear.slope);
    
    // 0-25の範囲にクリップ（HRV二重計上補正後の新配点）
    return Math.max(0, Math.min(this.config.scoreWeights.rhr, score));
  }

  private calculateSleepScore(current: WellnessData): number {
    const sleepScore = current.sleepScore || 0;
    const sleepHours = current.sleepHours || 0;

    // データなしはデフォルト値
    if (sleepScore === 0 && sleepHours === 0) {
      return this.config.scoreWeights.sleep * 0.5;
    }

    // 睡眠時間が短い場合でも部分的な回復効果を反映
    // 最小睡眠時間未満の場合は、睡眠時間に応じた減衰係数を適用
    let adjustmentFactor = 1.0;
    if (sleepHours > 0 && sleepHours < this.config.sleep.minHours) {
      // 例: 最小6時間で、4時間睡眠なら 4/6 = 0.67倍
      // さらに睡眠不足のペナルティとして0.8を掛ける（最大で0.8倍）
      adjustmentFactor = (sleepHours / this.config.sleep.minHours) * 0.8;
    }

    // Garmin睡眠スコアの線形スケーリング (0-100を0-20にマップ)
    // 負の値は0にクリップ、100超は100にクリップ
    const clippedScore = Math.max(0, Math.min(100, sleepScore));
    const baseScore = (clippedScore / 100) * this.config.scoreWeights.sleep;

    // 調整係数を適用（短時間睡眠の場合はスコアが減少）
    return baseScore * adjustmentFactor;
  }

  private calculateSubjectiveScore(subjectiveData: any): number {
    const scores: number[] = [];
    
    if (subjectiveData.fatigue !== null && subjectiveData.fatigue !== undefined) {
      scores.push(subjectiveData.fatigue);
    }
    if (subjectiveData.stress !== null && subjectiveData.stress !== undefined) {
      scores.push(subjectiveData.stress);
    }

    if (scores.length === 0) {
      return this.config.scoreWeights.subjective * 0.5;
    }

    const averageScore = this.calculateMean(scores);
    return ((averageScore - 1) / 4) * this.config.scoreWeights.subjective;
  }

  private convertSubjectiveData(current: WellnessData): any {
    return {
      fatigue: this.convertWellnessScale(current.fatigue, 'fatigue'),
      soreness: this.convertWellnessScale(current.soreness, 'soreness'),
      stress: this.convertWellnessScale(current.stress, 'stress'),
      motivation: this.convertWellnessScale(current.motivation, 'motivation'),
      injury: this.convertWellnessScale(current.injury, 'injury'),
      alcohol: current.alcohol || 0
    };
  }

  private convertWellnessScale(icuValue: number | undefined, fieldType: string): number {
    if (icuValue === undefined || icuValue === null) {
      // データがない場合は、フィールドタイプに応じて適切なデフォルト値を返す
      return DEFAULT_WELLNESS_VALUES[fieldType] || 3;
    }
    
    // 変換マップを使用して変換
    const conversionMap = WELLNESS_CONVERSION[fieldType];
    return conversionMap ? conversionMap[icuValue] || 3 : 3;
  }

  private applyModifiers(baseScore: number, subjectiveData: any, historicalData: WellnessData[]): { finalScore: number; modifiers: UCRModifiers; multiplier: number } {
    let finalScore = baseScore;
    let totalMultiplier = 1.0;
    const modifiers: UCRModifiers = {};

    // 筋肉痛修正
    if (subjectiveData.soreness === 1) {
      const multiplier = this.config.penalties.muscleSorenessSevere;
      totalMultiplier *= multiplier;
      modifiers.muscleSoreness = {
        applied: true,
        value: multiplier,
        reason: "Severe muscle soreness"
      };
    } else if (subjectiveData.soreness === 2) {
      const multiplier = this.config.penalties.musclesorenessModerate;
      totalMultiplier *= multiplier;
      modifiers.muscleSoreness = {
        applied: true,
        value: multiplier,
        reason: "Moderate muscle soreness"
      };
    } else if (subjectiveData.soreness === 3) {
      const multiplier = 0.9;
      totalMultiplier *= multiplier;
      modifiers.muscleSoreness = {
        applied: true,
        value: multiplier,
        reason: "Mild muscle soreness"
      };
    }

    // アルコール修正
    if (subjectiveData.alcohol === true || subjectiveData.alcohol === 1) {
      const multiplier = this.config.penalties.alcoholLight;
      totalMultiplier *= multiplier;
      modifiers.alcohol = {
        applied: true,
        value: multiplier,
        reason: "Alcohol consumed"
      };
    } else if (subjectiveData.alcohol === 2) {
      const multiplier = this.config.penalties.alcoholHeavy;
      totalMultiplier *= multiplier;
      modifiers.alcohol = {
        applied: true,
        value: multiplier,
        reason: "Heavy alcohol consumption"
      };
    }

    // 睡眠負債修正
    const sleepDebt = this.calculateSleepDebt(historicalData);
    if (sleepDebt > 0) {
      const sleepDebtMultiplier = Math.max(0.7, 1 - 0.05 * sleepDebt);
      totalMultiplier *= sleepDebtMultiplier;
      modifiers.sleepDebt = {
        applied: true,
        value: sleepDebtMultiplier,
        reason: `Sleep debt: ${sleepDebt.toFixed(1)} hours`
      };
    }

    // モチベーション修正（内部値で判定: 1-2 = 低い）
    if (subjectiveData.motivation <= 2) {
      const multiplier = this.config.penalties.motivationLow;
      totalMultiplier *= multiplier;
      modifiers.motivation = {
        applied: true,
        value: multiplier,
        reason: "Low motivation"
      };
    }

    // 修正子を適用
    finalScore *= totalMultiplier;

    // ケガのハードキャップ（multiplierには含めない）
    if (subjectiveData.injury === 1) {
      finalScore = Math.min(finalScore, 30);
      modifiers.injury = {
        applied: true,
        value: 30,
        reason: "Significant injury - training not recommended"
      };
    } else if (subjectiveData.injury === 2) {
      finalScore = Math.min(finalScore, 50);
      modifiers.injury = {
        applied: true,
        value: 50,
        reason: "Moderate injury present"
      };
    } else if (subjectiveData.injury === 3) {
      finalScore = Math.min(finalScore, 70);
      modifiers.injury = {
        applied: true,
        value: 70,
        reason: "Minor injury present"
      };
    }

    return {
      finalScore: Math.max(0, Math.min(100, Math.round(finalScore))),
      modifiers,
      multiplier: totalMultiplier
    };
  }

  private calculateSleepDebt(historicalData: WellnessData[]): number {
    // 直近3日間のデータを取得（最新のデータから）
    const recentDays = historicalData.slice(-this.config.sleep.debtDays);

    let totalDebt = 0;
    recentDays.forEach(d => {
      const sleepHours = d.sleepHours;
      if (sleepHours !== undefined) {  // 睡眠データがある場合のみ計算（0時間も有効）
        const debt = Math.max(0, this.config.sleep.targetHours - sleepHours);
        totalDebt += debt;
      }
    });

    return totalDebt;
  }

  private getTrainingRecommendation(score: number): TrainingRecommendation {
    if (score >= TRAINING_ZONES.PRIME.threshold) {
      return TRAINING_ZONES.PRIME;
    } else if (score >= TRAINING_ZONES.MODERATE.threshold) {
      return TRAINING_ZONES.MODERATE;
    } else {
      return TRAINING_ZONES.LOW;
    }
  }

  private calculateTrends(historicalData: WellnessData[], targetDate: string): TrendResult {
    try {
      // UCRスコア付きの時系列データを準備
      const timeSeriesData = this.prepareTimeSeriesData(historicalData, targetDate);
      
      if (!timeSeriesData || timeSeriesData.length < this.config.trend.minDataPoints) {
        return {
          momentum: 0,
          volatility: 0,
          volatilityLevel: 'MODERATE',
          volatilityBandPosition: 0,
          trendState: '均衡状態',
          trendStateCode: 5,
          interpretation: `データ不足：トレンド分析には最低${this.config.trend.minDataPoints}日分のデータが必要です`
        };
      }

      // モメンタム計算
      const momentumResult = this.calculateMomentum(timeSeriesData, targetDate);
      
      // ボラティリティ計算
      const volatilityResult = this.calculateVolatility(timeSeriesData);
      
      // 対象日のUCRスコアを取得
      const currentEntry = historicalData.find(d => d.date === targetDate);
      if (!currentEntry) {
        throw new Error(`Target date ${targetDate} not found in historical data`);
      }

      // 現在のUCRスコアを計算（簡略版）
      const currentUCR = this.calculateCurrentUCRScore(currentEntry, historicalData);
      
      // トレンドステート判定
      const trendStateKey = this.determineTrendStateKey(currentUCR, momentumResult?.category || 'NEUTRAL');
      const trendState = this.getTrendStateName(trendStateKey);
      const trendStateCode = this.getTrendStateCode(trendStateKey);
      
      // 解釈生成
      const interpretation = this.generateInterpretation(
        currentUCR,
        momentumResult?.value || 0,
        volatilityResult?.value || 0,
        volatilityResult?.level || 'MODERATE',
        trendState
      );

      return {
        momentum: momentumResult?.value || 0,
        volatility: volatilityResult?.value || 0,
        volatilityLevel: (volatilityResult?.level || 'MODERATE') as 'LOW' | 'MODERATE' | 'HIGH',
        volatilityBandPosition: volatilityResult?.bandPosition || 0,
        trendState,
        trendStateCode,
        interpretation
      };
    } catch (error) {
      console.error("ERROR", `Trend calculation failed: ${(error as Error).message}`);
      return {
        momentum: 0,
        volatility: 0,
        volatilityLevel: 'MODERATE',
        volatilityBandPosition: 0,
        trendState: '均衡状態',
        trendStateCode: 5,
        interpretation: `トレンド計算エラー: ${(error as Error).message}`
      };
    }
  }

  private prepareTimeSeriesData(historicalData: WellnessData[], targetDate: string): Array<{date: string, score: number}> | null {
    // UCRスコアを持つデータのみを抽出・ソート
    const validEntries = historicalData
      .filter(d => d.date <= targetDate && this.hasValidUCRData(d))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (validEntries.length === 0) return null;

    // 各エントリのUCRスコアを計算
    const timeSeriesData: Array<{date: string, score: number}> = [];
    
    for (const entry of validEntries) {
      try {
        const historicalForEntry = historicalData.filter(d => d.date <= entry.date);
        const ucrScore = this.calculateCurrentUCRScore(entry, historicalForEntry);
        timeSeriesData.push({
          date: entry.date,
          score: ucrScore
        });
      } catch (error) {
        // エラーがあっても継続
        continue;
      }
    }

    return timeSeriesData.length > 0 ? timeSeriesData : null;
  }

  private hasValidUCRData(data: WellnessData): boolean {
    return !!(data.hrv && data.hrv > 0 && data.rhr && data.rhr > 0);
  }

  private calculateCurrentUCRScore(current: WellnessData, historical: WellnessData[]): number {
    // 簡略版UCR計算（フルバージョンは既存のcalculateメソッドを使用）
    const input: UCRCalculationInput = { current, historical };
    const result = this.calculate(input, { skipTrendAnalysis: true });
    return result.score;
  }

  private calculateMomentum(timeSeriesData: Array<{date: string, score: number}>, targetDate: string): {value: number, category: string} | null {
    const lookbackDays = this.config.trend.momentum.lookbackDays;
    const currentIndex = timeSeriesData.findIndex(d => d.date === targetDate);
    
    if (currentIndex < lookbackDays) return null;
    
    const currentScore = timeSeriesData[currentIndex].score;
    const pastScore = timeSeriesData[currentIndex - lookbackDays].score;
    
    if (pastScore === 0) return null;
    
    // ROC（Rate of Change）計算
    const momentum = ((currentScore - pastScore) / pastScore) * 100;
    
    // カテゴリ分類（基本マトリクス用3段階）
    let category: string;
    const thresholds = this.config.trend.momentum.thresholds;
    
    if (momentum >= thresholds.positive) {
      category = 'POSITIVE';
    } else if (momentum > thresholds.negative) {
      category = 'NEUTRAL';
    } else {
      category = 'NEGATIVE';
    }
    
    return {
      value: Math.round(momentum * 10) / 10,
      category
    };
  }

  private calculateVolatility(timeSeriesData: Array<{date: string, score: number}>): {value: number, level: string, bandPosition: number} | null {
    const period = this.config.trend.volatility.period;
    
    if (timeSeriesData.length < period + 1) return null;
    
    // True Range計算
    const trueRanges: number[] = [];
    for (let i = 1; i < timeSeriesData.length; i++) {
      const tr = Math.abs(timeSeriesData[i].score - timeSeriesData[i - 1].score);
      trueRanges.push(tr);
    }
    
    if (trueRanges.length < period) return null;
    
    // EMAによるATR計算
    const alpha = this.config.trend.volatility.emaAlpha;
    let atr = trueRanges[0];
    const volatilityHistory: number[] = [atr];
    
    for (let i = 1; i < trueRanges.length; i++) {
      atr = alpha * trueRanges[i] + (1 - alpha) * atr;
      volatilityHistory.push(atr);
    }
    
    const currentVolatility = volatilityHistory[volatilityHistory.length - 1];
    
    // ボリンジャーバンド計算
    const bands = this.calculateVolatilityBands(volatilityHistory);
    
    // レベル分類
    let level = 'MODERATE';
    let bandPosition = 0;
    
    if (bands) {
      if (currentVolatility > bands.upper) {
        level = 'HIGH';
      } else if (currentVolatility < bands.lower) {
        level = 'LOW';
      }
      
      // 標準化位置（-2.0 to +2.0）
      bandPosition = (currentVolatility - bands.middle) / bands.stdDev;
      bandPosition = Math.max(-2.0, Math.min(2.0, bandPosition));
    }
    
    return {
      value: Math.round(currentVolatility * 100) / 100,
      level: level as 'LOW' | 'MODERATE' | 'HIGH',
      bandPosition: Math.round(bandPosition * 100) / 100
    };
  }

  private calculateVolatilityBands(volatilityHistory: number[]): {upper: number, middle: number, lower: number, stdDev: number} | null {
    const period = this.config.trend.volatility.bollinger.period;
    const stdDevMultiplier = this.config.trend.volatility.bollinger.stdDevMultiplier;
    
    if (volatilityHistory.length < period) return null;
    
    // 最新period期間のデータ
    const recentData = volatilityHistory.slice(-period);
    
    // SMA計算
    const sma = recentData.reduce((sum, val) => sum + val, 0) / period;
    
    // 標準偏差計算
    const variance = recentData.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * stdDevMultiplier),
      middle: sma,
      lower: sma - (stdDev * stdDevMultiplier),
      stdDev
    };
  }

  private determineTrendStateKey(ucrScore: number, momentumCategory: string): string {
    // UCRレベル判定
    let level: string;
    if (ucrScore >= 85) {
      level = 'HIGH';
    } else if (ucrScore >= 65) {
      level = 'MEDIUM';
    } else {
      level = 'LOW';
    }
    
    return `${level}_${momentumCategory}`;
  }

  private getTrendStateName(stateKey: string): string {
    const stateMap: {[key: string]: string} = {
      'HIGH_POSITIVE': 'スーパーコンペンセーション/ピーキング',
      'HIGH_NEUTRAL': '安定した適応',
      'HIGH_NEGATIVE': '疲労の兆候/早期テーパー',
      'MEDIUM_POSITIVE': '生産的なリバウンド',
      'MEDIUM_NEUTRAL': '均衡状態',
      'MEDIUM_NEGATIVE': '機能的オーバーリーチング',
      'LOW_POSITIVE': '回復進行中',
      'LOW_NEUTRAL': '停滞した疲労',
      'LOW_NEGATIVE': '急性不適応/高リスク'
    };
    
    return stateMap[stateKey] || '均衡状態';
  }

  private getTrendStateCode(stateKey: string): number {
    const codeMap: {[key: string]: number} = {
      'HIGH_POSITIVE': 1,
      'HIGH_NEUTRAL': 2,
      'HIGH_NEGATIVE': 3,
      'MEDIUM_POSITIVE': 4,
      'MEDIUM_NEUTRAL': 5,
      'MEDIUM_NEGATIVE': 6,
      'LOW_POSITIVE': 7,
      'LOW_NEUTRAL': 8,
      'LOW_NEGATIVE': 9
    };
    
    return codeMap[stateKey] || 5;
  }

  private generateInterpretation(ucrScore: number, momentum: number, volatility: number, volatilityLevel: string, trendState: string): string {
    // ボラティリティレベルに応じた詳細な解釈マトリクス（GAS版から移植）
    const volatilityInterpretations: {[key: string]: {[key: string]: {assessment: string, detail: string}}} = {
      'スーパーコンペンセーション/ピーキング': {
        LOW: {
          assessment: '理想的なピーキング',
          detail: '適応プロセスが非常に安定しており、パフォーマンスの再現性が高い。自信を持ってレースに臨める状態。'
        },
        MODERATE: {
          assessment: '良好なピーキング',
          detail: '準備状態は高く、上昇傾向にあり、変動も平常範囲内。計画通りのパフォーマンスが期待できる。'
        },
        HIGH: {
          assessment: '不安定なピーク',
          detail: 'スコアは高いが日々の変動が大きく、コンディションが脆い可能性。ピークが持続しない、またはレース当日に下振れするリスクを考慮。'
        }
      },
      '安定した適応': {
        LOW: {
          assessment: '真の安定',
          detail: '持続可能な好調状態。現在のトレーニング負荷が適切であることの強い証拠。'
        },
        MODERATE: {
          assessment: '標準的な安定状態',
          detail: '高い準備状態を維持できている。日々の多少の変動は正常な反応の範囲内。'
        },
        HIGH: {
          assessment: '見せかけの安定',
          detail: '平均スコアは高いが、コンディションは不安定。いつ崩れてもおかしくない状態。トレーニング外のストレス要因を調査する必要がある。'
        }
      },
      '疲労の兆候/早期テーパー': {
        LOW: {
          assessment: '計画的な下降',
          detail: '負荷は高いが、身体は一貫して反応している。計画的なテーパーの初期段階である可能性。ただし、下降トレンドの継続には注意。'
        },
        MODERATE: {
          assessment: '標準的な疲労の兆候',
          detail: 'スコアが下降しており、変動も平常範囲内。典型的な疲労蓄積のサイン。負荷のモニタリングと調整が必要。'
        },
        HIGH: {
          assessment: '危険な下降',
          detail: 'スコアの下降に加え日々の変動も大きく、急速な不適応状態に陥っている可能性が高い。非機能的オーバーリーチングへの移行リスクが非常に高い。即時介入が必要。'
        }
      },
      '生産的なリバウンド': {
        LOW: {
          assessment: '信頼性の高い回復',
          detail: '回復プロセスが安定しており、順調な適応が進んでいる。トレーニング負荷を徐々に戻していくのに最適な状態。'
        },
        MODERATE: {
          assessment: '標準的な回復',
          detail: '疲労から順調に回復している。日々の変動は正常な回復プロセスの一部。計画通り負荷を戻して良い。'
        },
        HIGH: {
          assessment: '不安定な回復',
          detail: '回復傾向にはあるが、プロセスが不安定。回復を妨げる要因がないか確認し、負荷を戻すのはより慎重に行うべき。'
        }
      },
      '均衡状態': {
        LOW: {
          assessment: '安定したベースライン',
          detail: '良くも悪くも安定している。ベーストレーニングを継続するのに適している。'
        },
        MODERATE: {
          assessment: '典型的な均衡状態',
          detail: '標準的な準備状態と標準的な変動。トレーニング負荷と回復が釣り合っている状態。'
        },
        HIGH: {
          assessment: '潜在的な不安定性',
          detail: '平均的には均衡しているが、日々のコンディションは揺れている。トレーニング外の要因が影響しているか、現在のトレーニング負荷が微妙に合っていない可能性を示唆。'
        }
      },
      '機能的オーバーリーチング': {
        LOW: {
          assessment: '計画通りの過負荷',
          detail: '身体はストレス下にあるが、一貫した形で対応できている。その後の超回復が期待できる、質の高い過負荷状態。'
        },
        MODERATE: {
          assessment: '標準的な過負荷',
          detail: '計画的な過負荷に対する正常な反応。身体はストレス下にあるが、平常の範囲内で対応できている。'
        },
        HIGH: {
          assessment: '非機能的への移行リスク',
          detail: '身体の適応能力を超えている危険なサイン。即時の負荷軽減や回復措置を検討すべき。'
        }
      },
      '回復進行中': {
        LOW: {
          assessment: '着実な回復',
          detail: '底を打ち、安定した軌道で回復している。良い兆候。回復を継続することが重要。'
        },
        MODERATE: {
          assessment: '標準的な回復初期',
          detail: '回復軌道に乗っているが、まだ多少の変動はある。正常なプロセス。高強度は引き続き避ける。'
        },
        HIGH: {
          assessment: '不安定な回復の初期段階',
          detail: '回復に向かい始めたが、まだ非常に不安定。少しの追加ストレスで再び悪化するリスクがある。完全な回復を最優先すべき。'
        }
      },
      '停滞した疲労': {
        LOW: {
          assessment: '慢性疲労/デッドロック',
          detail: '回復が完全に停滞し、低い状態で安定してしまっている。トレーニング刺激の根本的な見直しや長期的な休養が必要な可能性。'
        },
        MODERATE: {
          assessment: '標準的な停滞',
          detail: '低い準備状態が続いている。回復を妨げている要因を特定し、排除することに集中する必要がある。'
        },
        HIGH: {
          assessment: '回復の阻害',
          detail: '回復しようとする力と、それを妨げる要因（継続的なストレス、病気の初期段階など）がせめぎ合っている状態。トレーニング外の要因を徹底的に調査する必要がある。'
        }
      },
      '急性不適応/高リスク': {
        LOW: {
          assessment: '一貫した悪化',
          detail: '（この状態での低ボラティリティは稀だが）身体が一貫して悪化の一途をたどっている非常に危険な状態。オーバートレーニング症候群など、深刻な状態の可能性。'
        },
        MODERATE: {
          assessment: '悪化進行中',
          detail: '準備状態は低く、さらに悪化しており、変動も平常範囲内。明確なネガティブトレンド。トレーニングの大幅な削減が必要。'
        },
        HIGH: {
          assessment: '制御不能な悪化',
          detail: 'スコアは低く、下降しており、さらに日々の変動も大きい。身体が完全に恒常性を失っている状態。トレーニングの中止と専門家への相談が必須。'
        }
      }
    };

    // 基本情報の構築
    let baseInfo = `UCRスコア${ucrScore}点`;
    
    if (momentum !== null && momentum !== undefined) {
      const momentumStr = momentum >= 0 ? `+${momentum}` : `${momentum}`;
      baseInfo += `で過去7日間${momentumStr}%${momentum >= 0 ? 'の上昇' : 'の下降'}。`;
    } else {
      baseInfo += '（モメンタム計算不可）。';
    }
    
    // ボラティリティレベルに応じた解釈を取得
    const stateInterpretations = volatilityInterpretations[trendState];
    if (!stateInterpretations) {
      return `${baseInfo}『${trendState}』`;
    }
    
    const levelInterpretation = stateInterpretations[volatilityLevel] || stateInterpretations['MODERATE'];
    
    // ボラティリティ情報の追加
    let volatilityInfo = '';
    if (volatilityLevel === 'HIGH') {
      volatilityInfo = `ボラティリティが統計的に有意に高い状態（${volatility}）。`;
    } else if (volatilityLevel === 'LOW') {
      volatilityInfo = `ボラティリティが統計的に有意に低く安定（${volatility}）。`;
    }
    
    // 最終的な解釈テキストの構築
    return `${baseInfo}『${trendState}』の状態で、${levelInterpretation.assessment}。${volatilityInfo}${levelInterpretation.detail}`;
  }

  // ユーティリティ関数
  private calculateMean(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length <= 1) return 0.1;
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
  
  private detectParasympatheticSaturation(currentHRV: number, currentRHR: number, baselines: BaselineData): boolean {
    const lnCurrentHRV = Math.log(currentHRV);
    return lnCurrentHRV < (baselines.hrv.mean60 - this.config.hrv.sensitivityFactor * baselines.hrv.sd60) &&
           currentRHR < baselines.rhr.mean30;
  }
  
  private evaluateDataQuality(baselines: BaselineData, historical: WellnessData[]): { confidence: string; quality?: any } {
    const hrvDays = baselines.hrv.dataCount;
    const rhrDays = baselines.rhr.dataCount;
    
    let confidence = 'high';
    let message = '';
    
    if (hrvDays < 30 || rhrDays < 30) {
      confidence = 'low';
      message = `Limited historical data (${Math.min(hrvDays, rhrDays)} days). Accuracy will improve with more data.`;
    } else if (hrvDays < 60) {
      confidence = 'medium';
      message = `Moderate historical data (${hrvDays} days).`;
    }
    
    return {
      confidence,
      quality: message ? {
        hrvDays,
        rhrDays,
        message
      } : undefined
    };
  }
}