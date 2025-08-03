# UCRテスト実装計画書

## 概要

本文書はUCR（Unified Continuous Readiness）機能の包括的テスト実装計画を定めます。

### 背景
- calcReadinessのGAS版からTypeScript/Deno版への移植
- ドキュメント整合性の確保とリファクタリング
- 品質保証とGAS版との数値一致確認

### 目標
- 全UCR機能の動作確認
- ドキュメントとの齟齬検出・解消
- パフォーマンス要件充足（レスポンス時間<3秒）
- 90%以上のコードカバレッジ達成

## テストアーキテクチャ

### アプローチ
**ハイブリッドアプローチ**：単体テスト + 統合テスト + E2Eテスト + 回帰テスト

### フレームワーク選定
**Deno組み込みテストフレームワーク**を採用

#### 選定理由
- ゼロ設定で即座に開始可能
- TypeScript完全サポート
- モッキング機能内蔵（@std/testing/mock）
- Denoセキュリティモデル統合
- 第三者依存なし

## ディレクトリ構造

```
intervals-mcp-server/
├── tests/
│   ├── unit/
│   │   ├── ucr-calculator_test.ts       # UCRCalculator単体テスト
│   │   ├── ucr-types_test.ts            # 型定義テスト
│   │   └── data-conversion_test.ts      # データ変換ロジック
│   ├── integration/
│   │   ├── ucr-intervals-client_test.ts # API統合テスト
│   │   └── ucr-tools_test.ts            # MCPツール統合テスト
│   ├── e2e/
│   │   └── mcp-handler_test.ts          # エンドツーエンドテスト
│   ├── fixtures/
│   │   ├── wellness-data.ts             # テストデータ
│   │   ├── expected-results.ts          # 期待値データ
│   │   └── mock-responses.ts            # APIモックレスポンス
│   └── helpers/
│       ├── test-setup.ts                # 共通セットアップ
│       └── assertions.ts                # カスタムアサーション
├── deno.json                            # テスト設定追加
└── README_TESTING.md                    # テスト実行ガイド
```

## テスト層定義

### 1. 単体テスト層
- **対象**: UCRCalculator、データ変換ロジック
- **目的**: 算術的正確性、型安全性
- **ツール**: @std/testing、@std/testing/bdd

### 2. API統合テスト層
- **対象**: intervals.icu連携、UCRIntervalsClient
- **目的**: データフロー統合、API呼び出し
- **ツール**: @std/testing/mock（API呼び出しモック）

### 3. MCPプロトコルテスト層
- **対象**: MCPツール5種、mcp-handler
- **目的**: エンドツーエンド動作確認
- **ツール**: fixtureデータによる実行テスト

### 4. 回帰テスト層
- **対象**: GAS版との数値一致確認
- **目的**: 移植精度保証
- **ツール**: データドリブンアプローチ

## 実装マイルストーン

### 即座実行ステップ（着手）
1. テストディレクトリ構造作成
2. deno.json にテスト設定追加
3. fixtures/wellness-data.ts 作成（基本テストデータ）
4. tests/unit/ucr-calculator_test.ts の骨格作成

### 第1マイルストーン：単体テスト完了
#### 実装内容
- UCRCalculator基本算術ロジックテスト
  - シグモイド関数（HRVスコア）
  - 線形関数（RHRスコア）
  - 睡眠スコア計算
  - 主観的スコア計算
- データ変換テスト（intervals.icu 1-4→1-5スケール）
- 境界値・エラーケーステスト

#### 完了判定基準
- 90%以上のコードカバレッジ
- 全算術テスト通過
- 型安全性確認

### 第2マイルストーン：統合テスト完了
#### 実装内容
- intervals.icu API統合テスト（モック）
- UCRIntervalsClient テスト
- データフロー統合テスト
- カスタムフィールド更新テスト

#### 完了判定基準
- 全API呼び出しパス検証済み
- モックレスポンステスト通過
- データ変換精度確認

### 第3マイルストーン：E2Eテスト完了
#### 実装内容
- MCPツール5種すべてのE2Eテスト
  - get_ucr_assessment
  - calculate_ucr_trends
  - update_wellness_assessment
  - check_ucr_setup
  - batch_calculate_ucr
- mcp-handler統合テスト
- エラーハンドリングテスト

#### 完了判定基準
- 全MCPツール正常動作確認
- エラーケース適切処理
- MCP 2024-11-05プロトコル準拠

### 最終マイルストーン：品質確認・リファクタリング
#### 実装内容
- GAS版との数値一致確認
- パフォーマンステスト（レスポンス時間<3秒）
- ドキュメント齟齬チェック・修正
- 27ステート解釈マトリクス検証

#### 完了判定基準
- 品質ゲート全クリア
- ドキュメント整合性確認
- パフォーマンス要件充足

## 品質ゲート

| テスト層 | 品質基準 |
|---------|----------|
| 単体テスト | 90%以上のコードカバレッジ |
| 統合テスト | 全API呼び出しパスの検証 |
| E2Eテスト | 全MCPツールの正常動作確認 |
| 回帰テスト | GAS版との数値誤差±1%以内 |

## テスト実行コマンド

### 基本実行
```bash
# 全テスト実行（カバレッジ付き）
deno test --allow-net --allow-env --coverage=coverage

# 単体テストのみ（並列実行）
deno test tests/unit/ --parallel

# 統合テスト（ネットワーク許可）
deno test tests/integration/ --allow-net

# E2Eテスト（全許可）
deno test tests/e2e/ --allow-all

# カバレッジレポート生成
deno coverage coverage --lcov > coverage.lcov
```

### 開発時用コマンド
```bash
# ウォッチモード
deno test --watch tests/unit/

# 特定テストファイル
deno test tests/unit/ucr-calculator_test.ts

# 失敗時停止
deno test --fail-fast
```

## リスク軽減策

### 1. API制限回避
- **リスク**: intervals.icu APIレート制限
- **対策**: 間隔制御、モック優先使用

### 2. テストデータ不足
- **リスク**: 多様なシナリオ未カバー
- **対策**: 多様なシナリオ fixture準備

### 3. 計算精度問題
- **リスク**: GAS版との数値不一致
- **対策**: GAS版との詳細比較実装

### 4. パフォーマンス課題
- **リスク**: レスポンス時間基準未達
- **対策**: プロファイリング・最適化

## 完了チェックリスト

### テスト実行
- [ ] 全テスト通過（単体・統合・E2E）
- [ ] カバレッジ目標達成（90%+）
- [ ] GAS版数値一致確認（±1%）

### 品質確認
- [ ] ドキュメント整合性確認
- [ ] パフォーマンス要件充足（<3秒）
- [ ] エラーハンドリング網羅

### ドキュメント
- [ ] テスト実行ガイド作成
- [ ] 齟齬修正完了
- [ ] リファクタリング反映

## 関連ドキュメント

- [UCR統合計画](./UCR_INTEGRATION_PLAN.md)
- [Claude操作ガイド](./UCR_CLAUDE_USAGE_GUIDE.md)
- [calcReadiness仕様](../calcReadiness/docs/)
- [intervals.icu API仕様](./docs/intervals-openapi-spec.json)

---

**作成日**: 2025-08-03  
**更新日**: 2025-08-03  
**承認者**: システム設計担当