# UCRトレンド分析機能実装計画

## 概要
calcReadinessのGAS版を参考に、intervals-mcp-serverにUCRモメンタム（UCR-M）とUCRボラティリティ（UCR-V）機能を実装します。並行実装・検証アプローチにより品質と安全性を確保します。

## 実装戦略
**並行実装・検証アプローチ**
- GAS版の実績ある計算ロジックを忠実にTypeScript移植
- 既存機能への影響を最小化
- 新旧実装の比較による精度確認
- 検証完了後に安全に切り替え

## フェーズ別実装計画

### フェーズ1: 基盤構築
```
Priority: HIGH | Dependencies: None
```

#### 1.1 ディレクトリ構造準備
```
src/trend/
├── trend-math-utils.ts      # 数学計算ユーティリティ
├── momentum-calculator.ts   # UCRモメンタム計算エンジン
├── volatility-calculator.ts # UCRボラティリティ計算エンジン
├── trend-interpreter.ts     # 27ステート解釈システム
└── trend-engine.ts          # メイン統合エンジン

tests/unit/trend/
├── trend-math-utils_test.ts
├── momentum-calculator_test.ts
├── volatility-calculator_test.ts
├── trend-interpreter_test.ts
└── ucr-trend-analysis_test.ts
```

#### 1.2 型定義拡張 (ucr-types.ts)
- TrendConfig インターフェース追加
- TrendResult インターフェース拡張（GAS版準拠）
- VolatilityBands、MomentumResult型定義

#### 1.3 数学ユーティリティ実装 (trend-math-utils.ts)
- 統計関数群（mean, stdDev, percentile）
- EMA（指数平滑移動平均）計算
- ボリンジャーバンド計算
- 線形回帰関数（将来拡張用）

#### 1.4 設定システム統合
- GAS版TREND_CONFIGをTypeScript化
- 既存UCRConfigとの統合
- デフォルト値検証

### フェーズ2: コア計算エンジン
```
Priority: HIGH | Dependencies: フェーズ1完了
```

#### 2.1 UCRモメンタム計算 (momentum-calculator.ts)
```typescript
// 7日間ROC計算仕様
momentum = ((currentScore - pastScore) / pastScore) * 100

// 5段階カテゴリ分類
強正: momentum >= 10
正:   momentum >= 2
中立: -2 < momentum < 2
負:   momentum <= -2
強負: momentum <= -10
```

#### 2.2 UCRボラティリティ計算 (volatility-calculator.ts)
```typescript
// ATR → EMA → ボリンジャーバンド
trueRange = |current - previous|
ema = alpha * current + (1 - alpha) * previous
volatility = ema(trueRange)

// 動的閾値による分類
bands = calculateBollingerBands(volatilityHistory, 20, 1.5)
level = volatility > upper ? 'HIGH' : 
        volatility < lower ? 'LOW' : 'MODERATE'
```

#### 2.3 27ステート解釈システム (trend-interpreter.ts)
```
UCRレベル × モメンタム分類マトリクス:

          強正    正     中立    負     強負
高(85-100) S1     S2     S3     S4     S5
中(65-84)  S4     S5     S6     S7     S8  
低(<65)    S7     S8     S9     S10    S11

各ステート → 解釈文 + 数値コード生成
```

### フェーズ3: 統合・検証
```
Priority: HIGH | Dependencies: フェーズ2完了
```

#### 3.1 UCRCalculatorとの統合
- 既存calculateTrendsメソッドの置換
- 新エンジンへの段階的移行
- 後方互換性の保証

#### 3.2 精度検証システム
**検証基準:**
- モメンタム計算: ±0.1%以内の誤差
- ボラティリティ計算: ±0.01以内の誤差
- ステート分類: 100%一致

**検証データセット:**
- GAS版の実計算結果を基準
- 最低30日分の履歴データ
- エッジケース（データ不足、異常値）

