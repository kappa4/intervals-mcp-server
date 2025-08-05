# キャッシュ最適化提案：過去データの永続化

## 現状の問題
- すべてのデータに一律のTTLを適用
- 過去データも1時間で期限切れ
- 不必要なキャッシュウォーミング

## 提案：データの時系列による差別化

### 1. TTLの動的設定
```typescript
// cache-config.ts に追加
export function getDynamicTTL(dataType: string, date: string): number {
  const dataDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.floor((today.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    // 未来のデータ（エラーケース）
    return 60 * 1000; // 1分
  } else if (daysDiff === 0) {
    // 今日のデータ
    return 60 * 60 * 1000; // 1時間
  } else if (daysDiff === 1) {
    // 昨日のデータ
    return 6 * 60 * 60 * 1000; // 6時間
  } else if (daysDiff <= 7) {
    // 1週間以内
    return 24 * 60 * 60 * 1000; // 24時間
  } else if (daysDiff <= 30) {
    // 1ヶ月以内
    return 7 * 24 * 60 * 60 * 1000; // 1週間
  } else {
    // 1ヶ月以上前
    return 30 * 24 * 60 * 60 * 1000; // 30日（実質的に永続）
  }
}
```

### 2. キャッシュウォーミングの最適化
```typescript
// cache-warming.ts の修正
private getOptimizedWarmingTasks(): WarmingTask[] {
  const tasks: WarmingTask[] = [];
  const today = new Date();
  
  // 今日と昨日のデータのみウォーミング
  for (let i = 0; i <= 1; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    tasks.push({
      name: `ucr_assessment_day_${i}`,
      type: "ucr_assessment",
      params: { date: date.toISOString().split('T')[0] },
      priority: 10 - i // 今日が最優先
    });
  }
  
  // 過去データは初回アクセス時にキャッシュ（長期TTL）
  return tasks;
}
```

### 3. Deno KVの永続性活用
```typescript
// wellness-cache.ts
async set<T>(key: string[], value: T, ttl?: number): Promise<CacheResult<void>> {
  // 日付を解析してTTLを動的に設定
  const keyComponents = parseCacheKey(key);
  const dateMatch = keyComponents.dateRange?.match(/(\d{4}-\d{2}-\d{2})/);
  
  if (dateMatch) {
    ttl = getDynamicTTL(keyComponents.dataType, dateMatch[1]);
  }
  
  // 残りの実装...
}
```

### 4. 環境変数の追加
```bash
# 過去データの永続化設定
CACHE_PERSIST_PAST_DATA=true
CACHE_PAST_DATA_DAYS=30  # 何日前までを「過去」とするか
CACHE_WARMING_DAYS=2     # ウォーミング対象の日数
```

## メリット
1. **キャッシュヒット率向上**: 過去データは常にキャッシュから提供
2. **API呼び出し削減**: intervals.icuへのリクエスト大幅減
3. **レスポンス高速化**: 過去データの即座の返却
4. **リソース効率化**: 不要なウォーミング処理の削減

## デプロイ戦略
1. **初回デプロイ**: 過去30日分のデータを一括キャッシュ
2. **通常デプロイ**: Deno KVの永続性により、キャッシュは保持
3. **キャッシュクリア**: 必要時のみ手動で実行

## 実装優先度
1. **高**: TTLの動的設定
2. **中**: キャッシュウォーミングの最適化
3. **低**: 管理画面でのキャッシュ統計表示