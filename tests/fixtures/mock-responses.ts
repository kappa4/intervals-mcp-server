/**
 * intervals.icu APIのモックレスポンス
 */

import type { 
  IntervalsWellnessData, 
  IntervalsActivity 
} from "../../types/intervals-api.ts";

/**
 * ウェルネスデータのモックレスポンス（intervals.icu形式）
 */
export const MOCK_WELLNESS_RESPONSE: IntervalsWellnessData[] = [
  {
    id: "w2025-08-01",
    date: "2025-08-01",
    athleteId: "i123456",
    hrv: 48,
    restingHR: 54,
    sleep: 88,        // sleepScore
    sleepTime: 7.5,   // sleepHours
    fatigue: 2,       // intervals.icu形式（1=good, 4=bad）
    soreness: 1,      // intervals.icu形式
    stress: 2,        // intervals.icu形式
    motivation: 2,    // intervals.icu形式
    injury: 1,        // intervals.icu形式
    alcohol: false,
    updated: "2025-08-01T06:00:00Z"
  },
  {
    id: "w2025-07-31",
    date: "2025-07-31",
    athleteId: "i123456",
    hrv: 46,
    restingHR: 55,
    sleep: 85,
    sleepTime: 7.2,
    fatigue: 2,
    soreness: 2,
    stress: 2,
    motivation: 2,
    injury: 1,
    alcohol: false,
    updated: "2025-07-31T06:00:00Z"
  }
];

/**
 * アクティビティデータのモックレスポンス
 */
export const MOCK_ACTIVITY_RESPONSE: IntervalsActivity[] = [
  {
    id: "a2025-08-01-1",
    athleteId: "i123456",
    start_date_local: "2025-08-01T08:00:00",
    type: "Run",
    name: "Morning Run",
    moving_time: 3600,
    distance: 10000,
    average_hr: 145,
    max_hr: 165,
    average_pace: 360,  // 6:00/km
    icu_training_load: 120,
    icu_intensity: 75
  }
];

/**
 * カスタムフィールド設定のモックレスポンス
 */
export const MOCK_CUSTOM_FIELDS_RESPONSE = {
  wellness: [
    {
      name: "ucr_trend_momentum",
      type: "number",
      description: "UCR Momentum (7-day trend)",
      created: "2025-01-01T00:00:00Z"
    },
    {
      name: "ucr_trend_volatility", 
      type: "number",
      description: "UCR Volatility (7-day standard deviation)",
      created: "2025-01-01T00:00:00Z"
    },
    {
      name: "ucr_score",
      type: "number", 
      description: "Daily UCR Score",
      created: "2025-01-01T00:00:00Z"
    },
    {
      name: "ucr_base_score",
      type: "number",
      description: "UCR Base Score (before modifiers)",
      created: "2025-01-01T00:00:00Z"
    }
  ]
};

/**
 * エラーレスポンスのモック
 */
export const MOCK_ERROR_RESPONSES = {
  unauthorized: {
    status: 401,
    error: "Unauthorized",
    message: "Invalid API key"
  },
  notFound: {
    status: 404,
    error: "Not Found",
    message: "Athlete not found"
  },
  serverError: {
    status: 500,
    error: "Internal Server Error",
    message: "An unexpected error occurred"
  },
  rateLimit: {
    status: 429,
    error: "Too Many Requests",
    message: "Rate limit exceeded"
  }
};

/**
 * ウェルネスデータ更新のモックリクエスト
 */
export const MOCK_WELLNESS_UPDATE_REQUEST = {
  fatigue: 2,       // intervals.icu形式
  stress: 3,        // intervals.icu形式
  // カスタムフィールド
  ucr_score: 78,
  ucr_base_score: 78,
  ucr_trend_momentum: 2.5,
  ucr_trend_volatility: 3.2
};

/**
 * 大量データのモックレスポンス生成
 */
export function generateBulkWellnessData(days: number): IntervalsWellnessData[] {
  const data: IntervalsWellnessData[] = [];
  const baseDate = new Date("2025-08-01");

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    data.push({
      id: `w${dateStr}`,
      date: dateStr,
      athleteId: "i123456",
      hrv: 45 + Math.sin(i / 7) * 5,
      restingHR: 55 + Math.cos(i / 5) * 3,
      sleep: 85 + Math.sin(i / 3) * 10,
      sleepTime: 7 + Math.sin(i / 4) * 1,
      fatigue: Math.floor(Math.random() * 3) + 1,  // 1-3
      soreness: Math.floor(Math.random() * 3) + 1,
      stress: Math.floor(Math.random() * 3) + 1,
      motivation: Math.floor(Math.random() * 3) + 1,
      injury: 1,
      alcohol: Math.random() > 0.9,
      updated: `${dateStr}T06:00:00Z`
    });
  }

  return data;
}

/**
 * APIレスポンスのモックヘルパー
 */
export class MockAPIHelper {
  static createResponse<T>(data: T, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  static createErrorResponse(error: any): Response {
    return new Response(JSON.stringify(error), {
      status: error.status,
      headers: { "Content-Type": "application/json" }
    });
  }

  static async mockFetch(url: string): Promise<Response> {
    // URLパターンに基づいてモックレスポンスを返す
    if (url.includes("/wellness")) {
      return this.createResponse(MOCK_WELLNESS_RESPONSE);
    }
    if (url.includes("/activities")) {
      return this.createResponse(MOCK_ACTIVITY_RESPONSE);
    }
    if (url.includes("/custom-fields")) {
      return this.createResponse(MOCK_CUSTOM_FIELDS_RESPONSE);
    }
    
    return this.createErrorResponse(MOCK_ERROR_RESPONSES.notFound);
  }
}