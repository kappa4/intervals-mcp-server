# キャッシュ実装メモ

## Phase 2完了時点（2025-08-03）

### 実装済み機能
- ✅ WellnessCache基本実装（get/set/delete）
- ✅ バージョン管理機能
- ✅ メトリクス収集
- ✅ エラーハンドリング
- ✅ TTL機能（Deno KV expireIn使用）
- ✅ 単体テスト（45テスト）

### 既知の問題と対応方針

#### TTL機能の挙動
- **問題**: テスト環境でexpireInが期待通り動作しない
- **対応**: 
  1. プレビューデプロイ（`deno deploy`）で動作確認
  2. 正常動作すればそのまま使用
  3. 問題があれば手動TTL管理を実装

#### 手動TTL管理（必要な場合のみ）
```typescript
// cachedAtとttlから手動で有効期限をチェック
if (isExpired(cacheEntry)) {
  await kv.delete(key);
  return { cached: false };
}
```

### Phase 3開始前の確認事項
1. プレビュー環境でのTTL動作確認
2. UCRIntervalsClientの既存実装調査
3. 統合ポイントの特定

### テストコマンド
```bash
# キャッシュテスト実行
deno test tests/unit/cache/ --allow-net --allow-env --unstable-kv

# プレビューデプロイ
deno deploy

# 本番デプロイ（TTL動作確認後）
deno deploy --prod
```