/**
 * UCR統合用のintervals.icu APIクライアント拡張
 * 既存のIntervalsAPIClientを拡張してUCR計算に必要な機能を追加
 */

import { IntervalsAPIClient } from "./intervals-client.ts";
import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import { UCRCalculator } from "./ucr-calculator.ts";
import type {
  IntervalsWellness,
  IntervalsAPIOptions,
} from "./intervals-types.ts";
import type {
  WellnessData,
  UCRCalculationInput,
  UCRWithTrend,
  IntervalsIcuWellnessUpdate,
  WellnessConversionMap,
  DefaultWellnessValues,
} from "./ucr-types.ts";

// intervals.icu wellness scale conversion (1-4 → 1-5)
const WELLNESS_CONVERSION: WellnessConversionMap = {
  'fatigue': { 1: 5, 2: 4, 3: 2, 4: 1 },
  'soreness': { 1: 5, 2: 4, 3: 3, 4: 1 },
  'stress': { 1: 5, 2: 4, 3: 2, 4: 1 },
  'motivation': { 1: 5, 2: 4, 3: 3, 4: 1 },
  'injury': { 1: 5, 2: 4, 3: 3, 4: 1 }
};

const DEFAULT_WELLNESS_VALUES: DefaultWellnessValues = {
  'fatigue': 4,
  'soreness': 5,
  'stress': 4,
  'motivation': 4,
  'injury': 5
};

export class UCRIntervalsClient extends IntervalsAPIClient {
  protected ucrCalculator: UCRCalculator;

  constructor(options: IntervalsAPIOptions) {
    super(options);
    this.ucrCalculator = new UCRCalculator();
    log("DEBUG", "UCR Intervals client initialized");
  }

  /**
   * intervals.icuの4段階評価を内部の5段階評価に変換
   */
  private convertWellnessScale(icuValue: number | undefined, fieldType: string): number | null {
    if (icuValue === undefined || icuValue === null) {
      // データがない場合はnullを返す
      return null;
    }
    
    // intervals.icuの値をそのまま返す（UCRCalculatorで変換）
    return icuValue;
  }

  /**
   * intervals.icuウェルネスデータを内部形式に変換
   */
  private convertIntervalsWellnessData(icuData: IntervalsWellness): WellnessData {
    return {
      date: icuData.id, // intervals.icuではidが日付文字列
      hrv: icuData.hrv,
      rhr: icuData.restingHR,
      sleepScore: icuData.sleepScore,
      sleepHours: icuData.sleepSecs ? icuData.sleepSecs / 3600 : undefined,
      sleepQuality: icuData.sleepQuality,
      weight: icuData.weight,
      
      // 生のintervals.icuデータ（1-4スケール）
      fatigue: icuData.fatigue,
      soreness: icuData.soreness,
      stress: icuData.stress,
      motivation: icuData.motivation,
      injury: icuData.injury,
      
      // 変換後データ（1-5スケール）
      fatigueConverted: this.convertWellnessScale(icuData.fatigue, 'fatigue'),
      sorenessConverted: this.convertWellnessScale(icuData.soreness, 'soreness'),
      stressConverted: this.convertWellnessScale(icuData.stress, 'stress'),
      motivationConverted: this.convertWellnessScale(icuData.motivation, 'motivation'),
      injuryConverted: this.convertWellnessScale(icuData.injury, 'injury'),
      alcohol: 0 // intervals.icuにはアルコールデータがない
    };
  }

