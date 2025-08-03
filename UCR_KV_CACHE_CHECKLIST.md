# UCR KVキャッシュ実装 チェックリスト

## 🔴 即対応が必要な項目

### 1. Deno Deploy環境変数設定
- [ ] https://dash.deno.com にアクセス
- [ ] intervals-mcp-serverプロジェクトを選択
- [ ] Settings → Environment Variablesで以下を設定：
  - [ ] `ATHLETE_ID`: （Railwayと同じ値）
  - [ ] `API_KEY`: （Railwayと同じ値）
  - [ ] `JWT_SECRET_KEY`: （Railwayと同じ値、32文字以上）
  - [ ] `ORIGIN`: https://intervals-mcp-server.deno.dev
- [ ] 設定後、自動的に再デプロイされることを確認

### 2. 動作確認
- [ ] ヘルスチェック確認
  ```bash
  curl https://intervals-mcp-server.deno.dev/health
  ```
  - cache_enabled: true を確認
  - kv_enabled: true を確認

- [ ] Claude経由でUCRツール動作確認
  - [ ] get_ucr_assessment実行
  - [ ] 2回目の実行でキャッシュヒット確認（ログで確認）

## 🟡 推奨確認項目

### 3. キャッシュ動作の検証
- [ ] intervals.icuのウェルネスデータを更新
- [ ] update_wellness_assessmentツール実行
- [ ] キャッシュが正しく無効化されることを確認

### 4. パフォーマンス確認
- [ ] 初回アクセス時のレスポンス時間測定
- [ ] キャッシュヒット時のレスポンス時間測定
- [ ] 改善率の確認（目標: 80%以上の高速化）

### 5. エラーハンドリング確認
- [ ] intervals.icu APIが停止している場合の動作確認
- [ ] 期限切れキャッシュからのフォールバック動作確認

## 🟢 定期確認項目（運用開始後）

### 6. 監視項目
- [ ] キャッシュヒット率の確認（週次）
- [ ] エラー率の確認（日次）
- [ ] Deno KVストレージ使用量の確認（月次）

### 7. メンテナンス
- [ ] 不要なキャッシュエントリのクリーンアップ（月次）
- [ ] TTL設定の見直し（四半期）
- [ ] パフォーマンスメトリクスの分析（月次）

## 📝 ドキュメント確認

### 8. 関連ドキュメントの確認
- [ ] UCR_KV_CACHE_HANDOVER_DOCUMENT.md 読了
- [ ] UCR_KV_CACHE_WORK_REPORT.md 読了
- [ ] UCR_KV_CACHE_IMPLEMENTATION_PLAN.md 参照

### 9. コード理解
- [ ] cache/wellness-cache.ts の手動TTL管理を理解
- [ ] ucr-intervals-client-cached.ts のキャッシュ統合を理解
- [ ] バックグラウンド更新の仕組みを理解

## 🔧 トラブルシューティング準備

### 10. 問題発生時の対応
- [ ] ログ確認方法の理解（Deno Deploy Dashboard）
- [ ] キャッシュ無効化方法の理解（新バージョンデプロイ）
- [ ] 環境変数変更時の影響範囲の理解

## 💡 今後の改善検討

### 11. 機能拡張の検討
- [ ] キャッシュメトリクスダッシュボードの必要性評価
- [ ] より高度なキャッシュ戦略の検討
- [ ] 他のAPIエンドポイントへのキャッシュ拡張検討

---

**注意**: 🔴の項目は本日中に完了してください。特に環境変数設定は、現在サービスが停止している原因となっています。