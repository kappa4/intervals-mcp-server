/**
 * UCR (Unified Continuous Readiness) 計算のTypeScript型定義
 * calcReadinessのGAS実装からの移植用
 */

// ========================================
// 基本データ型
// ========================================

export interface WellnessData {
  date: string;
  hrv?: number;
  rhr?: number;
  sleepScore?: number;
  sleepHours?: number;
  sleepQuality?: number;
  weight?: number;
  // intervals.icu 主観的データ (1-4 scale, 1=good, 4=bad)
  fatigue?: number;
  soreness?: number;
  stress?: number;
  motivation?: number;
  injury?: number;
  // 内部変換後データ (1-5 scale, 1=bad, 5=good)
  fatigueConverted?: number;
  sorenessConverted?: number;
  stressConverted?: number;
  motivationConverted?: number;
  injuryConverted?: number;
  alcohol?: number; // 0=none, 1=light, 2=heavy
}

export interface UCRCalculationInput {
  current: WellnessData;
  historical: WellnessData[];
}

// ========================================
// UCR計算結果
// ========================================

export interface UCRComponents {
  hrv: number;    // 0-40
  rhr: number;    // 0-20
  sleep: number;  // 0-20
  subjective: number; // 0-20
}

export interface ModifierDetail {
  applied: boolean;
  value: number;
  reason: string;
}

export interface UCRModifiers {
  alcohol?: ModifierDetail;
  muscleSoreness?: ModifierDetail;
  injury?: ModifierDetail;
  motivation?: ModifierDetail;
  sleepDebt?: ModifierDetail;
}

export interface UCRResult {
  score: number;           // 0-100
  baseScore: number;       // 修正前スコア
  components: UCRComponents;
  modifiers?: UCRModifiers;
  multiplier?: number;     // 累積修正係数
  recommendation: TrainingRecommendation;
  baselines?: BaselineData;
  confidence?: string;     // high, medium, low
  trainingRecommendation?: string; // テスト互換性のため
  dataQuality?: {
    hrvDays: number;
    rhrDays: number;
    message: string;
  };
  debugInfo?: {
    parasympatheticSaturation?: boolean;
    [key: string]: any;
  };
}

// ========================================
// トレンド分析
// ========================================

export interface TrendResult {
  momentum: number;           // 7日間ROC (%)
  volatility: number;         // 14日間ATR
  volatilityLevel: 'LOW' | 'MODERATE' | 'HIGH';
  volatilityBandPosition: number; // -2.0 to +2.0
  trendState: string;         // 9つの状態文字列
  trendStateCode: number;     // 1-9の数値コード
  interpretation: string;     // 27ステート解釈
}

export interface UCRWithTrend extends UCRResult {
  trend?: TrendResult;
}

// ========================================
// ベースライン計算
// ========================================

export interface BaselineData {
  hrv: {
    mean60: number;     // 60日平均 (ln変換済み)
    sd60: number;       // 60日標準偏差
    mean7: number;      // 7日移動平均
    dataCount: number;
    isValid: boolean;
  };
  rhr: {
    mean30: number;     // 30日平均
    sd30: number;       // 30日標準偏差
    dataCount: number;
    isValid: boolean;
  };
}

// ========================================
// 推奨事項
// ========================================

export interface TrainingRecommendation {
  threshold: number;
  name: 'プライム' | '中程度' | '低い';
  color: string;
  description: string;
  action: string;
  approach: string;
  examples: string;
}

// ========================================
// intervals.icu統合用
// ========================================

export interface IntervalsIcuWellnessUpdate {
  // 基本ウェルネスフィールド
  readiness?: number;
  
  // UCRトレンドカスタムフィールド (Pascal case)
  UCRMomentum?: number;
  UCRVolatility?: number;
  UCRVolatilityLevel?: string;
  UCRVolatilityBandPosition?: number;
  UCRTrendState?: number;        // 1-9の数値コード
  UCRTrendInterpretation?: string;
  
  // 主観的データ (intervals.icu format: 1-4)
  fatigue?: number;
  soreness?: number;
  stress?: number;
  motivation?: number;
  injury?: number;
}

// ========================================
// 設定
// ========================================

export interface UCRConfig {
  hrv: {
    baselineDays: number;
    rollingDays: number;
    sensitivityFactor: number;
    sigmoid: {
      k: number;
      c: number;
      saturationZ: number;
    };
  };
  rhr: {
    baselineDays: number;
    thresholdSd: number;
    linear: {
      baseline: number;
      slope: number;
    };
  };
  sleep: {
    minHours: number;
    targetHours: number;
    debtDays: number;
  };
  scoreWeights: {
    hrv: number;
    rhr: number;
    sleep: number;
    subjective: number;
  };
  penalties: {
    alcoholLight: number;
    alcoholHeavy: number;
    muscleSorenessSevere: number;
    musclesorenessModerate: number;
    sleepDebt: number;
    injuryModerate: number;
    injuryLight: number;
    motivationLow: number;
  };
  trend: {
    momentum: {
      lookbackDays: number;
      thresholds: {
        strongPositive: number;
        positive: number;
        negative: number;
        strongNegative: number;
      };
    };
    volatility: {
      period: number;
      emaAlpha: number;
      bollinger: {
        period: number;
        stdDevMultiplier: number;
      };
    };
    minDataPoints: number;
  };
}

// ========================================
// ウェルネスデータ変換
// ========================================

export interface WellnessConversionMap {
  [fieldType: string]: {
    [icuValue: number]: number; // intervals.icu 1-4 → internal 1-5
  };
}

export interface DefaultWellnessValues {
  [fieldType: string]: number;
}

// ========================================
// エラーと検証
// ========================================

export interface UCRValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface UCRCalculationOptions {
  includeDebugInfo?: boolean;
  skipTrendAnalysis?: boolean;
  customConfig?: Partial<UCRConfig>;
}