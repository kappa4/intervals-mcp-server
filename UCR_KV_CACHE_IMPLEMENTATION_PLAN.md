# ウェルネスデータKVキャッシュ機構 設計・実装計画

## 📋 プロジェクト概要

**プロジェクト名**: ウェルネスデータKVキャッシュ機構  
**プロジェクト期間**: 2025年8月3日開始  
**ステータス**: 🚧 **Phase 2完了 - Phase 3実装準備**  
**前提プロジェクト**: UCR統計的妥当性検証完了

intervals-mcp-serverのパフォーマンス向上を目的とした、ウェルネスデータKVキャッシュ機構の包括的な設計・実装計画です。

## 🎯 目標・成功指標

### 主要目標
- **API呼び出し最適化**: intervals.icu APIの重複呼び出し削減
- **レスポンス速度向上**: UCR計算処理の高速化
- **システム安定性向上**: API負荷軽減による信頼性確保

### 測定可能な成功指標
1. **レスポンス時間**: 平均50%削減（3秒→1.5秒）
2. **API呼び出し削減**: 70%削減達成
3. **キャッシュヒット率**: 85%以上維持
4. **データ整合性**: 100%保証（ゼロ不整合）

### 品質ゲート
- **Phase 1完了**: Deno KV基本動作100%確認
- **Phase 2完了**: キャッシュ基本機能動作確認
- **Phase 3完了**: UCR計算レスポンス時間改善確認
- **Phase 4完了**: 高度機能の安定性確認
- **Phase 5完了**: 全品質指標クリア

## 🏗️ 技術アーキテクチャ

### キャッシュ対象データ
1. **ウェルネスデータ（wellness entries）** - 最重要、UCR計算に必須
2. **アクティビティデータ（activities）** - HRV/RHR取得用
3. **アスリート基本情報（athlete info）** - 設定情報

### キー設計
```typescript
// バージョンプレフィックスを含むキー設計
const CACHE_KEYS = {
  wellness: (athleteId: string, dateRange: string) => 
    CacheVersionManager.getCacheKey(`wellness:${athleteId}:${dateRange}`),
  activities: (athleteId: string, dateRange: string) => 
    CacheVersionManager.getCacheKey(`activities:${athleteId}:${dateRange}`),
  athlete: (athleteId: string) => 
    CacheVersionManager.getCacheKey(`athlete:${athleteId}`),
  metadata: (key: string) => 
    CacheVersionManager.getCacheKey(`meta:${key}`)
};
```

### TTL設定戦略
```typescript
const TTL_CONFIG = {
  wellness: 60 * 60 * 1000,      // 1時間（頻繁更新）
  activities: 30 * 60 * 1000,    // 30分（中頻度）
  athlete: 24 * 60 * 60 * 1000,  // 24時間（低頻度）
  metadata: 12 * 60 * 60 * 1000  // 12時間（設定情報）
};
```

### 技術制約・依存関係
**技術制約**:
- Deno KVの制限（値サイズ64KB、リクエスト数制限）
- intervals.icu APIレート制限
- UCRCalculatorの既存実装との整合性

**依存関係**:
- UCRIntervalsClient（既存）
- intervals-client.ts（既存）
- UCRCalculator（既存）

## 📅 実装フェーズ計画

### Phase 1: 基盤設計・インターフェース定義

**期間**: 1-2日  
**優先度**: 高

**成果物:**
- `cache/cache-types.ts` - キャッシュ専用型定義
- `cache/cache-config.ts` - 設定・定数定義
- `cache/cache-version-manager.ts` - バージョン管理機能
- キー設計仕様の確定

**主要作業:**
1. Deno KV API仕様・制限事項の詳細調査
2. 既存UCRIntervalsClientの実装パターン分析
3. キャッシュキー命名規則の設計（バージョン対応）
4. 型定義・インターフェース設計
5. バージョン管理機能の実装

### Phase 2: 基本キャッシュ実装

**期間**: 2-3日  
**優先度**: 高

**成果物:**
- `cache/wellness-cache.ts` - メインキャッシュクラス
- 基本的なget/set/delete操作
- TTL機能実装

**主要作業:**
1. ウェルネスデータキャッシュ基本機能
2. 自動無効化機能
3. エラーハンドリング強化
4. `cache-utils.ts` ユーティリティ実装

### Phase 3: UCRIntervalsClient統合

**期間**: 2-3日  
**優先度**: 高

**成果物:**
- UCRIntervalsClient へのキャッシュ統合
- get/set ラッパー実装
- フォールバック機能

**主要作業:**
1. 既存機能との互換性確保
2. MCPツールとの統合
3. エンドツーエンド動作確認
4. フォールバック機能実装

### Phase 4: 高度な最適化機能

**期間**: 3-4日  
**優先度**: 中

**成果物:**
- インテリジェント無効化戦略
- 統計ベースTTL調整
- バッチ処理最適化

