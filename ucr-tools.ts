/**
 * UCR (Unified Continuous Readiness) MCP Tools
 * Claude経由でのUCR評価アクセス用MCPツール実装
 */

import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";
import { UCRCorrelationAnalyzer } from "./ucr-correlation-analyzer.ts";
import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import type { IntervalsAPIOptions } from "./intervals-types.ts";
import type { MCPTool } from "./mcp-types.ts";
import type { WellnessData, UCRComponentsDetailed } from "./ucr-types.ts";

// UCR MCPツール定義
export const UCR_TOOLS: MCPTool[] = [
  {
    name: "get_ucr_assessment",
    description: "指定日のUCR（Unified Continuous Readiness）評価を計算・取得。トレーニング準備状態の評価とトレーニング推奨を提供します。",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "評価日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        include_trends: {
          type: "boolean",
          description: "トレンド分析（モメンタム・ボラティリティ）を含むか（デフォルト: true）",
          default: true
        },
        update_intervals: {
          type: "boolean", 
          description: "計算結果をintervals.icuのカスタムフィールドに保存するか（デフォルト: true）",
          default: true
        }
      }
    }
  },
  {
    name: "calculate_ucr_trends",
    description: "UCRトレンド分析を実行。7日モメンタム、14日ボラティリティ、27ステート解釈マトリクスに基づく詳細な傾向分析を提供します。",
    inputSchema: {
      type: "object",
      properties: {
        target_date: {
          type: "string",
          description: "分析対象日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        update_intervals: {
          type: "boolean",
          description: "結果をintervals.icuのカスタムフィールドに保存するか（デフォルト: true）",
          default: true
        }
      }
    }
  },
  {
    name: "update_wellness_assessment", 
    description: "主観的ウェルネスデータを更新してUCR評価を再計算。疲労度、ストレス、モチベーション等を更新後、最新のUCR評価を取得します。",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "更新日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        fatigue: {
          type: "integer",
          description: "疲労度（1:とても疲れている ～ 4:とてもフレッシュ）",
          minimum: 1,
          maximum: 4
        },
        stress: {
          type: "integer", 
          description: "ストレス（1:とてもストレス ～ 4:とても穏やか）",
          minimum: 1,
          maximum: 4
        },
        motivation: {
          type: "integer",
          description: "モチベーション（1:とても低い ～ 4:とても高い）", 
          minimum: 1,
          maximum: 4
        },
        soreness: {
          type: "integer",
          description: "筋肉痛（1:とても痛い ～ 4:痛みなし）",
          minimum: 1,
          maximum: 4
        },
        injury: {
          type: "integer",
          description: "ケガ・違和感（1:重大なケガ ～ 4:問題なし）",
          minimum: 1,
          maximum: 4
        }
      }
    }
  },
  {
    name: "check_ucr_setup",
    description: "UCR機能の設定状況を確認。intervals.icuのカスタムフィールド設定状況と推奨事項を表示します。",
    inputSchema: {
      type: "object", 
      properties: {}
    }
  },
  {
    name: "batch_calculate_ucr",
    description: "指定期間のUCR評価を一括計算。複数日のUCR評価を効率的に計算し、オプションでintervals.icuに保存します。",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "開始日（YYYY-MM-DD形式）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        end_date: {
          type: "string", 
          description: "終了日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        update_intervals: {
          type: "boolean",
          description: "結果をintervals.icuに保存するか（デフォルト: false）",
          default: false
        }
      },
      required: ["start_date"]
    }
  },
  {
    name: "get_ucr_components",
    description: "UCRスコアの詳細な構成要素を取得。HRV、RHR、睡眠、主観の各スコアと客観的レディネススコアを提供します。",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "評価日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        include_modifiers: {
          type: "boolean",
          description: "修正因子（Modifier）の詳細を含むか（デフォルト: true）",
          default: true
        }
      }
    }
  },
  {
    name: "analyze_ucr_correlations",
    description: "主観的ウェルネスと客観的レディネススコアの時間差相関を分析。個人の生理学的応答パターンを明らかにします。",
    inputSchema: {
      type: "object",
      properties: {
        end_date: {
          type: "string",
          description: "分析終了日（YYYY-MM-DD形式、省略時は今日）",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        },
        days: {
          type: "number",
          description: "分析期間の日数（デフォルト: 30日）",
          default: 30,
          minimum: 14,
          maximum: 90
        },
        max_lag: {
          type: "number",
          description: "最大ラグ日数（デフォルト: 7日）",
          default: 7,
          minimum: 1,
          maximum: 14
        },
        metrics: {
          type: "array",
          description: "分析対象の主観指標（省略時は全て）",
          items: {
            type: "string",
            enum: ["fatigue", "stress", "soreness", "motivation", "sleep_quality"]
          }
        }
      }
    }
  }
];

