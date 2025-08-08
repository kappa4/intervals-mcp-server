# intervals-mcp-server セッション学習記録

> 2025年1月8日のセッションで獲得した重要な知識

## ChatGPT Actions統合

### 認証設定のトラブルシューティング
**問題**: ChatGPTが`Bearer`トークンで送信するが、サーバーは`X-API-Key`ヘッダーを期待
**解決**: ChatGPT Actions設定で明示的に`Header name: X-API-Key`を指定する必要がある

### streamエンドポイントの生データ対応
```typescript
// streams-handler.tsの修正ポイント
private formatStreams(streams: any, activity: any): any {
  const result: any = {
    available_streams: [],
    statistics: {},  // 統計情報
    data: {}         // 1秒ごとの生データ配列を追加
  };
  
  // 例: パワーデータ
  if (streams.watts?.length > 0) {
    result.data.power = streams.watts;  // 生データ配列を含める
  }
}
```

## intervals.icu API仕様の重要な発見

### streams APIの正しいエンドポイント
```typescript
// 間違い: athleteパスを使用
`/api/v1/athlete/${athleteId}/activities/${activityId}/streams`

// 正解: activityパス直接使用
`/api/v1/activity/${activityId}/streams`
```

### データ構造の違い
- **streams**: 1秒ごとの時系列生データ（7000+データポイント）
- **intervals**: ラップ/区間の集計データのみ（生データなし）

## 開発効率化ツール

### 高速テストサーバー起動スクリプト（test-server.sh）
```bash
#!/bin/bash
# 3秒以内にサーバー起動を確認
pkill -f "deno run.*main.ts" 2>/dev/null
export ATHLETE_ID=i72555
export API_KEY=196l99q9husoccp97i5djt9pt
export JWT_SECRET_KEY=test_jwt_secret_key_minimum_32_chars
export ORIGIN=http://localhost:8001
export PORT=8001

deno run --allow-net --allow-env --allow-read main.ts > server.log 2>&1 &
SERVER_PID=$!

for i in {1..6}; do
  if curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "Server is ready! PID: $SERVER_PID"
    exit 0
  fi
  sleep 0.5
done
```

## テスト用クレデンシャル
- **APIキー（テスト）**: 196l99q9husoccp97i5djt9pt
- **アスリートID（本番）**: i72555
- **テスト用アクティビティID**: i91086716（2025-01-07の朝のライド）

## 実装パターン

### ChatGPT Actions vs MCP データ処理
- **ChatGPT Actions**: RESTful API、構造化されたJSONレスポンス
- **MCP**: ツール呼び出し、テキスト形式のレスポンス
- 両方で生データアクセスが必要な場合は、共通のクライアントを使用

### コミット戦略
関心事ごとに分離：
1. 機能追加（feat）
2. テスト追加（test）
3. バグ修正（fix）
それぞれ独立したコミットとして記録

## 次回セッションへの申し送り

1. **OpenAPI仕様書の更新確認**
   - streams APIレスポンスに`data`フィールドが追加されたことを反映する必要あり

2. **パフォーマンス考慮事項**
   - 7000+データポイントの転送はレスポンスサイズが大きい
   - 必要に応じてデータ圧縮やページネーションの検討

3. **エラーハンドリング改善の余地**
   - 403/404エラーのより詳細なメッセージ
   - アクティビティにstreamsデータがない場合の処理

---

**このドキュメントは今後のセッションで intervals-mcp-server プロジェクトを継続する際の参考資料として作成されました。**