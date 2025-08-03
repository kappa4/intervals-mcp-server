# UCR KVキャッシュ機能 引き継ぎ資料

## 概要
intervals-mcp-serverにDeno KVを使用したウェルネスデータキャッシュ機能を実装しました。これにより、intervals.icu APIへのアクセスを最適化し、レスポンス速度の向上とAPI呼び出し回数の削減を実現しています。

## 実装内容

### Phase 1-2: 基盤実装
- **cache-types.ts**: キャッシュシステムの型定義
- **cache-config.ts**: 設定管理とデフォルト値
- **cache-version-manager.ts**: デプロイ時のキャッシュバージョン管理
- **wellness-cache.ts**: Deno KVを使用した基本キャッシュ実装
- **cache-utils.ts**: ユーティリティ関数

### Phase 3: UCRIntervalsClient統合  
- **ucr-intervals-client-cached.ts**: CachedUCRIntervalsClientクラスの実装
  - getWellnessDataForUCRメソッドのキャッシュ対応
  - batchCalculateUCRメソッドの最適化
  - ウェルネスデータ更新時のキャッシュ無効化

### Phase 4: 高度な最適化機能
- **cache-warming.ts**: よく使用されるデータの事前読み込み
- **cache-stats.ts**: 詳細な統計情報収集とパフォーマンス監視
- **background-updater.ts**: 期限切れ前のプロアクティブなキャッシュ更新

### Phase 5: テストと本番準備
- **tests/integration/cache-integration_test.ts**: 統合テスト
- TypeScriptエラーの修正
- 本番デプロイ実施

## 技術的な注意事項

### 1. Deno KV expireInの問題
Deno KVのexpireInオプションが期待通りに動作しないため、手動でTTL管理を実装しています：

```typescript
// Manual TTL check since Deno KV expireIn is not working reliably
const ttlMs = result.value.ttl || getTTLMilliseconds(keyComponents.dataType, this.config);
if (isExpired(result.value.cachedAt, ttlMs)) {
  await kv.delete(kvKey);
  // ...
}
```

### 2. キャッシュ設定
環境変数で以下の設定が可能：
- `CACHE_ENABLED`: キャッシュ機能の有効/無効（デフォルト: true）
- `CACHE_WARMING`: キャッシュウォーミングの有効/無効（デフォルト: true）
- `CACHE_BACKGROUND_UPDATE`: バックグラウンド更新の有効/無効（デフォルト: true）

### 3. TTL設定
- ウェルネスデータ: 最近のデータは1時間、古いデータは24時間
- アクティビティ: 1時間
- アスリート情報: 24時間
- メタデータ: 30日

## 環境変数設定

### Deno Deploy
以下の環境変数を設定してください：
- `ATHLETE_ID`: intervals.icuのアスリートID
- `API_KEY`: intervals.icu APIキー
- `JWT_SECRET_KEY`: JWT署名用秘密鍵（32文字以上）
- `ORIGIN`: https://intervals-mcp-server.deno.dev

### Railway（代替デプロイ先）
既に設定済み

## 動作確認

### ヘルスチェック
```bash
curl https://intervals-mcp-server.deno.dev/health
```

期待される応答：
```json
{
  "status": "healthy",
  "kv_enabled": true,
  "cache_enabled": true,
  ...
}
```

### キャッシュ動作確認
Claude経由でUCRツールを使用すると、初回はAPIを呼び出し、2回目以降はキャッシュから返されます。

## トラブルシューティング

### 1. キャッシュが効かない
- 環境変数`CACHE_ENABLED`が`false`になっていないか確認
- Deno KVが正しく初期化されているか確認

### 2. 古いデータが返される
- TTL設定を確認
- 手動でキャッシュクリアが必要な場合は、新しいバージョンをデプロイ

### 3. エラーが発生する
- ログを確認（`log`関数の出力）
- Deno KVのサイズ制限（キー: 2KiB、値: 64KiB）を超えていないか確認

## 今後の改善案

1. **パターンベースのキャッシュ無効化**: Phase 4で簡易実装のみ
2. **カスケード削除**: 関連するキャッシュエントリの自動削除
3. **キャッシュヒット率の可視化**: Grafanaなどでのモニタリング
4. **動的TTL調整**: アクセスパターンに基づくTTL最適化

## 関連ドキュメント
- UCR_KV_CACHE_IMPLEMENTATION_PLAN.md: 実装計画
- UCR_INTEGRATION_PLAN.md: UCR機能全体の設計
- UCR_CLAUDE_USAGE_GUIDE.md: Claude経由での使用方法