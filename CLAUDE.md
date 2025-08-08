# intervals-mcp-server プロジェクト専用 CLAUDE.md

## 【MUST】プロジェクト概要

intervals-mcp-serverは、intervals.icu APIへのMCP（Model Context Protocol）アクセスを提供するDeno/TypeScriptプロジェクトです。

### 主要機能
1. **intervals.icu API統合**: アクティビティ、ウェルネスデータの取得・更新
2. **UCR（Unified Continuous Readiness）機能**: 独自研究のレディネス指標計算
3. **MCP 2024-11-05プロトコル**: Claude経由でのリアルタイムアクセス
4. **OAuth2認証**: セキュアなAPI認証システム

## 【MUST】開発状況・コンテキスト

### 現在の状況
- **UCR機能統合済み**: calcReadinessのGAS版からTypeScript移植完了
- **MCPツール5種実装済み**: Claude経由でのUCR評価・分析が可能
- **テスト実装段階**: 包括的テスト戦略策定完了、実装準備中

### 重要な成果物
- UCRCalculator（ucr-calculator.ts）: 完全なUCR計算エンジン
- UCRToolHandler（ucr-tools.ts）: 5つのMCPツール
- UCRIntervalsClient（ucr-intervals-client.ts）: UCR特化API統合

## 【MUST】重要ドキュメント

Claude Code再開時は以下ドキュメントを自動参照してください：

### 1. UCR統合設計書
```
/Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/UCR_INTEGRATION_PLAN.md
```
- UCR機能の技術設計とアーキテクチャ
- GAS版からの移植仕様

### 2. Claude操作ガイド
```
/Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/UCR_CLAUDE_USAGE_GUIDE.md
```
- 朝のワークフロー例
- MCPツールの具体的使用方法
- トラブルシューティング

### 3. テスト実装計画書
```
/Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/UCR_TEST_IMPLEMENTATION_PLAN.md
```
- 包括的テスト戦略（単体・統合・E2E・回帰）
- Denoテストフレームワーク採用
- 4段階マイルストーン設定

### 4. 元仕様ドキュメント（calcReadiness）
```
/Users/k.takahashi/src/github.com/kappa4/calcReadiness/docs/
```
- AI_HANDOVER_GUIDE.md: 技術的概要
- IMPLEMENTATION_SPEC.md: 実装仕様
- calcReadiness.md: 機能説明

## 【MUST】技術スタック・環境

### ランタイム・言語
- **Deno**: 最新安定版
- **TypeScript**: 厳密な型定義
- **Deno Deploy**: 本番環境

### 主要技術
- **MCP 2024-11-05**: Model Context Protocol
- **intervals.icu API**: REST API統合
- **OAuth2 + JWT**: 認証・認可
- **Deno標準ライブラリ**: テスト・HTTP・暗号化

### 開発ツール
- **Deno組み込みテスト**: @std/testing
- **VSCode**: Deno拡張機能
- **Git**: バージョン管理

## 【MUST】開発規約

### コーディング規約
- **TypeScript厳密モード**: 型安全性最優先
- **Deno標準**: import maps、permissions、security model準拠
- **関数型志向**: 純粋関数、immutability重視
- **エラーハンドリング**: 明示的エラー型定義

### ファイル命名規約
- **kebab-case**: ファイル名（ucr-calculator.ts）
- **PascalCase**: クラス名（UCRCalculator）
- **camelCase**: 関数・変数名
- **UPPER_SNAKE_CASE**: 定数

### Git運用
- **main branch**: 本番反映用
- **feature branches**: 機能開発用
- **コミットメッセージ**: Conventional Commits準拠
- **コミット時の原則**: 
  - 削除より選択を優先（`git reset && git add 必要なファイル`）
  - テストファイルや一時ファイルは安易に削除・コミットしない
  - 意図的な変更のみをステージング
  - 作業用ファイルはコミットに含めない

## 【MUST】現在のタスク状況

### 完了済み
- [x] calcReadinessコード詳細分析
- [x] UCR計算ロジック抽出とデータフロー整理
- [x] intervals.icu API呼び出しパターン特定
- [x] TypeScript UCRCalculatorクラス設計
- [x] intervals-mcp-serverへのMCPツール統合
- [x] Claude操作パターン確立とテスト
- [x] UCRテスト実装計画策定・ドキュメント化

