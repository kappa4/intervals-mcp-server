# キャッシュ最適化提案 v2：UCRロジック変更対応版

## 概要
ユーザーからの重要な指摘「UCRの計算ロジックや係数の変更があった場合には過去データの再計算が必要になるため、その場合はキャッシュの再構築が必要ではないでしょうか」を受けて、キャッシュ戦略を再設計しました。

## 中核的解決策：UCRロジックバージョン管理

### 1. バージョン付きキャッシュキー設計
```typescript
// cache-config.ts に追加
export const UCR_VERSION = "1.0.0"; // セマンティックバージョニング

// キャッシュキー構造の拡張
export function buildCacheKey(components: CacheKeyComponents): string[] {
  const { version, dataType, athleteId, dateRange, metaKey } = components;
  const keyParts: string[] = [version, dataType, athleteId];
  
  if (dateRange) {
    keyParts.push(dateRange);
  }
  
  // UCRロジックのバージョンを追加
  if (dataType === "wellness" || dataType === "ucr") {
    keyParts.push(`ucr-${UCR_VERSION}`);
  }
  
  if (metaKey) {
    keyParts.push(metaKey);
  }
  
  return keyParts;
}
```

### 2. 動的TTL + バージョン管理の統合
```typescript
// cache-config.ts
export function getDynamicTTL(dataType: string, date: string, ucrVersion?: string): number {
  // UCRロジックのバージョンチェック
  if (ucrVersion && ucrVersion !== UCR_VERSION) {
    return 60 * 1000; // 古いバージョンは1分で期限切れ
  }
  
  const dataDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.floor((today.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    return 60 * 1000; // 未来のデータ（エラーケース）
  } else if (daysDiff === 0) {
    return 60 * 60 * 1000; // 今日のデータ: 1時間
  } else if (daysDiff === 1) {
    return 6 * 60 * 60 * 1000; // 昨日のデータ: 6時間
  } else if (daysDiff <= 7) {
    return 24 * 60 * 60 * 1000; // 1週間以内: 24時間
  } else if (daysDiff <= 30) {
    return 7 * 24 * 60 * 60 * 1000; // 1ヶ月以内: 1週間
  } else {
    return 30 * 24 * 60 * 60 * 1000; // 1ヶ月以上前: 30日（実質永続）
  }
}
```

### 3. 自動バージョン検出とキャッシュ無効化
```typescript
// cache-version-manager.ts に追加
export class CacheVersionManager {
  private currentUCRVersion: string;
  
  constructor() {
    this.currentUCRVersion = Deno.env.get("UCR_VERSION") || UCR_VERSION;
  }
  
  async checkAndInvalidateOnVersionChange(): Promise<void> {
    const storedVersion = await this.getStoredUCRVersion();
    
    if (storedVersion && storedVersion !== this.currentUCRVersion) {
      log("WARN", `UCR version changed: ${storedVersion} -> ${this.currentUCRVersion}`);
      
      if (Deno.env.get("CACHE_REBUILD_ON_VERSION_CHANGE") === "true") {
        await this.invalidateUCRCaches();
        await this.scheduleGradualRecalculation();
      }
    }
    
    await this.storeUCRVersion(this.currentUCRVersion);
  }
  
  private async scheduleGradualRecalculation(): Promise<void> {
    // 優先度付き再計算スケジュール
    const priorities = [
      { days: 0, priority: 10 },    // 今日
      { days: 1, priority: 9 },     // 昨日
      { days: 7, priority: 8 },     // 1週間
      { days: 30, priority: 7 },    // 1ヶ月
    ];
    
    for (const { days, priority } of priorities) {
      setTimeout(() => {
        this.recalculateDataForDays(days);
      }, priority * 1000); // 優先度に基づく遅延
    }
  }
}
```

## 環境変数設定
```bash
# UCRロジック管理
UCR_VERSION=1.0.0
CACHE_UCR_VERSION_CHECK=true
CACHE_REBUILD_ON_VERSION_CHANGE=true

# 動的TTL設定
CACHE_PERSIST_PAST_DATA=true
CACHE_PAST_DATA_DAYS=30

# ウォーミング設定
CACHE_WARMING_DAYS=2
CACHE_WARMING_INTERVAL=43200000  # 12時間（1日2回）
```

## UCRバージョン管理ガイドライン

### バージョニング規則
- **パッチ版（1.0.1）**: バグ修正のみ。キャッシュ無効化不要
- **マイナー版（1.1.0）**: 係数調整。選択的キャッシュ無効化
- **メジャー版（2.0.0）**: アルゴリズム変更。全キャッシュ無効化

### デプロイ時のワークフロー
1. **バージョンチェック**: 前回デプロイ時のUCR_VERSIONと比較
2. **影響度判定**: セマンティックバージョニングによる自動判定
3. **段階的無効化**: 優先度に基づく再計算スケジュール
4. **監視**: キャッシュヒット率とエラー率の追跡

## メリット
1. **整合性保証**: UCRロジック変更時の自動的な一貫性維持
2. **効率性**: 不変な過去データの長期キャッシュ
3. **制御性**: 環境変数による柔軟な設定
4. **監視性**: バージョン変更の透明性
5. **運用性**: 段階的更新によるシステム負荷分散

## 実装優先度
1. **最高**: UCRバージョン管理とキャッシュキー拡張
2. **高**: 動的TTLとバージョンチェック統合
3. **中**: 段階的再計算スケジューラ
4. **低**: 管理画面での監視機能

## リスク対策
- **ロールバック対応**: 古いバージョンのキャッシュ保持オプション
- **エラー処理**: バージョン不整合時のフォールバック機能
- **監視**: バージョン変更とキャッシュ無効化の詳細ログ
- **負荷分散**: 段階的再計算による API 負荷制御