/**
 * Subjective Score Calculator
 * 主観的ウェルネススコアの計算を担当
 */

import { WellnessData } from '../ucr-types.ts';
import { 
  UCR_CALCULATOR_CONFIG, 
  UCR_SUBJECTIVE_WEIGHTS, 
  UCR_SUBJECTIVE_DEFAULTS 
} from '../ucr-config.ts';

// 主観的データの型定義
export interface SubjectiveData {
  fatigue: number | null;
  stress: number | null;
  motivation: number | null;
  mood: number | null;
  soreness: number | null;
  injury: number | null;
  alcohol: number;
}

export class SubjectiveScoreCalculator {
  private config = UCR_CALCULATOR_CONFIG;
  private weights = UCR_SUBJECTIVE_WEIGHTS;
  private defaults = UCR_SUBJECTIVE_DEFAULTS;

  // intervals.icu wellness scale conversion (1-4 → 0-1 normalized)
  // intervals.icu: 1=best, 4=worst -> normalized: 0-1 score
  private readonly WELLNESS_CONVERSION: {[key: string]: {[key: number]: number}} = {
    'fatigue': { 
      1: 1.0,   // 最良 → 100%
      2: 0.75,  // 普通 → 75%
      3: 0.4,   // やや悪い → 40%
      4: 0.0    // 悪い → 0%
    },
    'stress': { 
      1: 1.0,   // 最良 → 100%
      2: 0.75,  // 普通 → 75%
      3: 0.4,   // やや悪い → 40%
      4: 0.0    // 悪い → 0%
    },
    'mood': { 
      1: 1.0,   // 最良 → 100%
      2: 0.85,  // 良い → 85%
      3: 0.7,   // 普通 → 70%
      4: 0.0    // 悪い → 0%
    },
    'motivation': { 
      1: 1.0,   // 最良 → 100%
      2: 0.85,  // 高い → 85%
      3: 0.7,   // 普通 → 70%
      4: 0.0    // 低い → 0%
    },
    'soreness': {
      1: 0.0,   // 重度 → 0%
      2: 0.75,  // 普通 → 75%
      3: 0.9,   // 軽度 → 90%
      4: 1.0    // なし → 100%
    },
    'injury': {
      1: 0.0,   // 重大 → 0%
      2: 0.3,   // 軽度 → 30%
      3: 0.6,   // 違和感 → 60%
      4: 1.0    // なし → 100%
    }
  };

  /**
   * 主観的スコアを計算（4指標の重み付き平均）
   */
  calculate(subjectiveData: SubjectiveData): number {
    // 各主観的指標のスコアを計算（データがない場合はデフォルト値を使用）
    const fatigue = subjectiveData.fatigue ?? this.defaults.fatigue;
    const stress = subjectiveData.stress ?? this.defaults.stress;
    const motivation = subjectiveData.motivation ?? this.defaults.motivation;
    const mood = subjectiveData.mood ?? this.defaults.mood;
    
    // 変換マップを使用して正規化値を取得
    const convertedFatigue = this.convertWellnessScale(fatigue, 'fatigue') ?? 0.75;
    const convertedStress = this.convertWellnessScale(stress, 'stress') ?? 0.75;
    const convertedMotivation = this.convertWellnessScale(motivation, 'motivation') ?? 0.7;
    const convertedMood = this.convertWellnessScale(mood, 'mood') ?? 0.7;
    
    // 重み付き平均を計算（変換後の0-1値を使用）
    const weightedSum = 
      convertedFatigue * this.weights.fatigue +
      convertedStress * this.weights.stress +
      convertedMotivation * this.weights.motivation +
      convertedMood * this.weights.mood;
    
    // データの欠損ペナルティを計算
    const missingDataPenalty = this.calculateMissingDataPenalty(subjectiveData);
    
    // 最終スコアを計算（0-20点の範囲で）
    const finalScore = this.config.scoreWeights.subjective * weightedSum * (1 - missingDataPenalty);
    
    return Math.max(0, Math.min(this.config.scoreWeights.subjective, finalScore));
  }

  /**
   * ウェルネスデータを内部形式に変換
   * NOTE: 生の値を保持（変換はcalculateメソッド内で行う）
   */
  convertSubjectiveData(current: WellnessData): SubjectiveData {
    return {
      fatigue: current.fatigue ?? null,
      soreness: current.soreness ?? null,
      stress: current.stress ?? null,
      motivation: current.motivation ?? null,
      mood: current.mood ?? null,
      injury: current.injury ?? null,
      alcohol: current.alcohol || 0
    };
  }

  /**
   * intervals.icuスケール（1-4）を正規化値（0-1）に変換
   */
  private convertWellnessScale(icuValue: number | undefined | null, fieldType: string): number | null {
    if (icuValue === undefined || icuValue === null) {
      return null;
    }
    
    const conversionMap = this.WELLNESS_CONVERSION[fieldType];
    if (!conversionMap) {
      // 変換マップがない場合はそのまま返す
      return icuValue;
    }
    
    // 小数点の値は四捨五入して整数にしてから変換
    const roundedValue = Math.round(icuValue);
    // 範囲外の値は最も近い有効な値にクリップ
    const clippedValue = Math.max(1, Math.min(4, roundedValue));
    
    return conversionMap[clippedValue] ?? null;
  }

  /**
   * 欠損データペナルティを計算
   */
  private calculateMissingDataPenalty(subjectiveData: SubjectiveData): number {
    let missingCount = 0;
    
    if (subjectiveData.fatigue === null || subjectiveData.fatigue === undefined) missingCount++;
    if (subjectiveData.stress === null || subjectiveData.stress === undefined) missingCount++;
    if (subjectiveData.motivation === null || subjectiveData.motivation === undefined) missingCount++;
    if (subjectiveData.mood === null || subjectiveData.mood === undefined) missingCount++;
    
    // 欠損データがある場合は軽微なペナルティを適用（1項目あたり5%減）
    return missingCount * 0.05;
  }
}