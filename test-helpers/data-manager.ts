/**
 * Test Data Manager
 * テストデータのバックアップ・リストア管理
 */

import { MCPTestClient } from "./test-framework.ts";

export interface BackupData {
  tool: string;
  date: string;
  data: any;
  timestamp: string;
}

export class TestDataManager {
  private client: MCPTestClient;
  private backups: Map<string, BackupData> = new Map();

  constructor(client: MCPTestClient) {
    this.client = client;
  }

  /**
   * ウェルネスデータのバックアップ
   */
  async backupWellnessData(date?: string): Promise<BackupData | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const key = `wellness_${targetDate}`;

    try {
      const result = await this.client.callTool("get_wellness", { date: targetDate });
      
      if (result.content && result.content[0]) {
        const data = JSON.parse(result.content[0].text);
        if (data.length > 0) {
          const backup: BackupData = {
            tool: "wellness",
            date: targetDate,
            data: data[0],
            timestamp: new Date().toISOString()
          };
          
          this.backups.set(key, backup);
          return backup;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to backup wellness data: ${error}`);
      return null;
    }
  }

  /**
   * ウェルネスデータのリストア
   */
  async restoreWellnessData(date?: string): Promise<boolean> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const key = `wellness_${targetDate}`;
    const backup = this.backups.get(key);

    if (!backup) {
      console.warn(`No backup found for ${key}`);
      return false;
    }

    try {
      const updateArgs: Record<string, any> = { date: targetDate };
      
      // 基本的なウェルネスデータ
      if (backup.data.hrv_morning) updateArgs.hrv_morning = backup.data.hrv_morning;
      if (backup.data.resting_hr) updateArgs.resting_hr = backup.data.resting_hr;
      if (backup.data.weight) updateArgs.weight = backup.data.weight;
      if (backup.data.sleep_time) updateArgs.sleep_time = backup.data.sleep_time;
      if (backup.data.overall_status) updateArgs.overall_status = backup.data.overall_status;
      if (backup.data.comments) updateArgs.comments = backup.data.comments;

      await this.client.callTool("update_wellness", updateArgs);
      
      // ウェルネスアセスメント（主観的データ）
      if (backup.data.fatigue !== undefined || 
          backup.data.stress !== undefined ||
          backup.data.motivation !== undefined) {
        const assessmentArgs: Record<string, any> = { date: targetDate };
        
        if (backup.data.fatigue !== undefined) assessmentArgs.fatigue = backup.data.fatigue;
        if (backup.data.stress !== undefined) assessmentArgs.stress = backup.data.stress;
        if (backup.data.motivation !== undefined) assessmentArgs.motivation = backup.data.motivation;
        if (backup.data.soreness !== undefined) assessmentArgs.soreness = backup.data.soreness;
        if (backup.data.injury !== undefined) assessmentArgs.injury = backup.data.injury;
        
        await this.client.callTool("update_wellness_assessment", assessmentArgs);
      }

      return true;
    } catch (error) {
      console.error(`Failed to restore wellness data: ${error}`);
      return false;
    }
  }

  /**
   * すべてのバックアップをクリア
   */
  clearBackups(): void {
    this.backups.clear();
  }

  /**
   * バックアップの状態を取得
   */
  getBackupStatus(): { count: number; keys: string[] } {
    return {
      count: this.backups.size,
      keys: Array.from(this.backups.keys())
    };
  }

  /**
   * テストデータの生成
   */
  static generateTestWellnessData(options: {
    includeHRV?: boolean;
    includeAssessment?: boolean;
    includeSleep?: boolean;
  } = {}): Record<string, any> {
    const data: Record<string, any> = {
      date: new Date().toISOString().split('T')[0],
      comments: `Test data generated at ${new Date().toISOString()}`
    };

    if (options.includeHRV !== false) {
      data.hrv_morning = Math.floor(Math.random() * 30) + 40; // 40-70
      data.resting_hr = Math.floor(Math.random() * 20) + 50; // 50-70
    }

    if (options.includeAssessment) {
      data.fatigue = Math.floor(Math.random() * 5) + 1; // 1-5
      data.stress = Math.floor(Math.random() * 5) + 1; // 1-5
      data.motivation = Math.floor(Math.random() * 5) + 1; // 1-5
      data.soreness = Math.floor(Math.random() * 5) + 1; // 1-5
      data.injury = 1; // Default to no injury
    }

    if (options.includeSleep) {
      data.sleep_time = Math.floor(Math.random() * 3) + 6; // 6-9 hours
    }

    return data;
  }

  /**
   * 安全なテスト実行ラッパー
   */
  async runWithBackup<T>(
    testName: string,
    testFn: () => Promise<T>,
    date?: string
  ): Promise<T> {
    console.log(`\n--- Running test with backup: ${testName} ---`);
    
    // バックアップ
    const backup = await this.backupWellnessData(date);
    if (!backup) {
      console.warn("⚠️  No data to backup, proceeding with caution");
    }

    try {
      // テスト実行
      const result = await testFn();
      console.log(`✅ Test completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
      throw error;
    } finally {
      // リストア
      if (backup) {
        const restored = await this.restoreWellnessData(date);
        if (restored) {
          console.log(`✅ Data restored to original state`);
        } else {
          console.error(`❌ Failed to restore data - manual intervention may be required`);
        }
      }
    }
  }
}

/**
 * データ検証ヘルパー
 */
export class DataValidator {
  static validateWellnessData(data: any): string[] {
    const errors: string[] = [];

    // 基本的な構造チェック
    if (!data || typeof data !== 'object') {
      errors.push("Data is not an object");
      return errors;
    }

    // 日付フォーマット
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      errors.push(`Invalid date format: ${data.date}`);
    }

    // HRVの範囲チェック
    if (data.hrv_morning !== undefined) {
      if (typeof data.hrv_morning !== 'number' || data.hrv_morning < 0 || data.hrv_morning > 200) {
        errors.push(`Invalid HRV value: ${data.hrv_morning}`);
      }
    }

    // 心拍数の範囲チェック
    if (data.resting_hr !== undefined) {
      if (typeof data.resting_hr !== 'number' || data.resting_hr < 30 || data.resting_hr > 120) {
        errors.push(`Invalid resting HR value: ${data.resting_hr}`);
      }
    }

    // 主観的指標の範囲チェック（1-5）
    const subjectiveMetrics = ['fatigue', 'stress', 'motivation', 'soreness', 'injury'];
    for (const metric of subjectiveMetrics) {
      if (data[metric] !== undefined) {
        if (typeof data[metric] !== 'number' || data[metric] < 1 || data[metric] > 5) {
          errors.push(`Invalid ${metric} value: ${data[metric]}`);
        }
      }
    }

    return errors;
  }

  static validateUCRData(data: any): string[] {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push("UCR data is not an object");
      return errors;
    }

    // スコアの範囲チェック
    if (typeof data.total_score !== 'number' || data.total_score < 0 || data.total_score > 100) {
      errors.push(`Invalid total score: ${data.total_score}`);
    }

    // コンポーネントスコアのチェック
    const components = ['hrv_score', 'rhr_score', 'sleep_score', 'subjective_score'];
    for (const component of components) {
      if (data[component] !== undefined) {
        const maxScore = component === 'hrv_score' ? 40 : 20;
        if (typeof data[component] !== 'number' || data[component] < 0 || data[component] > maxScore) {
          errors.push(`Invalid ${component}: ${data[component]}`);
        }
      }
    }

    return errors;
  }
}