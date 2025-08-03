# UCR Integration Plan - intervals-mcp-server統合計画

## 背景と目的

### 現状の課題
- **calcReadiness**プロジェクトのGAS実装を毎日手動実行する必要がある
- 朝起きてからウェルネスデータを入力し、30分後くらいにはトレーニングを開始したい
- その合間にClaudeに回復状況を確認し、予定通り始めるかどうかを決めたい
- 日次自動実行では起床時間が変動するため対応できない

### 解決アプローチ
intervals-mcp-serverにUCR計算機能を統合し、Claude経由でオンデマンドにUCR評価を取得できるようにする。

## アーキテクチャ設計

### 1. UCR計算エンジンの移植
**ファイル**: `ucr-calculator.ts`, `ucr-types.ts`

**移植内容**:
- GASの`ReadinessCalculator.js`からTypeScriptへの完全移植
- UCRスコア計算ロジック（シグモイド関数、線形関数）
- ベースライン計算（HRV 60日、RHR 30日）
- 副交感神経飽和検出
- 修正因子適用（アルコール、筋肉痛、ケガ等）
- intervals.icu wellness scale変換（1-4 → 1-5）

### 2. intervals.icu API統合
**現在の実装**: `IntervalsIcuApi.js`パターンを活用

**API呼び出しパターン**:
```typescript
// ウェルネスデータ取得
GET /api/v1/athlete/{athleteId}/wellness?oldest={date}&newest={date}

// カスタムフィールド更新
PUT /api/v1/athlete/{athleteId}/wellness/{date}
Body: {
  "readiness": 82,
  "UCRMomentum": -12.5,
  "UCRVolatility": 3.8,
  "UCRTrendState": 6,
  "UCRTrendInterpretation": "..."
}
```

**認証**: Basic認証（API_KEY）

### 3. MCPツール設計

#### 3.1 get_ucr_assessment
**目的**: 指定日のUCR評価を取得
```json
{
  "name": "get_ucr_assessment",
  "description": "指定日のUCR（Unified Continuous Readiness）評価を計算・取得",
  "inputSchema": {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "評価日(YYYY-MM-DD、省略時は今日)"
      },
      "include_trends": {
        "type": "boolean", 
        "description": "トレンド分析を含むか"
      }
    }
  }
}
```

#### 3.2 calculate_ucr_trends
**目的**: UCRトレンド分析（モメンタム・ボラティリティ）
```json
{
  "name": "calculate_ucr_trends", 
  "description": "UCRトレンド分析（7日モメンタム、14日ボラティリティ、27ステート解釈）",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target_date": {"type": "string"},
      "update_intervals": {"type": "boolean", "description": "intervals.icuのカスタムフィールドに保存するか"}
    }
  }
}
```

#### 3.3 update_wellness_assessment
**目的**: ウェルネスデータ更新とUCR再計算
```json
{
  "name": "update_wellness_assessment",
  "description": "主観的ウェルネスデータを更新してUCR評価を再計算", 
  "inputSchema": {
    "type": "object",
    "properties": {
      "date": {"type": "string"},
      "fatigue": {"type": "integer", "minimum": 1, "maximum": 4},
      "stress": {"type": "integer", "minimum": 1, "maximum": 4},
      "motivation": {"type": "integer", "minimum": 1, "maximum": 4},
      "soreness": {"type": "integer", "minimum": 1, "maximum": 4},
      "injury": {"type": "integer", "minimum": 1, "maximum": 4}
    }
  }
}
```

## 実装詳細

### データフロー
1. **Claude要求** → MCPツール呼び出し
2. **intervals.icu API** → ウェルネスデータ取得
3. **UCRCalculator** → スコア・トレンド計算
4. **intervals.icu API** → カスタムフィールド更新（オプション）
5. **Claude応答** → UCR評価とトレーニング推奨

### UCR計算ロジック（移植対象）

#### ベースライン計算
```typescript
// HRV: 60日ベースライン、7日移動平均（ln変換）
const hrvBaseline = {
  mean60: calculateMean(lnHrvData60),
  sd60: calculateStdDev(lnHrvData60),
  mean7: calculateMean(lnHrvData7)
};

// RHR: 30日ベースライン
const rhrBaseline = {
  mean30: calculateMean(rhrData30),
  sd30: calculateStdDev(rhrData30)
};
```

