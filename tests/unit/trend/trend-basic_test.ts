/**
 * UCRトレンド分析機能の基本テスト
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { UCRCalculator } from '../../../ucr-calculator.ts';
import { WellnessData, UCRWithTrend } from '../../../ucr-types.ts';

Deno.test("UCR Trend Analysis - Basic Functionality", async (t) => {
  const calculator = new UCRCalculator();

  // テスト用時系列データ生成
  const generateTestData = (days: number = 20): WellnessData[] => {
    const data: WellnessData[] = [];
    const startDate = new Date('2024-01-01');
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        hrv: 50 + i * 0.5, // 緩やかな上昇
        rhr: 60 - i * 0.1, // 緩やかな下降
        sleepScore: 80,
        sleepHours: 7.5,
        fatigue: 2,
        soreness: 2,
        stress: 2,
        motivation: 2
      });
    }
    
    return data;
  };

  await t.step("should calculate trend analysis with sufficient data", () => {
    const testData = generateTestData(20);
    const result = calculator.calculateWithTrends({
      current: testData[19],
      historical: testData
    });
    
    assertExists(result.trend, "トレンド分析結果が存在する");
    assertExists(result.trend.momentum, "モメンタムが計算される");
    assertExists(result.trend.volatility, "ボラティリティが計算される");
    assertExists(result.trend.trendState, "トレンドステートが判定される");
    assertExists(result.trend.trendStateCode, "トレンドステートコードが設定される");
    assertExists(result.trend.interpretation, "解釈が生成される");
  });

  await t.step("should respect configuration parameters", () => {
    const config = calculator.getConfig();
    
    assertEquals(config.trend.momentum.lookbackDays, 7, "モメンタムlookback = 7日");
    assertEquals(config.trend.volatility.period, 14, "ボラティリティperiod = 14日");
    assertEquals(config.trend.volatility.emaAlpha, 2 / (14 + 1), "EMA alpha = 2/(n+1)");
    assertEquals(config.trend.volatility.bollinger.period, 20, "ボリンジャーバンド = 20期間");
    assertEquals(config.trend.volatility.bollinger.stdDevMultiplier, 1.5, "標準偏差倍率 = 1.5");
  });

  await t.step("should handle insufficient data gracefully", () => {
    const insufficientData = generateTestData(5); // 最小データ点数未満
    const result = calculator.calculateWithTrends({
      current: insufficientData[4],
      historical: insufficientData
    });
    
    assertExists(result.trend, "データ不足でもトレンド結果は返される");
    assertEquals(result.trend.momentum, 0, "データ不足時はモメンタム0");
    assertEquals(result.trend.volatility, 0, "データ不足時はボラティリティ0");
    assertEquals(result.trend.trendStateCode, 5, "データ不足時は均衡状態");
  });

  await t.step("should generate meaningful interpretation", () => {
    const testData = generateTestData(20);
    const result = calculator.calculateWithTrends({
      current: testData[19],
      historical: testData
    });
    
    assertExists(result.trend?.interpretation);
    assertEquals(result.trend.interpretation.includes('UCRスコア'), true, "UCRスコアが含まれる");
    assertEquals(result.trend.interpretation.length > 20, true, "意味のある長さの解釈テキスト");
  });
});