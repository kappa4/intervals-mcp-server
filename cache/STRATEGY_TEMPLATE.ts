/**
 * キャッシュストラテジーテンプレート
 * 
 * このファイルをコピーして、新しいストラテジーを作成してください。
 * 
 * 使用方法:
 * 1. このファイルをコピー: cp STRATEGY_TEMPLATE.ts your-strategy.ts
 * 2. クラス名を変更: TemplateCacheStrategy → YourCacheStrategy
 * 3. 必要なロジックを実装
 * 4. テストを作成
 */

import type { 
  ICacheStrategy, 
  CacheContext, 
  CacheResult,
  ICacheStorage 
} from "./cache-strategy-types.ts";
import { log } from "../logger.ts";

/**
 * [説明をここに記載]
 * 
 * 例: 特定の条件下でキャッシュの挙動を制御するストラテジー
 */
export class TemplateCacheStrategy implements ICacheStrategy {
  private storage: ICacheStorage;
  
  // カスタム設定を追加可能
  private readonly config = {
    defaultTTL: 3600000,        // 1時間
    shortTTL: 5000,             // 5秒
    longTTL: 86400000,          // 24時間
    enableValidation: true,     // データ検証を有効化
  };

  constructor(storage: ICacheStorage) {
    this.storage = storage;
  }

  /**
   * キャッシュから値を取得
   */
  async get<T>(key: string): Promise<CacheResult<T>> {
    const startTime = performance.now();
    
    try {
      const value = await this.storage.get<T>(key);
      
      if (value !== null) {
        return {
          success: true,
          cached: true,
          data: value,
          metrics: {
            operationTime: performance.now() - startTime,
            cacheHit: true
          }
        };
      }
      
      return {
        success: true,
        cached: false,
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false
        }
      };
    } catch (error) {
      log("ERROR", `Cache get error: ${error}`);
      return {
        success: false,
        cached: false,
        error: String(error),
        metrics: {
          operationTime: performance.now() - startTime,
          cacheHit: false
        }
      };
    }
  }

  /**
   * キャッシュに値を設定
   */
  async set<T>(key: string, value: T, context: CacheContext): Promise<void> {
    // データ検証
    if (this.config.enableValidation && !this.isValidData(value, context)) {
      log("DEBUG", `Skipping cache for invalid data: ${key}`);
      return;
    }

    // キャッシュすべきか判定
    if (!this.shouldCache(context)) {
      log("DEBUG", `Skipping cache based on context: ${key}`);
      return;
    }

    const ttl = this.getTTL(context);
    
    try {
      await this.storage.set(key, value, ttl);
      log("DEBUG", `Cached ${key} with TTL ${ttl}ms`);
    } catch (error) {
      log("ERROR", `Cache set error: ${error}`);
    }
  }

  /**
   * キャッシュから値を削除
   */
  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * キャッシュすべきかどうかを判定
   * 
   * TODO: ここに具体的な判定ロジックを実装
   */
  shouldCache(context: CacheContext): boolean {
    // 例: 特定のデータタイプのみキャッシュ
    if (context.dataType === "metadata") {
      return false;
    }
    
    // 例: データサイズが大きすぎる場合はキャッシュしない
    if (context.dataSize && context.dataSize > 1024 * 1024) { // 1MB
      return false;
    }
    
    return true;
  }

  /**
   * TTL（Time To Live）を取得
   * 
   * TODO: ここに具体的なTTL決定ロジックを実装
   */
  getTTL(context: CacheContext): number {
    // 例: 条件に応じてTTLを決定
    
    // 今日のデータ
    if (context.isToday) {
      return this.config.shortTTL;
    }
    
    // 最近のデータ
    if (context.isRecent) {
      return this.config.defaultTTL;
    }
    
    // 古いデータ
    return this.config.longTTL;
  }

  /**
   * データが有効かどうかを検証
   * 
   * TODO: ここにデータ検証ロジックを実装
   */
  isValidData?(data: any, context: CacheContext): boolean {
    // 空データのチェック
    if (!data) {
      return false;
    }

    // 配列の場合
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return false;
      }
      
      // 例: 特定のフィールドが必須
      if (context.dataType === "wellness") {
        return data.some(item => 
          item.hrv !== null || 
          item.rhr !== null || 
          item.fatigue !== null
        );
      }
    }

    // オブジェクトの場合
    if (typeof data === 'object') {
      // 例: 必須フィールドのチェック
      // return 'requiredField' in data;
    }

    return true;
  }

  /**
   * カスタムメソッドを追加可能
   */
  private customLogic(context: CacheContext): void {
    // 必要に応じて独自のロジックを追加
  }
}

/**
 * テスト用のモックストレージ実装例
 */
export class MockCacheStorage implements ICacheStorage {
  private storage = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.storage.get(key) || null;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.storage.set(key, value);
    // 実際の実装ではTTL後に自動削除
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }
}