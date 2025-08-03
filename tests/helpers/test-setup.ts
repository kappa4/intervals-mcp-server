/**
 * テストヘルパーユーティリティ
 * UCRテストに必要な共通関数とクラスを提供
 */

/**
 * UCRスコアが有効な範囲（0-100）であることを検証
 */
export function assertUCRScore(score: number): boolean {
  return score >= 0 && score <= 100;
}

/**
 * テストデータ検証ユーティリティ
 */
export class TestDataValidator {
  /**
   * UCRスコアが有効な整数値（0-100）であることを検証
   */
  static isValidUCRScore(score: number): boolean {
    return Number.isInteger(score) && score >= 0 && score <= 100;
  }

  /**
   * HRVデータが有効な範囲であることを検証
   */
  static isValidHRV(hrv: number): boolean {
    return hrv > 0 && hrv < 300;
  }

  /**
   * RHRデータが有効な範囲であることを検証
   */
  static isValidRHR(rhr: number): boolean {
    return rhr >= 30 && rhr <= 120;
  }

  /**
   * 睡眠時間が有効な範囲であることを検証
   */
  static isValidSleepHours(hours: number): boolean {
    return hours >= 0 && hours <= 24;
  }

  /**
   * 主観的評価（1-5）が有効であることを検証
   */
  static isValidSubjectiveScore(score: number): boolean {
    return Number.isInteger(score) && score >= 1 && score <= 5;
  }
}

/**
 * パフォーマンス測定ユーティリティ
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private name: string;

  constructor(name?: string) {
    this.name = name || "operation";
  }

  /**
   * タイマーを開始
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * 経過時間を取得（ミリ秒）
   */
  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * 指定時間以内に完了したことをアサート
   */
  assertUnder(ms: number, message?: string): void {
    const elapsed = this.getElapsedTime();
    if (elapsed >= ms) {
      const errorMessage = message || `${this.name} took too long`;
      throw new Error(`${errorMessage} (${elapsed.toFixed(2)}ms >= ${ms}ms)`);
    }
  }

  /**
   * 経過時間をログ出力
   */
  log(): void {
    console.log(`${this.name} took ${this.getElapsedTime().toFixed(2)}ms`);
  }
}

/**
 * 数値の近似比較ユーティリティ
 */
export function assertAlmostEquals(
  actual: number,
  expected: number,
  tolerance: number,
  message?: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    const errorMessage = message || "Values are not approximately equal";
    throw new Error(
      `${errorMessage}: expected ${expected} ± ${tolerance}, got ${actual} (diff: ${diff})`
    );
  }
}

/**
 * テスト用の日付生成ユーティリティ
 */
export class TestDateGenerator {
  /**
   * 指定日数前の日付文字列を生成（YYYY-MM-DD形式）
   */
  static getDaysAgo(days: number, baseDate?: Date): string {
    const base = baseDate || new Date();
    const date = new Date(base);
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
  }

  /**
   * 連続した日付の配列を生成
   */
  static getDateRange(startDaysAgo: number, count: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(this.getDaysAgo(startDaysAgo - i));
    }
    return dates;
  }
}

/**
 * ランダムデータ生成ユーティリティ
 */
export class RandomDataGenerator {
  /**
   * 正規分布に従うランダム値を生成
   */
  static normalDistribution(mean: number, stdDev: number): number {
    // Box-Muller変換
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * 指定範囲内のランダム整数を生成
   */
  static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * リアルなHRV値を生成（正規分布ベース）
   */
  static generateHRV(mean: number = 45, stdDev: number = 10): number {
    const hrv = this.normalDistribution(mean, stdDev);
    return Math.max(15, Math.min(150, Math.round(hrv)));
  }

  /**
   * リアルなRHR値を生成（正規分布ベース）
   */
  static generateRHR(mean: number = 55, stdDev: number = 7): number {
    const rhr = this.normalDistribution(mean, stdDev);
    return Math.max(35, Math.min(100, Math.round(rhr)));
  }

  /**
   * リアルな睡眠時間を生成（正規分布ベース）
   */
  static generateSleepHours(mean: number = 7, stdDev: number = 1): number {
    const hours = this.normalDistribution(mean, stdDev);
    return Math.max(3, Math.min(12, Math.round(hours * 10) / 10));
  }
}