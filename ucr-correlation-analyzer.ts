/**
 * UCR Correlation Analyzer
 * 時間差相互相関分析による主観的ウェルネスと客観的レディネススコアの関係性解析
 */

import type {
  WellnessData,
  UCRComponents,
  UCRComponentsDetailed,
  CorrelationResult
} from './ucr-types.ts';
import { log } from './logger.ts';

export class UCRCorrelationAnalyzer {
  /**
   * 客観的レディネススコアの計算
   * HRV + RHR + 睡眠のみ（主観を除外）
   */
  calculateObjectiveReadinessScore(components: UCRComponents): number {
    return components.hrv + components.rhr + components.sleep;
  }

  /**
   * UCRコンポーネントの詳細を生成
   */
  createDetailedComponents(components: UCRComponents): UCRComponentsDetailed {
    const objectiveReadinessScore = this.calculateObjectiveReadinessScore(components);
    const subjectiveScore = components.subjective;
    const totalBaseScore = objectiveReadinessScore + subjectiveScore;

    return {
      ...components,
      objectiveReadinessScore,
      subjectiveScore,
      totalBaseScore
    };
  }

  /**
   * ピアソン相関係数の計算
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      throw new Error('Arrays must have the same non-zero length');
    }

    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;

    for (let i = 0; i < n; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      numerator += diffX * diffY;
      denominatorX += diffX * diffX;
      denominatorY += diffY * diffY;
    }

    const denominator = Math.sqrt(denominatorX * denominatorY);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * 時間差相互相関の計算
   * @param objectiveScores 客観的レディネススコアの時系列
   * @param subjectiveMetric 主観指標の時系列
   * @param metricName 指標名（例: "疲労度"）
   * @param maxLag 最大ラグ日数（デフォルト: 7）
   */
  calculateTimeLaggedCorrelation(
    objectiveScores: number[],
    subjectiveMetric: number[],
    metricName: string,
    maxLag: number = 7
  ): CorrelationResult {
    const lagCorrelations = new Map<number, number>();
    let optimalLag = 0;
    let maxAbsCorrelation = 0;

    // ラグ -maxLag から +maxLag まで計算
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let alignedObjective: number[];
      let alignedSubjective: number[];

      if (lag < 0) {
        // 負のラグ: 過去の主観が現在の客観に影響
        alignedObjective = objectiveScores.slice(-lag);
        alignedSubjective = subjectiveMetric.slice(0, subjectiveMetric.length + lag);
      } else if (lag > 0) {
        // 正のラグ: 現在の客観が未来の主観を予測
        alignedObjective = objectiveScores.slice(0, objectiveScores.length - lag);
        alignedSubjective = subjectiveMetric.slice(lag);
      } else {
        // ラグ0: 同日の相関
        alignedObjective = [...objectiveScores];
        alignedSubjective = [...subjectiveMetric];
      }

      // 最小サンプル数のチェック（相関計算には最低3点必要）
      if (alignedObjective.length >= 3) {
        try {
          const correlation = this.calculatePearsonCorrelation(alignedObjective, alignedSubjective);
          lagCorrelations.set(lag, correlation);

          if (Math.abs(correlation) > Math.abs(maxAbsCorrelation)) {
            maxAbsCorrelation = correlation;
            optimalLag = lag;
          }
        } catch (error) {
          log("WARN", `Failed to calculate correlation for lag ${lag}: ${error}`);
        }
      }
    }

    // 解釈文の生成
    const interpretation = this.generateInterpretation(
      metricName,
      optimalLag,
      maxAbsCorrelation,
      objectiveScores.length
    );

