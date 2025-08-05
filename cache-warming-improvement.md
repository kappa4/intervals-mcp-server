# キャッシュウォーミング頻度の改善案

## 現状
- 固定値: 1時間ごと
- 環境変数での制御: なし

## 改善案

### 1. 環境変数での制御
```typescript
// ucr-intervals-client-cached.ts
const warmingInterval = parseInt(
  Deno.env.get("CACHE_WARMING_INTERVAL") || "3600000"
);
this.cacheWarmer.schedulePeriodicWarming(warmingInterval);
```

### 2. 推奨設定
- **開発環境**: 5分 (300000ms) - 頻繁なテスト用
- **本番環境**: 1時間 (3600000ms) - 現在のデフォルト
- **低負荷環境**: 6時間 (21600000ms) - リソース節約

### 3. 動的調整
```typescript
// アクセスパターンに基づいて頻度を調整
if (cacheHitRate < 50) {
  // ヒット率が低い場合は頻度を上げる
  warmingInterval = Math.max(warmingInterval / 2, 300000);
}
```

### 4. 環境変数追加
```bash
# .env
CACHE_WARMING=true
CACHE_WARMING_INTERVAL=3600000  # 1時間（ミリ秒）
CACHE_WARMING_ON_STARTUP=true
```