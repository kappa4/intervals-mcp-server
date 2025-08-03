/**
 * UCR (Unified Continuous Readiness) MCP Tools
 * Claude経由でのUCR評価アクセス用MCPツール実装
 */

import { CachedUCRIntervalsClient } from "./ucr-intervals-client-cached.ts";
import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import type { IntervalsAPIOptions } from "./intervals-types.ts";
import type { MCPTool } from "./mcp-types.ts";

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
          description: "計算結果をintervals.icuのカスタムフィールドに保存するか（デフォルト: false）",
          default: false
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
  }
];

// UCRツール実行ハンドラー
export class UCRToolHandler {
  private client: CachedUCRIntervalsClient;

  constructor(apiOptions: IntervalsAPIOptions) {
    this.client = new CachedUCRIntervalsClient(apiOptions);
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
    const updateIntervals = args.update_intervals === true;

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
          trend_state: result.trend.trendState,
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
}