**主要作業:**
1. データ更新検知機能
2. 関連キャッシュの連鎖無効化
3. 統計ベースTTL動的調整
4. バッチ処理最適化
5. パフォーマンス監視ダッシュボード

### Phase 5: テスト・監視・運用準備

**期間**: 2-3日  
**優先度**: 中

**成果物:**
- 包括的テスト実装
- 監視アラート設定
- 運用ドキュメント

**主要作業:**
1. 単体テスト: `tests/unit/cache/wellness-cache_test.ts`
2. 統合テスト: `tests/integration/cache-integration_test.ts`
3. パフォーマンステスト: レスポンス時間・ヒット率測定
4. 監視アラート設定
5. ロールバック手順準備
6. 運用ドキュメント作成

## 📁 ファイル構成・実装計画

### 新規作成ファイル

```
cache/
├── wellness-cache.ts        # メインキャッシュクラス
├── cache-types.ts           # キャッシュ専用型定義
├── cache-config.ts          # 設定・定数
├── cache-utils.ts           # ユーティリティ関数
└── cache-version-manager.ts # バージョン管理とキー生成

tests/
├── unit/cache/
│   ├── wellness-cache_test.ts
│   ├── cache-utils_test.ts
│   └── cache-integration_test.ts
└── integration/
    └── cache-integration_test.ts
```

### 既存ファイル修正
- `ucr-intervals-client.ts` - キャッシュ統合
- `deno.json` - 新規タスク追加
- 各種テストファイル - キャッシュテスト追加

## ⚠️ リスク軽減・コンティンジェンシープラン

### 主要リスク・対策

#### 1. Deno KV性能不足
**リスク**: Deno KVが期待する性能を提供しない
**対策**: Redis等代替技術への切り替え準備
**判断基準**: Phase 1でのベンチマーク結果
**コンティンジェンシー**: 代替キャッシュ技術の検討・実装

#### 2. 既存システムとの統合複雑度
**リスク**: UCRIntervalsClientとの統合が予想以上に複雑
**対策**: 段階的ロールバック機能実装
**判断基準**: Phase 3でのE2Eテスト結果
**コンティンジェンシー**: 統合範囲の縮小・段階的実装

#### 3. 効果不十分
**リスク**: 期待するパフォーマンス向上が得られない
**対策**: 追加最適化手法の検討・実装
**判断基準**: Phase 5での成功指標未達時
**コンティンジェンシー**: アーキテクチャの見直し・追加最適化

### 緊急時対応

#### 即座ロールバック
- キャッシュ無効化での旧システム復帰
- 設定フラグによる機能無効化
- フォールバック機能への自動切り替え

#### 段階的切り戻し
- Phase単位での機能無効化
- 部分的機能の一時停止
- 段階的な旧システムへの復帰

#### フォールバック運用
- キャッシュ機能完全無効化での継続運用
- 旧API呼び出しパターンでの運用継続
- 最小限機能での安定運用

## 🔍 技術実装詳細

### インテリジェントキャッシュアプローチ
**採用理由**: UCRCalculatorの複雑な計算パターンに最適化可能
**実装戦略**: 段階的実装でリスク軽減（シンプル→インテリジェント）

### デプロイ時のキャッシュ管理戦略
```typescript
// cache/cache-version-manager.ts
export class CacheVersionManager {
  private static VERSION_KEY = 'DEPLOY_VERSION';
  
  // バージョン対応キャッシュキー生成
  static getCacheKey(baseKey: string): string {
    const version = Deno.env.get(this.VERSION_KEY) || 'v1';
    return `${version}:${baseKey}`;
  }
  
  // 新バージョン生成（デプロイ時使用）
  static generateNewVersion(): string {
    return `v${Date.now()}`;
  }
  
  // 旧バージョンキャッシュの検出
  static async cleanupOldVersions(kv: Deno.Kv, currentVersion: string) {
    // 実装詳細はPhase 4で
  }
}
```

### 無効化戦略
```typescript
interface CacheInvalidationStrategy {
  // データ更新検知
  detectDataUpdates: (athleteId: string, dataType: string) => boolean;
  
  // 関連キャッシュの連鎖無効化
  cascadeInvalidation: (keys: string[]) => Promise<void>;
  
  // 統計ベースTTL調整
  adjustTTL: (key: string, accessPattern: AccessPattern) => number;
  
  // バージョンベース無効化
  invalidateByVersion: (oldVersion: string) => Promise<void>;
}
```

### パフォーマンス監視
```typescript
interface CacheMetrics {
  hitRate: number;           // キャッシュヒット率
  missRate: number;          // キャッシュミス率
  responseTime: number;      // 平均レスポンス時間
  apiCallReduction: number;  // API呼び出し削減率
  errorRate: number;         // エラー率
}
```

## 📊 継続改善計画

### 短期改善（実装完了後1ヶ月以内）
- キャッシュヒット率の詳細分析
- TTL設定の個人最適化
- 監視アラートの精度向上
- パフォーマンス指標の細分化

