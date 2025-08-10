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

  // intervals.icu wellness scale conversion (1-5 → 1-5)
  // intervals.icu: 1=good, 5=bad -> internal: 1=bad, 5=good
  private readonly WELLNESS_CONVERSION: {[key: string]: {[key: number]: number}} = {
    'fatigue': { 1: 5, 2: 4, 3: 2, 4: 1, 5: 1 },
    'soreness': { 1: 5, 2: 4, 3: 3, 4: 1, 5: 1 },
    'stress': { 1: 5, 2: 4, 3: 2, 4: 1, 5: 1 },
    'motivation': { 1: 5, 2: 4, 3: 3, 4: 1, 5: 1 },
    'mood': { 1: 5, 2: 4, 3: 3, 4: 1, 5: 1 },
    'injury': { 1: 5, 2: 4, 3: 3, 4: 1, 5: 1 }
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
    
    // 重み付き平均を計算
    // intervals.icuでは1が最良、5が最悪なので、5から引いて反転してから正規化
    const weightedSum = 
      ((5 - fatigue) / 4) * this.weights.fatigue +
      ((5 - stress) / 4) * this.weights.stress +
      ((5 - motivation) / 4) * this.weights.motivation +
      ((5 - mood) / 4) * this.weights.mood;
    
    // データの欠損ペナルティを計算
    const missingDataPenalty = this.calculateMissingDataPenalty(subjectiveData);
    
    // 最終スコアを計算（0-20点の範囲で）
    const finalScore = this.config.scoreWeights.subjective * weightedSum * (1 - missingDataPenalty);
    
    return Math.max(0, Math.min(this.config.scoreWeights.subjective, finalScore));
  }

  /**
   * ウェルネスデータを内部形式に変換
   */
  convertSubjectiveData(current: WellnessData): SubjectiveData {
    return {
      fatigue: this.convertWellnessScale(current.fatigue, 'fatigue'),
      soreness: this.convertWellnessScale(current.soreness, 'soreness'),
      stress: this.convertWellnessScale(current.stress, 'stress'),
      motivation: this.convertWellnessScale(current.motivation, 'motivation'),
      mood: this.convertWellnessScale(current.mood, 'mood'),
      injury: this.convertWellnessScale(current.injury, 'injury'),
      alcohol: current.alcohol || 0
    };
  }

  /**
   * intervals.icuスケールを内部スケールに変換
   */
  private convertWellnessScale(icuValue: number | undefined, fieldType: string): number | null {
    if (icuValue === undefined || icuValue === null) {
      return null;
    }
    
    // intervals.icuの値をそのまま返す（calculateメソッドで変換）
    return icuValue;
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