#### 3.3 エラー処理強化
- データ不足時の適切な処理
- 計算エラー時のフォールバック
- 包括的ログ記録

### フェーズ4: テスト実装
```
Priority: MEDIUM | Dependencies: フェーズ3完了
```

#### 4.1 単体テスト群
- 各計算エンジンの個別テスト
- 数学関数の精度テスト
- エッジケースカバレッジ

#### 4.2 統合テスト
- UCRCalculatorとの統合テスト
- 履歴データでの一貫性テスト
- MCPツール経由アクセステスト

### フェーズ5: 永続化・展開
```
Priority: MEDIUM | Dependencies: フェーズ4完了
```

#### 5.1 intervals.icuカスタムフィールド対応
- UCRMomentum, UCRVolatility, UCRTrendState等の自動更新
- バッチ更新機能
- エラー時のリトライ機能

#### 5.2 MCPツール拡張
- calculate_ucr_trendsツールの機能強化
- トレンド分析結果の可視化改善
- intervals.icu更新オプションの追加

## パフォーマンス・品質基準

### 機能基準
- [ ] GAS版と同等の計算精度達成
- [ ] 27ステート解釈システムの完全再現
- [ ] MCPツール経由でのリアルタイムアクセス
- [ ] intervals.icuカスタムフィールド自動更新

### 技術基準
- [ ] テストカバレッジ85%以上
- [ ] 応答時間2秒以内
- [ ] TypeScript型安全性100%
- [ ] エラー率1%以下

## リスク管理

### 高リスク項目
**数値計算精度の不一致**
- 対策: 段階的検証、許容範囲設定
- 軽減策: フォールバック機能

**パフォーマンス劣化**
- 対策: データ量制限、最適化実装
- 軽減策: 非同期処理、キャッシュ

**intervals.icuカスタムフィールド制限**
- 対策: フィールド数の事前確認
- 軽減策: 既存フィールドの再利用

### 緊急時対応
- 計画A: 精度問題 → 許容範囲拡大、段階的改善
- 計画B: パフォーマンス問題 → データ制限、最適化
- 計画C: 統合問題 → フィーチャーフラグによる段階的展開

## 実装順序

1. **基盤整備** (ucr-types.ts拡張 + trend-math-utils.ts)
2. **モメンタム計算** (momentum-calculator.ts)
3. **ボラティリティ計算** (volatility-calculator.ts)
4. **解釈システム** (trend-interpreter.ts)
5. **統合エンジン** (trend-engine.ts + UCRCalculator統合)
6. **テスト実装** (単体・統合テスト)
7. **永続化機能** (intervals.icuフィールド + MCPツール)

## 完了確認チェックリスト

### 機能確認
- [ ] UCRモメンタム計算がGAS版と±0.1%以内で一致
- [ ] UCRボラティリティ計算がGAS版と±0.01以内で一致
- [ ] 27ステート分類が100%正確
- [ ] MCPツール経由でアクセス可能
- [ ] intervals.icuカスタムフィールド更新動作

### 品質確認
- [ ] テストカバレッジ85%以上
- [ ] TypeScript型チェック100%パス
- [ ] 全テストがパス
- [ ] パフォーマンス基準クリア
- [ ] エラーハンドリング網羅

### 統合確認
- [ ] 既存機能への悪影響なし
- [ ] 後方互換性維持
- [ ] 設定変更への堅牢性確認

## 次のステップ

1. フェーズ1開始: `src/trend/`ディレクトリ作成
2. ucr-types.tsの型定義拡張
3. trend-math-utils.tsの数学関数実装
4. 段階的に各フェーズを実行

## 関連ドキュメント

- UCR_THEORETICAL_FOUNDATION.md: 理論的基盤
- UCR_INTEGRATION_PLAN.md: 全体統合計画
- calcReadiness/src/UCRTrendCalculator.js: GAS版参考実装
- calcReadiness/src/_Config.js: GAS版設定仕様