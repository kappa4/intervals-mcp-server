/**
 * Baseline Data Converter
 * BaselineDataの互換性を保つためのユーティリティ
 */

import { BaselineData } from '../ucr-types.ts';

/**
 * BaselineDataにエイリアスプロパティを追加
 * 既存のコードとの互換性を保ちながら、新しいプロパティ名でもアクセス可能にする
 */
export function enrichBaselineData(baseline: BaselineData): BaselineData {
  // HRVのエイリアスを設定
  if (baseline.hrv) {
    baseline.hrv.mean = baseline.hrv.mean60;
    baseline.hrv.stdDev = baseline.hrv.sd60;
    baseline.hrv.count = baseline.hrv.dataCount;
  }
  
  // RHRのエイリアスを設定
  if (baseline.rhr) {
    baseline.rhr.mean = baseline.rhr.mean30;
    baseline.rhr.stdDev = baseline.rhr.sd30;
    baseline.rhr.count = baseline.rhr.dataCount;
  }
  
  return baseline;
}

/**
 * 新しい形式から既存の形式へ変換
 * リファクタリングされたコードから既存のコードへデータを渡す際に使用
 */
export function createBaselineData(
  hrv: { mean: number; stdDev: number; count: number; mean7?: number },
  rhr: { mean: number; stdDev: number; count: number }
): BaselineData {
  return {
    hrv: {
      mean60: hrv.mean,
      sd60: hrv.stdDev,
      mean7: hrv.mean7 || hrv.mean,  // mean7がなければmeanを使用
      dataCount: hrv.count,
      isValid: hrv.count > 0,
      // エイリアスも設定
      mean: hrv.mean,
      stdDev: hrv.stdDev,
      count: hrv.count
    },
    rhr: {
      mean30: rhr.mean,
      sd30: rhr.stdDev,
      dataCount: rhr.count,
      isValid: rhr.count > 0,
      // エイリアスも設定
      mean: rhr.mean,
      stdDev: rhr.stdDev,
      count: rhr.count
    }
  };
}