#### UCRスコア計算（連続的）
```typescript
// HRV: シグモイド関数 (k=0.6, c=-0.8)
const hrvScore = 40 / (1 + Math.exp(-k * (zScore - c)));

// RHR: 線形関数 (baseline=16, slope=5)  
const rhrScore = baseline + (zScore * slope);

// 最終スコア = HRV(40) + RHR(20) + Sleep(20) + Subjective(20)
```

#### 副交感神経飽和検出
```typescript
if (lnCurrentHRV < lowerBound && currentRHR < rhrMean) {
  // 低HRV + 低RHR = 良好な状態（満点）
  return 40;
}
```

### intervals.icuカスタムフィールド統合
**Pascal case命名**:
- `UCRMomentum`: モメンタム値（-100～+100%）
- `UCRVolatility`: ボラティリティ値（0～20）
- `UCRTrendState`: 9ステート数値コード（1-9）
- `UCRTrendInterpretation`: 解釈テキスト
- `UCRVolatilityLevel`: HIGH/MODERATE/LOW
- `UCRVolatilityBandPosition`: -2.0～+2.0

### エラーハンドリング
- intervals.icu API認証エラー
- データ不足（最小7日間のHRV/RHRデータ）
- 不正な入力値検証
- ネットワークエラーのリトライ

## 期待される効果

### 1. ユーザビリティ向上
- **即座の評価**: 朝起きて30分以内にUCR評価を取得
- **意思決定支援**: トレーニング実施判断の客観的根拠
- **手動作業削減**: GAS実行の必要性を排除

### 2. データ連携強化
- **Single Source of Truth**: intervals.icuのデータを一元活用
- **Claude統合**: 自然言語でのUCR評価相談
- **継続性**: GAS版と同等の計算精度を維持

### 3. 拡張性
- **カスタムフィールド活用**: intervals.icuエコシステムとの統合
- **トレンド分析**: 27ステート解釈マトリクス
- **将来的機能追加**: ACWR、Training Monotony等

## 技術的考慮事項

### 1. 日付・タイムゾーン処理
- **GAS → TypeScript**: `formatDateForApi`関数の移植
- **intervals.icu API**: ISO 8601形式（YYYY-MM-DD）
- **タイムゾーン統一**: UTCベースでの処理

### 2. 数値精度
- **floating point**: JavaScriptの数値精度問題対策
- **丸め処理**: UCRスコアは整数、トレンド値は小数点1-2桁

### 3. パフォーマンス
- **API呼び出し最適化**: 必要最小限のデータ取得
- **キャッシュ戦略**: 同日内の重複計算回避
- **バッチ処理**: 複数日評価時の効率化

### 4. セキュリティ
- **API KEY管理**: 環境変数での適切な管理
- **入力検証**: 全入力パラメータの妥当性チェック
- **エラー情報**: 機密情報の漏洩防止

## 実装フェーズ

### Phase 1: 基盤実装 ✅
- [x] UCR型定義（ucr-types.ts）
- [x] UCRCalculatorクラス（ucr-calculator.ts）
- [x] 基本的な計算ロジック移植

### Phase 2: API統合 🔄
- [ ] intervals.icu API クライアント実装
- [ ] 認証・エラーハンドリング
- [ ] ウェルネスデータ取得・変換

### Phase 3: MCPツール実装
- [ ] get_ucr_assessment実装
- [ ] calculate_ucr_trends実装（UCRTrendCalculator.js移植含む）
- [ ] update_wellness_assessment実装

### Phase 4: テスト・検証
- [ ] GAS版との計算結果比較検証
- [ ] intervals.icuカスタムフィールド更新テスト
- [ ] Claude経由での操作パターン確立

### Phase 5: 運用開始
- [ ] 本格運用開始
- [ ] GAS版との並行運用期間
- [ ] パフォーマンス・精度モニタリング

## 成功指標

1. **機能性**: GAS版と±2点以内の計算精度
2. **応答性**: Claude要求から5秒以内の応答
3. **信頼性**: 99%以上の成功率（API呼び出し）
4. **ユーザビリティ**: 朝のワークフロー時間50%短縮

## リスク要因と対策

### 1. intervals.icu API制限
**リスク**: レート制限、API仕様変更
**対策**: エラーハンドリング、フォールバック機能

### 2. 計算精度の差異
**リスク**: GAS版との結果不一致
**対策**: 詳細な検証テスト、段階的移行

### 3. データ整合性
**リスク**: intervals.icuデータの欠損・異常値
**対策**: デフォルト値設定、アラート機能

この計画に基づき、段階的にUCR統合機能を実装し、朝のトレーニング判断をより効率的で客観的なものにしていきます。