### 中長期改善（1-3ヶ月）
- 機械学習ベースのキャッシュ戦略
- 予測的プリロード機能
- 分散キャッシュ対応検討
- 個人別最適化機能

## 🎛️ 設定・運用情報

### 環境変数
```bash
# 既存環境変数（継承）
ATHLETE_ID=i123456              # intervals.icu アスリートID
API_KEY=your_api_key           # intervals.icu APIキー  
JWT_SECRET_KEY=min32chars       # JWT署名用秘密鍵（32文字以上）
ORIGIN=https://your-app.deno.dev # OAuth用オリジンURL

# 新規追加環境変数
CACHE_ENABLED=true             # キャッシュ機能有効化
CACHE_TTL_WELLNESS=3600        # ウェルネスデータTTL（秒）
CACHE_TTL_ACTIVITIES=1800      # アクティビティデータTTL（秒）
CACHE_TTL_ATHLETE=86400        # アスリート情報TTL（秒）
CACHE_DEBUG=false              # キャッシュデバッグログ
DEPLOY_VERSION=v1              # デプロイバージョン
CACHE_VERSION_STRATEGY=auto    # auto|manual|fixed
```

### 開発・テストコマンド
```bash
# 開発サーバ起動（キャッシュ有効）
deno run --allow-net --allow-env --unstable-kv main.ts

# キャッシュテスト実行
deno test tests/unit/cache/ --allow-net --allow-env --unstable-kv

# パフォーマンステスト
deno test tests/integration/cache-performance_test.ts --allow-net --allow-env --unstable-kv

# 全テスト実行
deno test --allow-net --allow-env --unstable-kv --coverage=coverage
```

## 📈 期待される効果

### 1. パフォーマンス向上
- **レスポンス時間短縮**: 3秒→1.5秒（50%削減）
- **API呼び出し削減**: 70%削減
- **システム負荷軽減**: intervals.icu APIへの負荷分散

### 2. ユーザビリティ向上
- **即座の評価**: 朝のUCR評価取得時間短縮
- **快適な操作**: MCPツール応答性向上
- **安定性向上**: API制限回避による安定運用

### 3. 拡張性・保守性
- **段階的最適化**: 継続的なパフォーマンス改善基盤
- **監視・運用**: 詳細なメトリクス取得・分析
- **将来機能**: 予測的キャッシュ・個人最適化への基盤

## 🔗 関連ドキュメント

### 前提・参照ドキュメント
- [UCR統合計画](./UCR_INTEGRATION_PLAN.md): 技術的基盤
- [UCR統計的妥当性検証レポート](./UCR_STATISTICAL_VALIDATION_REPORT.md): 前段階完了報告
- [UCR引き継ぎドキュメント](./UCR_HANDOVER_DOCUMENT.md): プロジェクト全体概要

### 技術参照
- [Deno KV Documentation](https://deno.land/manual/runtime/kv): 技術仕様
- [intervals.icu API Documentation](https://intervals.icu/api): API仕様
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/): プロトコル仕様

---

## 📋 進捗管理・チェックリスト

### Phase 1: 基盤設計・インターフェース定義
- [x] Deno KV API仕様・制限事項調査
- [x] UCRIntervalsClient実装パターン分析
- [x] キャッシュキー命名規則設計
- [x] `cache-types.ts` 型定義作成
- [x] `cache-config.ts` 設定ファイル作成
- [x] `cache-version-manager.ts` バージョン管理機能作成

### Phase 2: 基本キャッシュ実装
- [x] `wellness-cache.ts` 基本クラス実装
- [x] 基本的なget/set/delete操作
- [x] TTL機能実装
- [x] エラーハンドリング強化
- [x] `cache-utils.ts` ユーティリティ実装

### Phase 3: UCRIntervalsClient統合
- [ ] UCRIntervalsClient へのキャッシュ統合
- [ ] get/set ラッパー実装
- [ ] フォールバック機能実装
- [ ] MCPツールとの統合テスト

### Phase 4: 高度な最適化機能
- [ ] インテリジェント無効化戦略実装
- [ ] 統計ベースTTL調整
- [ ] バッチ処理最適化
- [ ] パフォーマンス監視機能

### Phase 5: テスト・監視・運用準備
- [ ] 包括的テスト実装
- [ ] パフォーマンステスト
- [ ] 監視アラート設定
- [ ] 運用ドキュメント作成
- [ ] 本格運用準備

### 品質確認
- [ ] 全品質指標クリア
- [ ] ドキュメント整合性確認
- [ ] リスク軽減策実装確認
- [ ] 緊急時対応手順確認

---

**作成日**: 2025-08-03  
**作成者**: Claude Code  
**ステータス**: 🚧 Phase 2完了 - Phase 3実装準備  
**最終更新**: 2025-08-03 Phase 2完了時  
**次回更新**: Phase 3完了時

---

この計画により、intervals-mcp-serverのパフォーマンスを大幅に向上させ、UCR計算処理の高速化と安定化を実現します。各Phaseの完了時には本文書を更新し、進捗状況と品質指標を記録していきます。