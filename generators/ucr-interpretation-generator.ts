/**
 * UCR Interpretation Generator
 * UCRスコアと傾向から解釈文を生成
 */

import interpretationsData from '../data/ucr-interpretations.json' with { type: "json" };

export class UCRInterpretationGenerator {
  private volatilityInterpretations = interpretationsData.volatilityInterpretations;
  private trendStateMap = interpretationsData.trendStateMap;
  private trendStateCodeMap = interpretationsData.trendStateCodeMap;

  /**
   * トレンド状態キーを決定
   */
  determineTrendStateKey(ucrScore: number, momentumCategory: string): string {
    // UCRレベル判定
    let level: string;
    if (ucrScore >= 85) {
      level = 'HIGH';
    } else if (ucrScore >= 65) {
      level = 'MEDIUM';
    } else {
      level = 'LOW';
    }
    
    return `${level}_${momentumCategory}`;
  }

  /**
   * トレンド状態名を取得
   */
  getTrendStateName(stateKey: string): string {
    return this.trendStateMap[stateKey as keyof typeof this.trendStateMap] || '均衡状態';
  }

  /**
   * トレンド状態コードを取得
   */
  getTrendStateCode(stateKey: string): number {
    return this.trendStateCodeMap[stateKey as keyof typeof this.trendStateCodeMap] || 5;
  }

  /**
   * 解釈文を生成
   */
  generateInterpretation(
    ucrScore: number, 
    momentum: number, 
    volatility: number, 
    volatilityLevel: string, 
    trendState: string
  ): string {
    // トレンド状態に対応する解釈を取得
    const stateInterpretations = this.volatilityInterpretations[trendState as keyof typeof this.volatilityInterpretations];
    
    if (!stateInterpretations) {
      return this.generateDefaultInterpretation(ucrScore, momentum, volatility);
    }
    
    // ボラティリティレベルに対応する解釈を取得
    const interpretation = stateInterpretations[volatilityLevel as keyof typeof stateInterpretations];
    
    if (!interpretation) {
      return this.generateDefaultInterpretation(ucrScore, momentum, volatility);
    }
    
    // 解釈文を構築
    const parts: string[] = [];
    
    // 基本的な状態
    parts.push(`【${interpretation.assessment}】`);
    parts.push(interpretation.detail);
    
    // 数値情報を追加
    parts.push(`\n\n📊 詳細データ:`);
    parts.push(`• UCRスコア: ${ucrScore.toFixed(1)}点`);
    parts.push(`• モメンタム: ${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%`);
    parts.push(`• ボラティリティ: ${volatility.toFixed(1)} (${this.getVolatilityLabel(volatilityLevel)})`);
    
    // トレーニング推奨
    parts.push(`\n💡 推奨アクション:`);
    parts.push(this.getRecommendedAction(ucrScore, momentum, volatilityLevel));
    
    return parts.join('\n');
  }

  /**
   * デフォルトの解釈文を生成
   */
  private generateDefaultInterpretation(ucrScore: number, momentum: number, volatility: number): string {
    const parts: string[] = [];
    
    // スコアベースの基本評価
    let assessment = '標準的な状態';
    if (ucrScore >= 85) {
      assessment = '優れた準備状態';
    } else if (ucrScore >= 70) {
      assessment = '良好な準備状態';
    } else if (ucrScore >= 55) {
      assessment = '中程度の準備状態';
    } else if (ucrScore >= 45) {
      assessment = '低い準備状態';
    } else {
      assessment = '非常に低い準備状態';
    }
    
    parts.push(`【${assessment}】`);
    
    // モメンタムの解釈
    if (momentum > 10) {
      parts.push('準備状態は大きく改善しています。');
    } else if (momentum > 2) {
      parts.push('準備状態は緩やかに改善しています。');
    } else if (momentum < -10) {
      parts.push('準備状態は急速に低下しています。');
    } else if (momentum < -2) {
      parts.push('準備状態は緩やかに低下しています。');
    } else {
      parts.push('準備状態は安定しています。');
    }
    
    // ボラティリティの解釈
    if (volatility > 10) {
      parts.push('日々の変動が大きく、不安定な状態です。');
    } else if (volatility > 5) {
      parts.push('適度な変動があります。');
    } else {
      parts.push('変動が小さく、安定しています。');
    }
    
    return parts.join('\n');
  }

  /**
   * ボラティリティレベルのラベルを取得
   */
  private getVolatilityLabel(level: string): string {
    switch (level) {
      case 'LOW': return '低変動';
      case 'MODERATE': return '中変動';
      case 'HIGH': return '高変動';
      default: return level;
    }
  }

  /**
   * 推奨アクションを生成
   */
  private getRecommendedAction(ucrScore: number, momentum: number, volatilityLevel: string): string {
    if (ucrScore >= 85) {
      if (volatilityLevel === 'LOW') {
        return '高強度トレーニングに最適な状態です。計画通りまたはそれ以上の負荷で挑戦できます。';
      } else if (volatilityLevel === 'HIGH') {
        return '準備状態は高いですが、変動に注意が必要です。強度は維持しつつ、回復にも配慮してください。';
      }
      return '良好な状態です。計画通りのトレーニングを実施できます。';
    } else if (ucrScore >= 65) {
      if (momentum > 2) {
        return '回復傾向にあります。中程度の強度でトレーニングを継続し、徐々に負荷を戻していけます。';
      } else if (momentum < -2) {
        return '疲労が蓄積している可能性があります。強度を抑えめにし、回復を優先してください。';
      }
      return '標準的なトレーニングが可能ですが、身体の反応に注意を払ってください。';
    } else if (ucrScore >= 45) {
      if (momentum > 2) {
        return '回復中です。低〜中強度のトレーニングに留め、回復を継続してください。';
      }
      return '積極的な回復を優先してください。軽い有酸素運動やストレッチング程度に留めましょう。';
    } else {
      return '完全休養または非常に軽い活動のみを推奨します。必要に応じて専門家に相談してください。';
    }
  }
}