    return {
      metric: metricName,
      optimalLag,
      correlation: maxAbsCorrelation,
      interpretation,
      dataPoints: objectiveScores.length,
      lagCorrelations
    };
  }

  /**
   * 複数の主観指標との相関を一括分析
   */
  analyzeMultipleCorrelations(
    objectiveScores: number[],
    wellnessDataSeries: WellnessData[],
    maxLag: number = 7
  ): CorrelationResult[] {
    const results: CorrelationResult[] = [];

    // 各主観指標を抽出して分析
    const metrics = [
      { name: '疲労度', extractor: (w: WellnessData) => w.fatigue },
      { name: 'ストレス', extractor: (w: WellnessData) => w.stress },
      { name: '筋肉痛', extractor: (w: WellnessData) => w.soreness },
      { name: 'モチベーション', extractor: (w: WellnessData) => w.motivation },
      { name: '睡眠の質', extractor: (w: WellnessData) => w.sleepQuality }
    ];

    for (const metric of metrics) {
      const values = wellnessDataSeries
        .map(w => metric.extractor(w))
        .filter(v => v !== null && v !== undefined) as number[];

      if (values.length >= objectiveScores.length * 0.8) { // 80%以上のデータがある場合のみ分析
        const result = this.calculateTimeLaggedCorrelation(
          objectiveScores,
          values,
          metric.name,
          maxLag
        );
        results.push(result);
      }
    }

    // 相関の強さでソート（絶対値の降順）
    results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    return results;
  }

  /**
   * 相関結果の解釈文を生成
   */
  private generateInterpretation(
    metricName: string,
    lag: number,
    correlation: number,
    dataPoints: number
  ): string {
    const strength = this.getCorrelationStrength(correlation);
    const direction = correlation > 0 ? '正' : '負';
    const absCorrelation = Math.abs(correlation);

    let timeDescription: string;
    if (lag < 0) {
      timeDescription = `${Math.abs(lag)}日前の`;
    } else if (lag > 0) {
      timeDescription = `${lag}日後の`;
    } else {
      timeDescription = '同日の';
    }

    let interpretation = `${timeDescription}${metricName}は、客観的レディネススコアと${strength}${direction}の相関（r = ${correlation.toFixed(2)}）があります。`;

    // 実用的な解釈を追加
    if (absCorrelation >= 0.5) {
      if (lag < 0) {
        interpretation += `\n→ ${metricName}の変化が${Math.abs(lag)}日後の身体状態に影響する可能性が高いです。`;
      } else if (lag > 0) {
        interpretation += `\n→ 現在の身体状態から${lag}日後の${metricName}を予測できる可能性があります。`;
      } else {
        interpretation += `\n→ ${metricName}と身体状態が密接に連動しています。`;
      }
    } else if (absCorrelation >= 0.3) {
      interpretation += `\n→ 一定の関連性は認められますが、他の要因も考慮が必要です。`;
    } else {
      interpretation += `\n→ 統計的な関連性は弱く、個別の影響は限定的です。`;
    }

    // データ点数による信頼性の注記
    if (dataPoints < 30) {
      interpretation += `\n（注: データ点数${dataPoints}点のため、さらなるデータ蓄積が推奨されます）`;
    }

    return interpretation;
  }

  /**
   * 相関の強さを分類
   */
  private getCorrelationStrength(correlation: number): string {
    const abs = Math.abs(correlation);
    if (abs >= 0.7) return '非常に強い';
    if (abs >= 0.5) return '強い';
    if (abs >= 0.3) return '中程度の';
    if (abs >= 0.2) return '弱い';
    return '非常に弱い';
  }

  /**
   * 統計的有意性の簡易計算（t検定）
   */
  calculatePValue(correlation: number, n: number): number {
    if (n <= 2) return 1.0;
    
    // t統計量の計算
    const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    
    // 簡易的なp値の推定（両側検定）
    // 実際のアプリケーションでは、t分布表を使用するか、
    // 統計ライブラリを使用することを推奨
    const df = n - 2;
    
    // 簡易的な閾値判定
    if (Math.abs(t) > 3.0) return 0.01;  // p < 0.01
    if (Math.abs(t) > 2.0) return 0.05;  // p < 0.05
    if (Math.abs(t) > 1.7) return 0.10;  // p < 0.10
    return 0.20; // p >= 0.20
  }
}