// UCRツール実行ハンドラー
export class UCRToolHandler {
  private client: CachedUCRIntervalsClient;
  private correlationAnalyzer: UCRCorrelationAnalyzer;

  constructor(apiOptions: IntervalsAPIOptions) {
    this.client = new CachedUCRIntervalsClient(apiOptions);
    this.correlationAnalyzer = new UCRCorrelationAnalyzer();
  }

  async handleTool(toolName: string, args: any): Promise<any> {
    try {
      switch (toolName) {
        case "get_ucr_assessment":
          return await this.handleGetUCRAssessment(args);
        
        case "calculate_ucr_trends":
          return await this.handleCalculateUCRTrends(args);
        
        case "update_wellness_assessment":
          return await this.handleUpdateWellnessAssessment(args);
        
        case "check_ucr_setup":
          return await this.handleCheckUCRSetup(args);
        
        case "batch_calculate_ucr":
          return await this.handleBatchCalculateUCR(args);
        
        case "get_ucr_components":
          return await this.handleGetUCRComponents(args);
        
        case "analyze_ucr_correlations":
          return await this.handleAnalyzeUCRCorrelations(args);
        
        default:
          throw new Error(`Unknown UCR tool: ${toolName}`);
      }
    } catch (error) {
      log("ERROR", `UCR tool ${toolName} failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        error: getErrorMessage(error),
        tool: toolName
      };
    }
  }

  private async handleGetUCRAssessment(args: any) {
    const date = args.date || new Date().toISOString().split('T')[0];
    const includeTrends = args.include_trends !== false;
    const updateIntervals = args.update_intervals !== false;

    log("INFO", `Getting UCR assessment for ${date}, trends: ${includeTrends}, update: ${updateIntervals}`);

    const result = await this.client.calculateUCRAssessment(date, includeTrends);

    // intervals.icuに保存（オプション）
    if (updateIntervals) {
      await this.client.updateWellnessWithUCR(date, result);
    }

    return {
      success: true,
      date,
      ucr_assessment: {
        score: result.score,
        base_score: result.baseScore,
        components: result.components,
        recommendation: {
          zone: result.recommendation.name,
          description: result.recommendation.description,
          action: result.recommendation.action,
          examples: result.recommendation.examples
        },
        trend: result.trend ? {
          momentum: result.trend.momentum,
          volatility: result.trend.volatility,
          volatility_level: result.trend.volatilityLevel,
          volatility_band_position: result.trend.volatilityBandPosition,
          trend_state: result.trend.trendState,
          trend_state_code: result.trend.trendStateCode,
          interpretation: result.trend.interpretation
        } : null
      },
      updated_intervals: updateIntervals
    };
  }

  private async handleCalculateUCRTrends(args: any) {
    const targetDate = args.target_date || new Date().toISOString().split('T')[0];
    const updateIntervals = args.update_intervals !== false;

    log("INFO", `Calculating UCR trends for ${targetDate}, update: ${updateIntervals}`);

    const result = await this.client.calculateUCRAssessment(targetDate, true);

    if (!result.trend) {
      throw new Error("トレンド分析に失敗しました。十分なデータがない可能性があります。");
    }

    // intervals.icuに保存
    if (updateIntervals) {
      await this.client.updateWellnessWithUCR(targetDate, result);
    }

    return {
      success: true,
      target_date: targetDate,
      trend_analysis: {
        momentum: {
          value: result.trend.momentum,
          description: `過去7日間で${result.trend.momentum >= 0 ? '+' : ''}${result.trend.momentum}%の変化`
        },
        volatility: {
          value: result.trend.volatility,
          level: result.trend.volatilityLevel,
          band_position: result.trend.volatilityBandPosition,
          description: this.getVolatilityDescription(result.trend.volatilityLevel, result.trend.volatility)
        },
        trend_state: {
          state: result.trend.trendState,
          code: result.trend.trendStateCode,
          interpretation: result.trend.interpretation
        }
      },
      ucr_score: result.score,
      updated_intervals: updateIntervals
    };
  }

  private async handleUpdateWellnessAssessment(args: any) {
    const date = args.date || new Date().toISOString().split('T')[0];
    
    // 更新データを準備
    const updates: any = {};
    if (args.fatigue !== undefined) updates.fatigue = args.fatigue;
    if (args.stress !== undefined) updates.stress = args.stress;
    if (args.motivation !== undefined) updates.motivation = args.motivation;
    if (args.soreness !== undefined) updates.soreness = args.soreness;
    if (args.injury !== undefined) updates.injury = args.injury;

    if (Object.keys(updates).length === 0) {
      throw new Error("更新するウェルネスデータが指定されていません。");
    }

    log("INFO", `Updating wellness data for ${date}: ${JSON.stringify(updates)}`);

    const result = await this.client.updateWellnessAndRecalculateUCR(date, updates);

    return {
      success: true,
      date,
      updated_fields: Object.keys(updates),
      wellness_updates: updates,
      ucr_assessment: {
        score: result.score,
        previous_score: null, // 前回値の比較は今後実装
        components: result.components,
        recommendation: {
          zone: result.recommendation.name,
          description: result.recommendation.description,
          action: result.recommendation.action
        },
        trend: result.trend ? {
          momentum: result.trend.momentum,
          volatility: result.trend.volatility,
          trend_state: result.trend.trendState,
          interpretation: result.trend.interpretation
        } : null
      }
    };
  }

  private async handleCheckUCRSetup(args: any) {
    log("INFO", "Checking UCR setup configuration");

    const setupCheck = await this.client.checkUCRCustomFields();

    return {
      success: true,
      ucr_setup: {
        custom_fields: {
          configured: setupCheck.configured,
          missing: setupCheck.missing,
          total_required: 6,
          completion_rate: `${setupCheck.configured.length}/6 (${Math.round(setupCheck.configured.length / 6 * 100)}%)`
        },
        recommendations: setupCheck.recommendations,
        status: setupCheck.missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
        next_steps: setupCheck.missing.length > 0 ? [
          "intervals.icuにログインし、Settings > Custom Fieldsに移動",
          "以下のカスタムフィールドを作成してください：",
          ...setupCheck.missing.map(field => `  - ${field} (適切な型で作成)`)
        ] : ["UCRカスタムフィールドの設定は完了しています"]
      }
    };
  }

  private async handleBatchCalculateUCR(args: any) {
    const startDate = args.start_date;
    const endDate = args.end_date || new Date().toISOString().split('T')[0];
    const updateIntervals = args.update_intervals === true;

    log("INFO", `Batch calculating UCR from ${startDate} to ${endDate}, update: ${updateIntervals}`);

    const results = await this.client.batchCalculateUCR(startDate, endDate, updateIntervals);

    const summary = {
      total_days: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
      calculated_days: results.size,
      success_rate: `${results.size}/${Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} (${Math.round(results.size / (Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) * 100)}%)`
    };

    // 結果をサマリー形式で整理
    const dailyResults: any[] = [];
    results.forEach((result, date) => {
      dailyResults.push({
        date,
        score: result.score,
        recommendation: result.recommendation.name,
        trend: result.trend ? {
          momentum: result.trend.momentum,
          volatility_level: result.trend.volatilityLevel,
          trend_state: result.trend.trendState
        } : null
      });
    });

    // 日付順にソート
    dailyResults.sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      period: {
        start_date: startDate,
        end_date: endDate
      },
      summary,
      daily_results: dailyResults,
      updated_intervals: updateIntervals
    };
  }

  private getVolatilityDescription(level: string, value: number): string {
    switch (level) {
      case 'HIGH':
        return `統計的に有意に高い変動性（${value}）- コンディションが不安定`;
      case 'LOW':
        return `統計的に有意に低い変動性（${value}）- 非常に安定したコンディション`;
      default:
        return `標準的な変動性（${value}）- 正常な範囲内の変動`;
    }
  }

  private async handleGetUCRComponents(args: any) {
    const date = args.date || new Date().toISOString().split('T')[0];
    const includeModifiers = args.include_modifiers !== false;

    // UCR計算
    try {
      const assessment = await this.client.calculateUCRAssessment(date, true);
      
      if (!assessment) {
        return {
          success: false,
          error: "UCR計算に失敗しました",
          date
        };
      }

      // 詳細コンポーネントの生成
      const detailedComponents = this.correlationAnalyzer.createDetailedComponents(
        assessment.components
      );

      const response: any = {
        success: true,
        date,
        components: {
          hrv: {
            score: detailedComponents.hrv,
            max_score: 40,
            percentage: Math.round((detailedComponents.hrv / 40) * 100)
          },
          rhr: {
            score: detailedComponents.rhr,
            max_score: 25,
            percentage: Math.round((detailedComponents.rhr / 25) * 100)
          },
          sleep: {
            score: detailedComponents.sleep,
            max_score: 15,
            percentage: Math.round((detailedComponents.sleep / 15) * 100)
          },
          subjective: {
            score: detailedComponents.subjective,
            max_score: 20,
            percentage: Math.round((detailedComponents.subjective / 20) * 100)
          },
          objective_readiness: {
            score: detailedComponents.objectiveReadinessScore,
            max_score: 80,
            percentage: Math.round((detailedComponents.objectiveReadinessScore / 80) * 100),
            description: "HRV + RHR + 睡眠の合計（主観を除外した客観的指標）"
          }
        },
        base_score: assessment.baseScore,
        final_score: assessment.score,
        interpretation: this.interpretComponents(detailedComponents)
      };

      // 修正因子の詳細を含める
      if (includeModifiers && assessment.modifiers) {
        response.modifiers = this.formatModifiers(assessment.modifiers);
        response.multiplier = assessment.multiplier || 1.0;
        response.score_adjustment = assessment.score - assessment.baseScore;
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        date
      };
    }
  }

  private async handleAnalyzeUCRCorrelations(args: any) {
    const endDate = args.end_date || new Date().toISOString().split('T')[0];
    const days = args.days || 30;
    const maxLag = args.max_lag || 7;
    const targetMetrics = args.metrics || ["fatigue", "stress", "soreness", "motivation", "sleep_quality"];

    // 分析期間の計算
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 期間中のウェルネスデータとUCR計算結果を取得
    const wellnessDataMap = new Map<string, WellnessData>();
    const objectiveScores: number[] = [];
    const dates: string[] = [];

    // 日付を生成して順次データを取得
    const currentDate = new Date(startDateStr);
    const endDateObj = new Date(endDate);
    
    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dates.push(dateStr);
      
      // UCRアセスメントとウェルネスデータを取得
      try {
        const assessment = await this.client.calculateUCRAssessment(dateStr, false);
        if (assessment) {
          const objectiveScore = this.correlationAnalyzer.calculateObjectiveReadinessScore(
            assessment.components
          );
          objectiveScores.push(objectiveScore);
        }
        
        // ウェルネスデータを取得（UCR計算用のメソッドを使用）
        const wellnessDataArray = await this.client.getWellnessDataForUCR(dateStr, 1);
        if (wellnessDataArray && wellnessDataArray.length > 0) {
          wellnessDataMap.set(dateStr, wellnessDataArray[0]);
        }
      } catch (error) {
        log("WARN", `Failed to get data for ${dateStr}: ${getErrorMessage(error)}`);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // データが不足している場合のエラー処理
    if (objectiveScores.length < 14) {
      return {
        success: false,
        error: `相関分析には最低14日分のデータが必要です（現在: ${objectiveScores.length}日分）`,
        required_days: 14,
        available_days: objectiveScores.length
      };
    }

    // 各主観指標との相関を分析
    const correlationResults: any[] = [];
    
    for (const metricName of targetMetrics) {
      const metricValues: number[] = [];
      
      // 各日のメトリック値を抽出
      for (const dateStr of dates) {
        const wellness = wellnessDataMap.get(dateStr);
        if (wellness) {
          let value: number | undefined;
          switch (metricName) {
            case "fatigue":
              value = wellness.fatigue;
              break;
            case "stress":
              value = wellness.stress;
              break;
            case "soreness":
              value = wellness.soreness;
              break;
            case "motivation":
              value = wellness.motivation;
              break;
            case "sleep_quality":
              value = wellness.sleepQuality;
              break;
          }
          
          if (value !== undefined && value !== null) {
            metricValues.push(value);
          }
        }
      }

      // 十分なデータがある場合のみ相関を計算
      if (metricValues.length >= objectiveScores.length * 0.8) {
        const result = this.correlationAnalyzer.calculateTimeLaggedCorrelation(
          objectiveScores.slice(0, metricValues.length),
          metricValues,
          this.getMetricJapaneseName(metricName),
          maxLag
        );
        
        correlationResults.push({
          metric: metricName,
          metric_jp: result.metric,
          optimal_lag: result.optimalLag,
          correlation: Math.round(result.correlation * 1000) / 1000,
          strength: this.getCorrelationStrengthLabel(result.correlation),
          interpretation: result.interpretation,
          data_points: result.dataPoints
        });
      }
    }

    // 相関の強さでソート
    correlationResults.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    return {
      success: true,
      analysis_period: {
        start_date: startDateStr,
        end_date: endDate,
        days: days,
        actual_days: objectiveScores.length
      },
      correlations: correlationResults,
      top_insights: this.generateTopInsights(correlationResults),
      recommendations: this.generateRecommendations(correlationResults)
    };
  }

  private interpretComponents(components: UCRComponentsDetailed): any {
    const dominantFactors: string[] = [];
    const limitingFactors: string[] = [];
    
    // 各コンポーネントの寄与度を評価
    const componentScores = [
      { name: "HRV", score: components.hrv, max: 40 },
      { name: "RHR", score: components.rhr, max: 25 },  // HRV二重計上補正
      { name: "睡眠", score: components.sleep, max: 15 },  // Garmin内HRV成分の重複削減
      { name: "主観", score: components.subjective, max: 20 }
    ];

    componentScores.forEach(comp => {
      const percentage = (comp.score / comp.max) * 100;
      if (percentage >= 75) {
        dominantFactors.push(`${comp.name}（${Math.round(percentage)}%）`);
      } else if (percentage < 50) {
        limitingFactors.push(`${comp.name}（${Math.round(percentage)}%）`);
      }
    });

    return {
      dominant_factors: dominantFactors.length > 0 ? dominantFactors : ["バランスの取れた状態"],
      limiting_factors: limitingFactors.length > 0 ? limitingFactors : ["特になし"],
      balance_assessment: this.assessBalance(components)
    };
  }

  private assessBalance(components: UCRComponentsDetailed): string {
    const objectivePercent = (components.objectiveReadinessScore / 80) * 100;
    const subjectivePercent = (components.subjectiveScore / 20) * 100;
    const gap = Math.abs(objectivePercent - subjectivePercent);

    if (gap > 30) {
      if (objectivePercent > subjectivePercent) {
        return "客観的指標は良好だが主観的な疲労感がある状態。メンタル面のケアが必要かもしれません。";
      } else {
        return "主観的には元気だが身体は疲労している状態。無理をせず回復を優先してください。";
      }
    } else if (gap < 15) {
      return "主観と客観が一致したバランスの良い状態です。";
    } else {
      return "主観と客観にやや乖離がありますが、正常範囲内です。";
    }
  }

  private formatModifiers(modifiers: any): any {
    const formatted: any = {
      applied_modifiers: [],
      total_impact: 1.0
    };

    Object.entries(modifiers).forEach(([key, modifier]: [string, any]) => {
      if (modifier && modifier.applied) {
        formatted.applied_modifiers.push({
          type: this.getModifierJapaneseName(key),
          reason: modifier.reason,
          impact: modifier.value,
          effect: modifier.value < 1 ? `${Math.round((1 - modifier.value) * 100)}%減少` : "影響なし"
        });
        formatted.total_impact *= modifier.value;
      }
    });

    formatted.total_impact = Math.round(formatted.total_impact * 1000) / 1000;
    formatted.summary = formatted.applied_modifiers.length > 0 
      ? `${formatted.applied_modifiers.length}個の修正因子により、スコアが${Math.round((1 - formatted.total_impact) * 100)}%調整されました`
      : "修正因子の適用なし";

    return formatted;
  }

  private getModifierJapaneseName(key: string): string {
    const names: { [key: string]: string } = {
      alcohol: "アルコール",
      muscleSoreness: "筋肉痛",
      injury: "怪我",
      motivation: "モチベーション",
      sleepDebt: "睡眠負債"
    };
    return names[key] || key;
  }

  private getMetricJapaneseName(metric: string): string {
    const names: { [key: string]: string } = {
      fatigue: "疲労度",
      stress: "ストレス",
      soreness: "筋肉痛",
      motivation: "モチベーション",
      sleep_quality: "睡眠の質"
    };
    return names[metric] || metric;
  }

  private getCorrelationStrengthLabel(correlation: number): string {
    const abs = Math.abs(correlation);
    if (abs >= 0.7) return "非常に強い";
    if (abs >= 0.5) return "強い";
    if (abs >= 0.3) return "中程度";
    if (abs >= 0.2) return "弱い";
    return "非常に弱い";
  }

  private generateTopInsights(correlations: any[]): string[] {
    const insights: string[] = [];
    
    // 最も強い相関を持つ指標
    if (correlations.length > 0 && Math.abs(correlations[0].correlation) >= 0.3) {
      const top = correlations[0];
      const lagText = top.optimal_lag < 0 ? `${Math.abs(top.optimal_lag)}日前` : 
                      top.optimal_lag > 0 ? `${top.optimal_lag}日後` : "同日";
      insights.push(`${top.metric_jp}が${lagText}の身体状態と最も強く関連しています（r=${top.correlation}）`);
    }

    // 先行指標の発見
    const leadingIndicators = correlations.filter(c => c.optimal_lag < 0 && Math.abs(c.correlation) >= 0.3);
    if (leadingIndicators.length > 0) {
      insights.push(`${leadingIndicators.map(i => i.metric_jp).join("、")}が将来の身体状態の先行指標として機能しています`);
    }

    // 同期指標
    const synchronousIndicators = correlations.filter(c => c.optimal_lag === 0 && Math.abs(c.correlation) >= 0.3);
    if (synchronousIndicators.length > 0) {
      insights.push(`${synchronousIndicators.map(i => i.metric_jp).join("、")}は身体状態と同期して変動します`);
    }

    return insights;
  }

  private generateRecommendations(correlations: any[]): string[] {
    const recommendations: string[] = [];

    // 疲労度の相関が強い場合
    const fatigueCorr = correlations.find(c => c.metric === "fatigue");
    if (fatigueCorr && Math.abs(fatigueCorr.correlation) >= 0.4) {
      if (fatigueCorr.optimal_lag < 0) {
        recommendations.push(`疲労度の変化は${Math.abs(fatigueCorr.optimal_lag)}日後に身体に現れます。早めの疲労管理が重要です。`);
      }
    }

    // ストレスの相関が強い場合
    const stressCorr = correlations.find(c => c.metric === "stress");
    if (stressCorr && Math.abs(stressCorr.correlation) >= 0.4) {
      recommendations.push("ストレス管理が身体コンディションに大きく影響しています。リラクゼーション技法の導入を検討してください。");
    }

    // 睡眠の質の相関
    const sleepCorr = correlations.find(c => c.metric === "sleep_quality");
    if (sleepCorr && Math.abs(sleepCorr.correlation) >= 0.3) {
      recommendations.push("睡眠の質が回復に重要な役割を果たしています。睡眠環境の改善を優先してください。");
    }

    if (recommendations.length === 0) {
      recommendations.push("現在のデータでは明確なパターンが見つかりません。さらにデータを蓄積して分析精度を高めることをお勧めします。");
    }

    return recommendations;
  }
}