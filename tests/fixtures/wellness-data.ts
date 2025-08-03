/**
 * UCRテスト用ウェルネスデータフィクスチャ
 * calcReadinessの実データパターンを参考に作成
 */

import type { 
  WellnessData, 
  UCRCalculationInput, 
  DefaultWellnessValues 
} from "../../ucr-types.ts";
import { TestDateGenerator } from "../helpers/test-setup.ts";

/**
 * デフォルトのウェルネス値（intervals.icu形式）
 * intervals.icu形式: 1=良好, 4=悪い
 */
export const DEFAULT_WELLNESS_VALUES: DefaultWellnessValues = {
  'fatigue': 1,      // 疲労なし（fresh）
  'soreness': 1,     // 痛みなし
  'stress': 1,       // ストレスなし（relaxed）
  'motivation': 1,   // 高いモチベーション
  'injury': 1        // ケガなし
};

/**
 * 基本的な健康的アスリートのデータ
 */
export function createHealthyAthleteData(date: string = "2025-08-01"): UCRCalculationInput {
  const historical: WellnessData[] = [];
  
  // 60日分の履歴データ生成
  for (let i = 60; i >= 1; i--) {
    historical.push({
      date: TestDateGenerator.getDaysAgo(i, new Date(date)),
      hrv: 45 + Math.sin(i / 7) * 5,  // 40-50のレンジで周期的変動
      rhr: 55 + Math.cos(i / 5) * 3,  // 52-58のレンジで変動
      sleepScore: 85 + Math.sin(i / 3) * 10,  // 75-95のレンジ
      sleepHours: 7 + Math.sin(i / 4) * 1,    // 6-8時間
      ...DEFAULT_WELLNESS_VALUES
    });
  }

  return {
    current: {
      date,
      hrv: 48,
      rhr: 54,
      sleepScore: 88,
      sleepHours: 7.5,
      ...DEFAULT_WELLNESS_VALUES
    },
    historical
  };
}

/**
 * 副交感神経飽和状態のデータ
 * 低HRV + 低RHRの組み合わせ
 */
export function createParasympatheticSaturationData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      hrv: 30,  // 非常に低いHRV（平均45から大幅に低下）
      rhr: 42,  // 非常に低いRHR（平均55から大幅に低下）
      sleepScore: 92,  // 良好な睡眠
      fatigue: 1,      // 疲労感なし
      stress: 1        // ストレスなし
    }
  };
}

/**
 * 睡眠負債が蓄積した状態のデータ
 * 3日連続で睡眠不足
 */
export function createSleepDebtData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  const historical = [...baseData.historical];
  
  // 直近3日間を睡眠不足に変更
  for (let i = 0; i < 3; i++) {
    const index = historical.length - 1 - i;
    historical[index] = {
      ...historical[index],
      sleepHours: 4.0  // 目標5.5時間に対して1.5時間の負債
    };
  }

  return {
    current: {
      ...baseData.current,
      sleepHours: 8.0  // 今日は十分な睡眠を取った
    },
    historical
  };
}

/**
 * 低モチベーション状態のデータ
 */
export function createLowMotivationData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      motivation: 2  // 低いモチベーション（0.9倍の修正子が適用される）
    }
  };
}

/**
 * 軽度のケガがある状態のデータ
 */
export function createMinorInjuryData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      injury: 3  // 軽度のケガ（内部値3）
    }
  };
}

/**
 * 重度のケガがある状態のデータ
 */
export function createSevereInjuryData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      injury: 1  // 重度のケガ（内部値1）
    }
  };
}

/**
 * アルコール摂取ありの状態のデータ
 */
export function createAlcoholConsumedData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      alcohol: 1
    }
  };
}

/**
 * 高ストレス状態のデータ
 */
export function createHighStressData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      hrv: 35,       // ストレスによるHRV低下
      rhr: 62,       // ストレスによるRHR上昇
      stress: 1,     // 高ストレス
      fatigue: 2,    // 疲労増加
      sleepScore: 72 // 睡眠の質低下
    }
  };
}

/**
 * 完全回復状態のデータ
 */
export function createFullyRecoveredData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      hrv: 58,        // 高いHRV
      rhr: 48,        // 低いRHR
      sleepScore: 95, // 優れた睡眠
      sleepHours: 9,  // 十分な睡眠時間
      fatigue: 5,     // 疲労なし
      soreness: 5,    // 筋肉痛なし
      stress: 5,      // ストレスなし
      motivation: 5   // 高いモチベーション
    }
  };
}

/**
 * エッジケース：データ不足（30日未満）
 */
export function createInsufficientData(): UCRCalculationInput {
  const historical: WellnessData[] = [];
  
  // 20日分のデータのみ
  for (let i = 20; i >= 1; i--) {
    historical.push({
      date: TestDateGenerator.getDaysAgo(i),
      hrv: 45,
      rhr: 55,
      sleepScore: 85,
      ...DEFAULT_WELLNESS_VALUES
    });
  }

  return {
    current: {
      date: "2025-08-01",
      hrv: 45,
      rhr: 55,
      sleepScore: 85,
      ...DEFAULT_WELLNESS_VALUES
    },
    historical
  };
}

/**
 * エッジケース：極端な値
 */
export function createExtremeValuesData(): UCRCalculationInput {
  const baseData = createHealthyAthleteData();
  
  return {
    ...baseData,
    current: {
      ...baseData.current,
      hrv: 150,       // 異常に高いHRV
      rhr: 30,        // 異常に低いRHR
      sleepScore: 100,// 完璧な睡眠スコア
      sleepHours: 12, // 非常に長い睡眠
      fatigue: 1,     // 極度の疲労
      soreness: 1,    // 極度の筋肉痛
      stress: 1,      // 極度のストレス
      motivation: 1,  // 極度の低モチベーション
      injury: 1,      // 重度のケガ
      alcohol: 1   // アルコール摂取あり
    }
  };
}