  /**
   * UCR計算に必要な期間のウェルネスデータを取得
   * @protected - Override this method in CachedUCRIntervalsClient for caching
   */
  async getWellnessDataForUCR(targetDate: string, lookbackDays: number = 60): Promise<WellnessData[]> {
    // 過去60日分のデータを取得
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    const oldest = startDate.toISOString().split('T')[0];
    const newest = targetDate;

    log("DEBUG", `Fetching wellness data from ${oldest} to ${newest} for UCR calculation`);

    try {
      const response = await this.getWellnessData({
        oldest,
        newest,
        limit: lookbackDays + 5 // 余裕をもって取得
      });

      const convertedData = response.data.map(entry => this.convertIntervalsWellnessData(entry));
      
      log("DEBUG", `Retrieved ${convertedData.length} wellness entries for UCR calculation`);
      
      // カスタムフィールドの存在チェック
      if (response.data.length > 0) {
        const firstEntry = response.data[0];
        const customFields = ['UCRMomentum', 'UCRVolatility', 'UCRTrendState', 'UCRTrendInterpretation'];
        const foundCustomFields = customFields.filter(field => field in firstEntry);
        
        if (foundCustomFields.length > 0) {
          log("DEBUG", `Found UCR custom fields: ${foundCustomFields.join(', ')}`);
        } else {
          log("DEBUG", "No UCR custom fields found in wellness data");
        }
      }

      return convertedData;
    } catch (error) {
      log("ERROR", `Failed to fetch wellness data for UCR: ${getErrorMessage(error)}`);
      throw new Error(`UCR wellness data fetch failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * 指定日のUCR評価を計算
   */
  async calculateUCRAssessment(date: string, includeTrends: boolean = true): Promise<UCRWithTrend> {
    log("DEBUG", `Calculating UCR assessment for ${date}, includeTrends: ${includeTrends}`);

    try {
      // ウェルネスデータを取得
      const wellnessData = await this.getWellnessDataForUCR(date);
      
      // 対象日のデータを特定
      const currentData = wellnessData.find(d => d.date === date);
      if (!currentData) {
        throw new Error(`Wellness data not found for date ${date}`);
      }

      // 過去データ（対象日以前）を取得
      const historicalData = wellnessData.filter(d => d.date <= date);

      const input: UCRCalculationInput = {
        current: currentData,
        historical: historicalData
      };

      // UCR計算実行
      const result = includeTrends 
        ? this.ucrCalculator.calculateWithTrends(input)
        : this.ucrCalculator.calculate(input);

      log("INFO", `UCR assessment completed for ${date}: score=${result.score}, recommendation=${result.recommendation.name}`);
      
      return result;
    } catch (error) {
      log("ERROR", `UCR assessment calculation failed for ${date}: ${getErrorMessage(error)}`);
      throw new Error(`UCR assessment failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * UCR評価をintervals.icuのカスタムフィールドに保存
   */
  async updateWellnessWithUCR(date: string, result: UCRWithTrend): Promise<void> {
    log("DEBUG", `Updating intervals.icu wellness entry for ${date} with UCR data`);

    try {
      // intervals.icu更新用データを生成
      const updateData = this.ucrCalculator.generateIntervalsIcuUpdate(result);
      
      log("DEBUG", `UCR update data: ${JSON.stringify(updateData, null, 2)}`);

      // 更新前のデータを取得（比較用）
      let beforeData: IntervalsWellness | null = null;
      try {
        beforeData = await this.getWellnessEntry(date);
        log("DEBUG", `Before update - readiness: ${beforeData.readiness}, UCRMomentum: ${beforeData.UCRMomentum}`);
      } catch (e) {
        log("DEBUG", `No existing wellness data for ${date}`);
      }

      // intervals.icuに送信
      const responseData = await this.updateWellnessEntry(date, updateData);
      
      // 更新結果を確認
      log("INFO", `After update - readiness: ${responseData.readiness}, UCRMomentum: ${responseData.UCRMomentum}`);
      
      log("INFO", `Successfully updated intervals.icu wellness entry for ${date} with UCR data`);
    } catch (error) {
      log("ERROR", `Failed to update intervals.icu wellness entry: ${getErrorMessage(error)}`);
      throw new Error(`intervals.icu update failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * 主観的ウェルネスデータを更新してUCR再計算
   */
  async updateWellnessAndRecalculateUCR(
    date: string,
    updates: {
      fatigue?: number;
      stress?: number;
      motivation?: number;
      soreness?: number;
      injury?: number;
    }
  ): Promise<UCRWithTrend> {
    log("DEBUG", `Updating wellness data and recalculating UCR for ${date}`);
    
    try {
      // まず主観的データを更新
      await this.updateWellnessEntry(date, updates);
      log("DEBUG", `Wellness entry updated for ${date}`);

      // 少し待ってから再計算（API反映を待つ）
      await new Promise(resolve => setTimeout(resolve, 1000));

      // UCR再計算
      const result = await this.calculateUCRAssessment(date, true);
      
      // 計算結果をintervals.icuに保存
      await this.updateWellnessWithUCR(date, result);
      
      log("INFO", `Wellness data updated and UCR recalculated for ${date}: score=${result.score}`);
      
      return result;
    } catch (error) {
      log("ERROR", `Failed to update wellness and recalculate UCR: ${getErrorMessage(error)}`);
      throw new Error(`Wellness update and UCR recalculation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * UCRカスタムフィールドの存在確認
   */
  async checkUCRCustomFields(): Promise<{
    configured: string[];
    missing: string[];
    recommendations: string[];
  }> {
    log("DEBUG", "Checking UCR custom fields configuration");

    try {
      const customFields = await this.getCustomWellnessFields();
      
      const requiredFields = [
        'UCRMomentum',
        'UCRVolatility', 
        'UCRTrendState',
        'UCRTrendInterpretation',
        'UCRVolatilityLevel',
        'UCRVolatilityBandPosition'
      ];

      const configuredFields = customFields
        .filter(field => requiredFields.includes(field.name))
        .map(field => field.name);

      const missingFields = requiredFields.filter(name => !configuredFields.includes(name));

      const recommendations = [];
      if (missingFields.length > 0) {
        recommendations.push(`Missing custom fields: ${missingFields.join(', ')}`);
        recommendations.push("Create these fields in intervals.icu Settings > Custom Fields");
        recommendations.push("Use Pascal case naming (e.g., UCRMomentum, not ucr_momentum)");
        recommendations.push("UCRTrendState should be a SELECT field with options 1-9");
      }

      log("INFO", `UCR custom fields check: ${configuredFields.length}/${requiredFields.length} configured`);
      
      return {
        configured: configuredFields,
        missing: missingFields,
        recommendations
      };
    } catch (error) {
      log("ERROR", `Failed to check UCR custom fields: ${getErrorMessage(error)}`);
      throw new Error(`Custom fields check failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * 複数日のUCR評価を一括計算（バッチ処理）
   */
  async batchCalculateUCR(
    startDate: string,
    endDate: string,
    updateIntervals: boolean = false
  ): Promise<Map<string, UCRWithTrend>> {
    log("DEBUG", `Batch calculating UCR from ${startDate} to ${endDate}, updateIntervals: ${updateIntervals}`);

    const results = new Map<string, UCRWithTrend>();
    const start = new Date(startDate);
    const end = new Date(endDate);

    try {
      // 全期間のウェルネスデータを一度に取得
      const lookbackStart = new Date(start);
      lookbackStart.setDate(lookbackStart.getDate() - 60); // UCRベースライン用に60日前から取得

      const wellnessData = await this.getWellnessDataForUCR(end.toISOString().split('T')[0], 90);

      // 各日付でUCR計算
      for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        try {
          const currentData = wellnessData.find(d => d.date === dateStr);
          if (!currentData) {
            log("WARN", `No wellness data found for ${dateStr}, skipping`);
            continue;
          }

          const historicalData = wellnessData.filter(d => d.date <= dateStr);
          
          const input: UCRCalculationInput = {
            current: currentData,
            historical: historicalData
          };

          const result = this.ucrCalculator.calculateWithTrends(input);
          results.set(dateStr, result);

          // intervals.icuに更新（オプション）
          if (updateIntervals) {
            await this.updateWellnessWithUCR(dateStr, result);
            // レート制限対策で少し待機
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          log("DEBUG", `UCR calculated for ${dateStr}: score=${result.score}`);
        } catch (error) {
          log("ERROR", `Failed to calculate UCR for ${dateStr}: ${getErrorMessage(error)}`);
          // 個別の失敗は全体を止めない
        }
      }

      log("INFO", `Batch UCR calculation completed: ${results.size} entries processed`);
      return results;
    } catch (error) {
      log("ERROR", `Batch UCR calculation failed: ${getErrorMessage(error)}`);
      throw new Error(`Batch UCR calculation failed: ${getErrorMessage(error)}`);
    }
  }
}