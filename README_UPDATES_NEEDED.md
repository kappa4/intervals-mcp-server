# README.md 更新必要事項

## 追加すべきセクション

### 1. テスト実行
```markdown
## テスト

### 自動テストの実行
すべての変更において、デプロイ前のテスト実行が必須です。

```bash
# 単体テスト
deno test --allow-net --allow-env

# ブラックボックステスト（本番環境）
./auto-test-runner.ts
```

詳細は[TESTING_GUIDELINES.md](./TESTING_GUIDELINES.md)を参照してください。
```

### 2. 開発環境セットアップ
```markdown
## 開発環境セットアップ

### 必要なツール
- Deno 1.x以上
- Git
- テキストエディタ（VSCode推奨）

### 初期設定
1. リポジトリのクローン
2. 環境変数の設定（`.env`ファイル作成）
3. OAuth クライアントの登録
```

### 3. トラブルシューティング
```markdown
## トラブルシューティング

### OAuth認証エラー
- リダイレクトURIが正しく設定されているか確認
- クライアントID/シークレットが有効か確認

### キャッシュ関連の問題
- Deno KVの権限が適切か確認
- TTL設定を確認

### MCP接続エラー
- Claude.aiで正しくサーバーが設定されているか確認
- 認証トークンの有効期限を確認
```

### 4. アーキテクチャ概要
```markdown
## アーキテクチャ

### 主要コンポーネント
- **MCP Server**: Claude.aiとの通信を処理
- **UCR Calculator**: 統合継続的準備度の計算エンジン
- **Wellness Cache**: Deno KVを使用したキャッシュレイヤー
- **OAuth Handler**: 認証・認可の管理
```

### 5. パフォーマンス・制限事項
```markdown
## パフォーマンスと制限事項

### レート制限
- intervals.icu API: 1分あたり100リクエスト
- キャッシュTTL: 24時間

### 推奨事項
- 大量のデータ取得時はバッチ処理を使用
- キャッシュを積極的に活用
```

## 更新すべき既存セクション

### 1. 機能一覧
- UCR（統合継続的準備度）機能の詳細説明を追加
- 各MCPツールの使用例を追加

### 2. 環境変数
- すべての環境変数とその説明を網羅
- 必須/オプションの明記

### 3. デプロイ手順
- Deno Deployの具体的な手順
- 環境変数の設定方法
- ドメイン設定

## 削除・更新すべき古い情報

- [ ] 古いAPIエンドポイントの記述
- [ ] 非推奨の設定オプション
- [ ] 未実装機能への言及

## 追加すべきファイル参照

- [TESTING_GUIDELINES.md](./TESTING_GUIDELINES.md)
- [AUTOMATED_TEST_SOLUTION.md](./AUTOMATED_TEST_SOLUTION.md)
- [UCR_CLAUDE_USAGE_GUIDE.md](./UCR_CLAUDE_USAGE_GUIDE.md)
- [FINAL_CHECKLIST.md](./FINAL_CHECKLIST.md)