### 進行中・次回実施予定
- [ ] UCRテスト実装（現在のタスク）
- [ ] UCRテスト実行と齟齬検出
- [ ] 齟齬解消とリファクタリング
- [ ] GAS版との並行運用・検証
- [ ] **キャッシュ最適化v2実装**（UCRロジック変更対応版）
  - 提案書: `/Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/cache-optimization-proposal-v2.md`
  - UCRバージョン管理によるキャッシュ無効化機能
  - 動的TTL + バージョン管理統合

## 【SHOULD】セットアップ・起動方法

### 環境変数設定
```bash
ATHLETE_ID=i123456              # intervals.icu アスリートID
API_KEY=your_api_key           # intervals.icu APIキー
JWT_SECRET_KEY=min32chars       # JWT署名用秘密鍵（32文字以上）
ORIGIN=https://your-app.deno.dev # OAuth用オリジンURL
```

### 開発環境起動
```bash
# 開発サーバ起動
deno run --allow-net --allow-env main.ts

# テスト実行
deno test --allow-net --allow-env --coverage=coverage

# カバレッジレポート
deno coverage coverage --lcov > coverage.lcov
```

## 【SHOULD】UCR機能の概要

### UCR（Unified Continuous Readiness）とは
- **目的**: トレーニング準備状態の総合評価（0-100点）
- **構成**: HRV(40pt) + RHR(20pt) + Sleep(20pt) + Subjective(20pt)
- **特徴**: 27ステート解釈マトリクス、トレンド分析

### MCPツール5種
1. **get_ucr_assessment**: 基本UCR評価取得
2. **calculate_ucr_trends**: 詳細トレンド分析
3. **update_wellness_assessment**: ウェルネスデータ更新＋UCR再計算
4. **check_ucr_setup**: カスタムフィールド設定確認
5. **batch_calculate_ucr**: 期間指定一括計算

### Claude経由の使用例
```
おはようございます。今朝のUCR評価はどうですか？
→ get_ucr_assessment実行、トレーニング推奨表示

今朝は少し疲れています。疲労度2、ストレス3で更新してください。
→ update_wellness_assessment実行、UCR再計算
```

## 【SHOULD】開発ツール

### 高速サーバー起動スクリプト (test-server.sh)
タイムアウト問題を解決し、3秒以内にサーバー起動を確認：

```bash
#!/bin/bash
# Kill any existing server
pkill -f "deno run.*main.ts" 2>/dev/null

# Set environment variables (実環境では適切な値に置換)
export ATHLETE_ID=i72555  # 本番環境では実際のIDを使用
export API_KEY=your_api_key  # 本番環境では実際のAPIキーを使用
export JWT_SECRET_KEY=test_jwt_secret_key_minimum_32_chars
export ORIGIN=http://localhost:8001
export PORT=8001

# Start server with health check
deno run --allow-net --allow-env --allow-read main.ts > server.log 2>&1 &
SERVER_PID=$!

# Wait for server (max 3 seconds)
for i in {1..6}; do
  if curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "Server is ready! PID: $SERVER_PID"
    exit 0
  fi
  sleep 0.5
done
```

### ChatGPT Actions APIテストコマンド
```bash
# アクティビティ取得
curl -X GET "http://localhost:8001/api/v1/activities?days=7" \
  -H "X-API-Key: YOUR_API_KEY" | jq '.'

# UCR評価取得
curl -X GET "http://localhost:8001/api/v1/ucr?date=2025-01-08" \
  -H "X-API-Key: YOUR_API_KEY" | jq '.score'

# ストリームデータ取得
curl -X GET "http://localhost:8001/api/v1/activities/ACTIVITY_ID/streams" \
  -H "X-API-Key: YOUR_API_KEY" | jq '.streams.available_streams'
```

## 【MAY】トラブルシューティング

### よくある問題と解決策
1. **API認証エラー**: ATHLETE_ID、API_KEYの確認
2. **OAuth設定**: ORIGIN URLとクライアント登録の確認
3. **テストデータ不足**: intervals.icuでのウェルネスデータ蓄積
4. **カスタムフィールド未設定**: UCRトレンド情報保存に必要
5. **TypeScriptエラー**:
   - メソッドバインディング: `map(this.method)` → `map(a => this.method(a))`
   - Deno KV undefined: `private kv: Deno.Kv` → `private kv?: Deno.Kv`
   - 重複メソッド定義: 同名メソッドの整理・削除

### デバッグコマンド
```bash
# ヘルスチェック
curl http://localhost:8000/health

# 情報確認
curl http://localhost:8000/info

# OAuth情報
curl http://localhost:8000/.well-known/oauth-authorization-server
```

---

**このCLAUDE.mdファイルは、プロジェクトの全体像把握と効率的な開発継続のために作成されています。**