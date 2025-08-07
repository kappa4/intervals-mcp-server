/**
 * UCR Analysis MCP Prompts
 * 
 * UCR分析に特化したコンテキスト効率的なプロンプトテンプレート
 * これらのプロンプトは、複雑なUCR分析タスクを構造化し、
 * より適切で一貫性のある回答を生成するために設計されています。
 */

export interface UCRPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export const UCR_PROMPTS: UCRPrompt[] = [
  // 5つの主要ワークフロー
  {
    name: "ucr_morning_assessment",
    description: "朝のUCR評価ワークフロー：今日の身体状態とトレーニング計画の決定",
    arguments: [
      {
        name: "planned_training",
        description: "今日の予定トレーニング内容（例：インターバル、ロング走、回復走）",
        required: false
      },
      {
        name: "yesterday_training",
        description: "昨日のトレーニング内容と感想",
        required: false
      }
    ]
  },
  {
    name: "ucr_training_policy",
    description: "トレーニングポリシー決定：UCRトレンドと相関に基づく今後の方針",
    arguments: [
      {
        name: "training_goal",
        description: "トレーニング目標（例：レースピーク、ベース構築、回復期）",
        required: true
      },
      {
        name: "time_horizon",
        description: "計画期間（例：1週間、2週間、1ヶ月）",
        required: false
      }
    ]
  },
  {
    name: "ucr_post_training_analysis",
    description: "トレーニング後分析：実施結果とUCRへの影響評価",
    arguments: [
      {
        name: "training_type",
        description: "実施したトレーニングタイプ",
        required: true
      },
      {
        name: "subjective_feel",
        description: "主観的な感覚（1-5スケール）",
        required: false
      },
      {
        name: "performance_metrics",
        description: "パフォーマンス指標（ペース、心拍、パワー等）",
        required: false
      }
    ]
  },
  {
    name: "ucr_weekly_review",
    description: "週次レビュー：1週間のUCR変動とトレーニング効果の総括",
    arguments: [
      {
        name: "week_highlights",
        description: "今週のハイライト（主要ワークアウト、レース等）",
        required: false
      },
      {
        name: "next_week_plan",
        description: "来週の予定",
        required: false
      }
    ]
  },
  {
    name: "ucr_training_effect_analysis",
    description: "トレーニング効果分析：特定期間のUCR応答パターンと個人特性",
    arguments: [
      {
        name: "analysis_period",
        description: "分析期間（例：過去30日、60日、90日）",
        required: false
      },
      {
        name: "focus_metrics",
        description: "注目する指標（例：HRV応答、RHR変化、睡眠パターン）",
        required: false
      }
    ]
  },
  // 追加の詳細分析プロンプト
  {
    name: "ucr_overtraining_detection",
    description: "オーバートレーニング検出：早期警告シグナルの分析",
    arguments: [
      {
        name: "sensitivity",
        description: "検出感度（low, medium, high）",
        required: false
      }
    ]
  },
  {
    name: "ucr_competition_readiness",
    description: "大会準備状況：ピーキングとテーパリング戦略",
    arguments: [
      {
        name: "competition_date",
        description: "大会日（YYYY-MM-DD形式）",
        required: true
      },
      {
        name: "priority",
        description: "大会の重要度（A, B, C）",
        required: false
      }
    ]
  },
  {
    name: "ucr_recovery_optimization",
    description: "回復最適化：制限要因の特定と改善策",
    arguments: [
      {
        name: "limiting_factor",
        description: "特定の制限要因（hrv, rhr, sleep, stress等）",
        required: false
      }
    ]
  },
  {
    name: "ucr_subjective_objective_gap",
    description: "主観と客観のギャップ分析：認識のずれと調整",
    arguments: []
  },
  {
    name: "ucr_personalized_thresholds",
    description: "個人化閾値設定：最適なUCRゾーンの調整",
    arguments: [
      {
        name: "training_phase",
        description: "現在のトレーニング期（base, build, peak, recovery）",
        required: false
      }
    ]
  }
];

/**
 * プロンプトテンプレートを生成
 */
