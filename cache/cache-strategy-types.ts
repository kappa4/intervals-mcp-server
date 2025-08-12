/**
 * キャッシュ戦略の型定義
 * 
 * キャッシュの振る舞いを戦略パターンで制御するための型
 */

/**
 * キャッシュコンテキスト
 * キャッシュ判定に必要な情報を提供
 */
export interface CacheContext {
  /** 今日のデータかどうか */
  isToday: boolean;
  
  /** データタイプ */
  dataType: "wellness" | "activities" | "athlete" | "metadata";
  
  /** 日付範囲 */
  dateRange?: {
    start: string;
    end: string;
  };
  
  /** 最近のデータか（7日以内） */
  isRecent?: boolean;
  
  /** データのサイズ（バイト） */
  dataSize?: number;
  
  /** 追加のメタデータ */
  metadata?: Record<string, any>;
}

/**
 * キャッシュ操作の結果
 */
export interface CacheResult<T> {
  /** 操作の成功/失敗 */
  success: boolean;
  
  /** キャッシュから取得したか */
  cached: boolean;
  
  /** キャッシュされたデータ */
  data?: T;
  
  /** エラーメッセージ */
  error?: string;
  
  /** メトリクス */
  metrics?: {
    operationTime: number;
    cacheHit: boolean;
    ttl?: number;
  };
}

/**
 * キャッシュ戦略インターフェース
 */
export interface ICacheStrategy {
  /**
   * キャッシュから値を取得
   */
  get<T>(key: string): Promise<CacheResult<T>>;
  
  /**
   * キャッシュに値を設定
   */
  set<T>(key: string, value: T, context: CacheContext): Promise<void>;
  
  /**
   * キャッシュから値を削除
   */
  delete(key: string): Promise<void>;
  
  /**
   * キャッシュすべきかどうかを判定
   */
  shouldCache(context: CacheContext): boolean;
  
  /**
   * TTL（Time To Live）を取得（ミリ秒）
   */
  getTTL(context: CacheContext): number;
  
  /**
   * データが有効かどうかを検証
   */
  isValidData?(data: any, context: CacheContext): boolean;
}

/**
 * キャッシュストレージインターフェース
 * 実際のキャッシュ保存を担当
 */
export interface ICacheStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * ウェルネスデータの検証用型ガード
 */
export function isValidWellnessData(data: any): boolean {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return false;
  }
  
  // 少なくとも1つのレコードに有効なデータがあるか
  return data.some(record => {
    return (
      record.hrv !== null && record.hrv !== undefined ||
      record.rhr !== null && record.rhr !== undefined ||
      record.fatigue !== null && record.fatigue !== undefined ||
      record.stress !== null && record.stress !== undefined ||
      record.sleepScore !== null && record.sleepScore !== undefined
    );
  });
}

/**
 * 日付が今日かどうかを判定
 */
export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

/**
 * 日付範囲に今日が含まれるかを判定
 */
export function includesToday(startDate: string, endDate: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return startDate <= today && today <= endDate;
}

/**
 * 日付が最近か（デフォルト7日以内）を判定
 */
export function isRecentDate(dateStr: string, daysThreshold: number = 7): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= daysThreshold;
}