export function generatePromptTemplate(promptName: string, args?: Record<string, any>): string {
  const prompt = UCR_PROMPTS.find(p => p.name === promptName);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${promptName}`);
  }

  switch (promptName) {
    case "ucr_morning_assessment":
      return generateMorningAssessmentPrompt(args);
    case "ucr_training_policy":
      return generateTrainingPolicyPrompt(args);
    case "ucr_post_training_analysis":
      return generatePostTrainingAnalysisPrompt(args);
    case "ucr_weekly_review":
      return generateWeeklyReviewPrompt(args);
    case "ucr_training_effect_analysis":
      return generateTrainingEffectAnalysisPrompt(args);
    case "ucr_overtraining_detection":
      return generateOvertrainingDetectionPrompt(args);
    case "ucr_competition_readiness":
      return generateCompetitionReadinessPrompt(args);
    case "ucr_recovery_optimization":
      return generateRecoveryOptimizationPrompt(args);
    case "ucr_subjective_objective_gap":
      return generateSubjectiveObjectiveGapPrompt();
    case "ucr_personalized_thresholds":
      return generatePersonalizedThresholdsPrompt(args);
    default:
      throw new Error(`No template for prompt: ${promptName}`);
  }
}

// 個別のプロンプトテンプレート生成関数

function generateMorningAssessmentPrompt(args?: Record<string, any>): string {
  const plannedTraining = args?.planned_training || "未定";
  const yesterdayTraining = args?.yesterday_training || "情報なし";
  
  return `
朝のUCR評価ワークフローを実行します。

【昨日の情報】
- トレーニング内容: ${yesterdayTraining}

【今日の予定】
- 予定トレーニング: ${plannedTraining}

以下の手順で包括的な評価を行ってください：

1. **現在のUCR評価（get_ucr_assessment）**
   - 総合スコアと各コンポーネントの確認
   - 前日比較による変化の把握

2. **UCR要因分解（get_ucr_decomposition）**
   - なぜ今日のスコアがこの値なのか
   - 制限要因と強みの特定
   - 物語的解釈の提供

3. **トレーニング実施判断**
   - 予定トレーニングを実施すべきか
   - 実施する場合の調整案
   - 代替案の提示（必要な場合）

4. **今日の注意点**
   - 特に注意すべき体調シグナル
   - 栄養・水分補給の重点
   - 回復促進のためのアクション

実践的で具体的な推奨事項を提供してください。
`;
}

function generateTrainingPolicyPrompt(args?: Record<string, any>): string {
  const trainingGoal = args?.training_goal;
  const timeHorizon = args?.time_horizon || "2週間";
  
  return `
UCRトレンドと相関分析に基づいてトレーニングポリシーを決定します。

【目標設定】
- トレーニング目標: ${trainingGoal}
- 計画期間: ${timeHorizon}

以下の分析を順次実行してください：

1. **UCRトレンド分析（calculate_ucr_trends）**
   - 過去14日間のモメンタムとボラティリティ
   - 27状態マトリクスでの現在位置
   - トレンドの方向性と安定性

2. **相関分析（analyze_ucr_correlations）**
   - 主観的ウェルネスと客観的指標の関係
   - 個人の応答パターン特定
   - ラグ効果の理解

3. **トレーニングポリシー提案**
   - 負荷と回復のバランス戦略
   - 週間トレーニング構成
   - 強度配分の推奨

4. **リスク管理**
   - オーバートレーニング回避策
   - モニタリング指標の設定
   - 調整トリガーの定義

5. **実行計画**
   - ${timeHorizon}の具体的スケジュール
   - キーワークアウトの配置
   - 回復日の戦略的配置

データに基づいた実践的な方針を提供してください。
`;
}

function generatePostTrainingAnalysisPrompt(args?: Record<string, any>): string {
  const trainingType = args?.training_type;
  const subjectiveFeel = args?.subjective_feel || "未記録";
  const performanceMetrics = args?.performance_metrics || "データなし";
  
  return `
トレーニング後のUCR影響評価を実施します。

【実施トレーニング情報】
- トレーニングタイプ: ${trainingType}
- 主観的感覚: ${subjectiveFeel}
- パフォーマンス指標: ${performanceMetrics}

以下の分析を行ってください：

1. **即時影響評価**
   - トレーニング前後のUCRコンポーネント変化
   - 主観的疲労の更新推奨
   - 回復必要時間の推定

2. **パフォーマンス分析**
   - UCRスコアとパフォーマンスの関係
   - 期待値との比較
   - トレーニング効果の評価

3. **回復戦略**
   - 明日のUCR予測
   - 推奨回復介入
   - 次回同様トレーニングまでの期間

4. **学習ポイント**
   - 今回のトレーニングから得られた洞察
   - UCR応答パターンの理解
   - 今後の参考事項

実践的なフィードバックと次のアクションを提供してください。
`;
}

function generateWeeklyReviewPrompt(args?: Record<string, any>): string {
  const weekHighlights = args?.week_highlights || "特記事項なし";
  const nextWeekPlan = args?.next_week_plan || "未定";
  
  return `
週次UCRレビューを実施します。

【今週の概要】
- ハイライト: ${weekHighlights}
- 来週の予定: ${nextWeekPlan}

以下の包括的レビューを行ってください：

1. **週間UCRサマリー（batch_calculate_ucr）**
   - 週平均スコアと変動幅
   - 最高値と最低値の要因
   - 週内パターンの分析

2. **トレーニング効果評価**
   - キーワークアウトへのUCR応答
   - 回復パターンの評価
   - 負荷と適応のバランス

3. **トレンド分析**
   - 週単位での改善/悪化傾向
   - ボラティリティの変化
   - 状態遷移のパターン

4. **次週への提言**
   - 今週の学びを活かした調整案
   - 負荷配分の最適化
   - 重点管理項目

5. **長期視点**
   - 月間トレンドへの寄与
   - 目標達成への進捗
   - 調整が必要な領域

データに基づいた振り返りと前向きな提案を提供してください。
`;
}

function generateTrainingEffectAnalysisPrompt(args?: Record<string, any>): string {
  const analysisPeriod = args?.analysis_period || "過去30日";
  const focusMetrics = args?.focus_metrics || "全指標";
  
  return `
トレーニング効果とUCR応答パターンの詳細分析を行います。

【分析設定】
- 分析期間: ${analysisPeriod}
- 注目指標: ${focusMetrics}

以下の多角的分析を実施してください：

1. **UCR応答パターン分析**
   - 各種トレーニングへのUCR応答
   - 回復時間の個人特性
   - 適応の兆候と進展

2. **相関分析（analyze_ucr_correlations）**
   - トレーニング負荷とUCRの関係
   - 時間遅延効果の特定
   - 個人の応答特性

3. **コンポーネント別影響**
   - HRVへの影響パターン
   - RHRの適応曲線
   - 睡眠への影響
   - 主観的回復の特徴

4. **最適化の機会**
   - 効果的だったトレーニングパターン
   - 改善が必要な領域
   - 個人化された推奨事項

5. **将来予測**
   - 現在のパターンが続いた場合の予測
   - 目標達成への軌道
   - 必要な調整

個人の特性を理解し、最適化された提案を提供してください。
`;
}

function generateRecoveryOptimizationPrompt(args?: Record<string, any>): string {
  const limitingFactor = args?.limiting_factor;
  
  return `
回復を最適化するための包括的な分析と提案を行ってください。
${limitingFactor ? `特に${limitingFactor}の改善に焦点を当ててください。` : ''}

1. **現在の回復状態評価**
   - 各回復指標（HRV、RHR、睡眠）の状態
   - 最も改善が必要な要素（制限要因）

2. **回復阻害要因の特定**
   - ストレス要因（トレーニング、生活、環境）
   - 睡眠の質と量の問題
   - 栄養や水分補給の課題

3. **具体的な介入戦略**
   - 即効性のある対策（今日から実施可能）
   - 中期的な改善計画（1-2週間）
   - 長期的な習慣形成（1ヶ月以上）

4. **優先順位とタイムライン**
   - 最も効果的な介入から順に
   - 期待される改善の時間軸
   - 進捗モニタリングの方法

エビデンスベースの実践的な回復戦略を提供してください。
`;
}

function generateOvertrainingDetectionPrompt(args?: Record<string, any>): string {
  const sensitivity = args?.sensitivity || "medium";
  
  return `
オーバートレーニングの兆候を${sensitivity}感度で検出・分析してください。

1. **早期警告シグナル**
   - HRVの持続的低下パターン
   - RHRの上昇傾向
   - 睡眠の質の悪化
   - 主観的疲労の蓄積

2. **リスクスコアリング**
   - 現在のオーバートレーニングリスク（0-100）
   - 各指標の寄与度
   - トレンドの方向性

3. **段階的評価**
   - 機能的オーバーリーチング
   - 非機能的オーバーリーチング
   - オーバートレーニング症候群

4. **予防と対処**
   - 即座に必要なアクション
   - トレーニング負荷の調整提案
   - 回復期間の推定
   - モニタリング強化ポイント

科学的根拠と実践的な対処法を組み合わせて提供してください。
`;
}

function generateCompetitionReadinessPrompt(args?: Record<string, any>): string {
  const competitionDate = args?.competition_date;
  const priority = args?.priority || "A";
  
  return `
${competitionDate}の大会（優先度：${priority}）に向けたレディネス評価とピーキング戦略を提供してください。

1. **現在のレディネス評価**
   - 現在のUCRスコアと理想的なスコア
   - 各コンポーネントの状態
   - 大会までの残り日数での到達可能性

2. **ピーキング戦略**
   - テーパリング計画（負荷漸減）
   - 回復最適化のタイミング
   - 最終調整の推奨事項

3. **リスク管理**
   - 過度なテーパリングのリスク
   - 疲労残存のリスク
   - コンディション調整の失敗要因

4. **日別アクションプラン**
   - 大会1週間前からの具体的計画
   - 睡眠、栄養、ストレス管理
   - 最終確認チェックリスト

大会の重要度に応じた、実践的なピーキング計画を提供してください。
`;
}

function generateSleepImpactPrompt(args?: Record<string, any>): string {
  const includeSleepDebt = args?.include_sleep_debt !== false;
  
  return `
睡眠がUCRスコアに与える影響を詳細に分析してください。

1. **睡眠メトリクスとUCRの関係**
   - 睡眠時間とUCRスコアの相関
   - 睡眠の質（Garminスコア）の影響度
   - 睡眠段階（深い睡眠、REM睡眠）の重要性

${includeSleepDebt ? `
2. **睡眠負債の累積効果**
   - 現在の睡眠負債量
   - UCRスコアへの累積的影響
   - 回復に必要な睡眠時間
` : ''}

3. **睡眠パターン分析**
   - 週内での睡眠パターン
   - 最適な就寝・起床時間
   - 睡眠の一貫性の重要性

4. **睡眠改善戦略**
   - 睡眠衛生の具体的改善点
   - 回復睡眠の優先順位
   - 昼寝の活用方法

データに基づいた、実践可能な睡眠最適化戦略を提供してください。
`;
}

function generateSubjectiveObjectiveGapPrompt(): string {
  return `
主観的評価と客観的指標のギャップを分析してください。

1. **ギャップの定量化**
   - 主観スコア（疲労、ストレス等）と客観指標（HRV、RHR）の乖離度
   - 一致している部分と乖離している部分

2. **ギャップの原因分析**
   - 心理的要因（モチベーション、不安）
   - 身体的要因（局所疲労、全身疲労）
   - 環境要因（仕事、プライベート）

3. **パターン認識**
   - ギャップが大きくなる条件
   - 時間的パターン（曜日、時期）
   - トレーニング負荷との関係

4. **実践的な示唆**
   - どちらを重視すべき状況
   - ギャップを縮小する方法
   - 自己認識の改善方法

心身の統合的な理解に基づいた洞察を提供してください。
`;
}

function generatePersonalizedThresholdsPrompt(args?: Record<string, any>): string {
  const trainingPhase = args?.training_phase || "general";
  
  return `
現在のトレーニング期（${trainingPhase}）に適した個人化UCRゾーン閾値を提案してください。

1. **現在の閾値評価**
   - デフォルト閾値（85/70/50）の妥当性
   - 個人の履歴データに基づく調整の必要性

2. **個人化された閾値提案**
   - PRIME（最高強度可能）: X点以上
   - READY（通常トレーニング）: Y-X点
   - MODERATE（軽度トレーニング）: Z-Y点
   - RECOVERY（回復優先）: Z点未満

3. **トレーニング期別の調整**
   - ${trainingPhase}期の特性を考慮
   - リスク許容度の設定
   - 回復重視vs負荷重視のバランス

4. **検証と調整方法**
   - 閾値の妥当性検証方法
   - 定期的な見直しタイミング
   - フィードバックループの構築

個人の特性とトレーニング目標に最適化された閾値を提供してください。
`;
}