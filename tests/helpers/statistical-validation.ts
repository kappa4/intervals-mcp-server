/**
 * 統計的妥当性検証のためのユーティリティ関数群
 * UCRボラティリティ分析の統計的前提条件を検証
 */

export interface StatTestResult {
  testName: string;
  statistic: number;
  pValue: number;
  isSignificant: boolean;
  criticalValue?: number;
  conclusion: string;
}

export interface DistributionStats {
  mean: number;
  stdDev: number;
  variance: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  range: number;
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * 基本統計量を計算
 */
export function calculateBasicStats(data: number[]): DistributionStats {
  if (data.length === 0) {
    throw new Error('データが空です');
  }

  const n = data.length;
  const mean = data.reduce((sum, val) => sum + val, 0) / n;
  
  // 分散と標準偏差
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  // 歪度（スキューネス）
  const skewness = data.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n;
  
  // 尖度（クルトーシス）
  const kurtosis = data.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 4), 0) / n - 3;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  
  return {
    mean: Math.round(mean * 1000) / 1000,
    stdDev: Math.round(stdDev * 1000) / 1000,
    variance: Math.round(variance * 1000) / 1000,
    skewness: Math.round(skewness * 1000) / 1000,
    kurtosis: Math.round(kurtosis * 1000) / 1000,
    min,
    max,
    range: max - min
  };
}

/**
 * Shapiro-Wilk正規性検定（簡易版、n<50推奨）
 * 厳密な実装ではないが、基本的な正規性の目安を提供
 */
export function shapiroWilkTest(data: number[]): StatTestResult {
  if (data.length < 3 || data.length > 50) {
    throw new Error('Shapiro-Wilk検定はn=3-50で使用してください');
  }

  const n = data.length;
  const sortedData = [...data].sort((a, b) => a - b);
  const stats = calculateBasicStats(data);
  
  // 簡易版：正規分布との偏差を計算
  // 歪度と尖度を使った近似的判定
  const skewnessDeviation = Math.abs(stats.skewness);
  const kurtosisDeviation = Math.abs(stats.kurtosis);
  
  // 統計量（簡易版）
  const statistic = 1 - (skewnessDeviation + kurtosisDeviation) / 2;
  
  // 簡易的なp値推定（参考値）
  let pValue: number;
  if (skewnessDeviation < 0.5 && kurtosisDeviation < 0.5) {
    pValue = 0.8; // 正規分布に近い
  } else if (skewnessDeviation < 1.0 && kurtosisDeviation < 1.0) {
    pValue = 0.3; // やや正規分布から逸脱
  } else {
    pValue = 0.05; // 正規分布から大きく逸脱
  }
  
  const isSignificant = pValue < 0.05;
  
  return {
    testName: 'Shapiro-Wilk (簡易版)',
    statistic: Math.round(statistic * 1000) / 1000,
    pValue: Math.round(pValue * 1000) / 1000,
    isSignificant,
    conclusion: isSignificant 
      ? '正規分布ではない可能性が高い (p < 0.05)'
      : '正規分布の仮定を棄却できない (p ≥ 0.05)'
  };
}

/**
 * Kolmogorov-Smirnov検定（正規分布との適合度、簡易版）
 */
export function kolmogorovSmirnovTest(data: number[]): StatTestResult {
  if (data.length < 5) {
    throw new Error('KS検定にはn≥5が必要です');
  }

  const n = data.length;
  const sortedData = [...data].sort((a, b) => a - b);
  const stats = calculateBasicStats(data);
  
  // 標準化
  const standardizedData = sortedData.map(x => (x - stats.mean) / stats.stdDev);
  
  // 累積分布関数との最大差を計算
  let maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const empiricalCDF = (i + 1) / n;
    const theoreticalCDF = normalCDF(standardizedData[i]);
    const diff = Math.abs(empiricalCDF - theoreticalCDF);
    maxDiff = Math.max(maxDiff, diff);
  }
  
  // 臨界値（近似）
  const criticalValue = 1.36 / Math.sqrt(n); // α=0.05での近似値
  const isSignificant = maxDiff > criticalValue;
  
  // p値の近似
  const pValue = isSignificant ? 0.02 : 0.15;
  
  return {
    testName: 'Kolmogorov-Smirnov (簡易版)',
    statistic: Math.round(maxDiff * 1000) / 1000,
    pValue: Math.round(pValue * 1000) / 1000,
    isSignificant,
    criticalValue: Math.round(criticalValue * 1000) / 1000,
    conclusion: isSignificant
      ? '正規分布ではない可能性が高い (D > 臨界値)'
      : '正規分布の仮定を棄却できない (D ≤ 臨界値)'
  };
}

/**
 * 標準正規分布の累積分布関数（近似）
 */
function normalCDF(x: number): number {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  if (x > 0) {
    prob = 1 - prob;
  }
  
  return prob;
}

/**
 * ボリンジャーバンドのカバレッジ率を検証
 */
export function validateBollingerCoverage(
  values: number[], 
  period: number = 20, 
  stdMultiplier: number = 1.5
): {
  expectedCoverage: number;
  actualCoverage: number;
  isValid: boolean;
  summary: string;
} {
  if (values.length < period) {
    throw new Error(`期間${period}に対してデータが不足しています`);
  }

  let withinBandCount = 0;
  const validDataPoints = values.length - period + 1;
  
  // 各期間でボリンジャーバンドを計算し、実際のカバレッジを測定
  for (let i = period - 1; i < values.length; i++) {
    const windowData = values.slice(i - period + 1, i + 1);
    const mean = windowData.reduce((sum, val) => sum + val, 0) / period;
    const variance = windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const upperBand = mean + (stdDev * stdMultiplier);
    const lowerBand = mean - (stdDev * stdMultiplier);
    const currentValue = values[i];
    
    if (currentValue >= lowerBand && currentValue <= upperBand) {
      withinBandCount++;
    }
  }
  
  const actualCoverage = withinBandCount / validDataPoints;
  const expectedCoverage = normalCDF(stdMultiplier) - normalCDF(-stdMultiplier);
  
  // 許容誤差10%でバリデーション
  const tolerance = 0.1;
  const isValid = Math.abs(actualCoverage - expectedCoverage) <= tolerance;
  
  return {
    expectedCoverage: Math.round(expectedCoverage * 1000) / 1000,
    actualCoverage: Math.round(actualCoverage * 1000) / 1000,
    isValid,
    summary: `期待カバレッジ: ${(expectedCoverage * 100).toFixed(1)}%, ` +
             `実際カバレッジ: ${(actualCoverage * 100).toFixed(1)}%, ` +
             `${isValid ? '妥当' : '要調整'}`
  };
}

/**
 * 分類結果の混同行列を計算
 */
export function calculateConfusionMatrix(
  predicted: ('LOW' | 'MODERATE' | 'HIGH')[],
  actual: ('LOW' | 'MODERATE' | 'HIGH')[]
): ConfusionMatrix & { detailedMatrix: { [key: string]: { [key: string]: number } } } {
  if (predicted.length !== actual.length) {
    throw new Error('予測値と実際値の長さが一致しません');
  }

  const classes = ['LOW', 'MODERATE', 'HIGH'];
  const matrix: { [key: string]: { [key: string]: number } } = {};
  
  // 行列を初期化
  classes.forEach(actualClass => {
    matrix[actualClass] = {};
    classes.forEach(predictedClass => {
      matrix[actualClass][predictedClass] = 0;
    });
  });
  
  // 実際のカウント
  for (let i = 0; i < predicted.length; i++) {
    matrix[actual[i]][predicted[i]]++;
  }
  
  // 二分類の場合（HIGH vs others）での混同行列計算
  const binaryPredicted = predicted.map(p => p === 'HIGH' ? 'HIGH' : 'OTHER');
  const binaryActual = actual.map(a => a === 'HIGH' ? 'HIGH' : 'OTHER');
  
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < binaryPredicted.length; i++) {
    if (binaryPredicted[i] === 'HIGH' && binaryActual[i] === 'HIGH') tp++;
    else if (binaryPredicted[i] === 'HIGH' && binaryActual[i] === 'OTHER') fp++;
    else if (binaryPredicted[i] === 'OTHER' && binaryActual[i] === 'OTHER') tn++;
    else if (binaryPredicted[i] === 'OTHER' && binaryActual[i] === 'HIGH') fn++;
  }
  
  const accuracy = (tp + tn) / (tp + fp + tn + fn);
  const precision = tp === 0 ? 0 : tp / (tp + fp);
  const recall = tp === 0 ? 0 : tp / (tp + fn);
  const f1Score = precision + recall === 0 ? 0 : 2 * (precision * recall) / (precision + recall);
  
  return {
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
    accuracy: Math.round(accuracy * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1Score: Math.round(f1Score * 1000) / 1000,
    detailedMatrix: matrix
  };
}

/**
 * 統計的有意性の総合評価
 */
export function assessStatisticalValidity(data: number[]): {
  normalityTest: StatTestResult;
  distributionStats: DistributionStats;
  bollingerValidation?: ReturnType<typeof validateBollingerCoverage>;
  overallAssessment: string;
  recommendations: string[];
} {
  const normalityTest = data.length <= 50 
    ? shapiroWilkTest(data) 
    : kolmogorovSmirnovTest(data);
  
  const distributionStats = calculateBasicStats(data);
  
  const recommendations: string[] = [];
  
  // 正規性の評価
  if (normalityTest.isSignificant) {
    recommendations.push('データが正規分布から有意に逸脱しています。ボリンジャーバンドの前提条件を再確認してください。');
  }
  
  // 歪度の評価
  if (Math.abs(distributionStats.skewness) > 1.0) {
    recommendations.push(`歪度が${distributionStats.skewness.toFixed(2)}と大きいです。データの変換を検討してください。`);
  }
  
  // 尖度の評価
  if (Math.abs(distributionStats.kurtosis) > 2.0) {
    recommendations.push(`尖度が${distributionStats.kurtosis.toFixed(2)}と極端です。外れ値の影響を確認してください。`);
  }
  
  // ボリンジャーバンドのバリデーション（データが十分ある場合）
  let bollingerValidation;
  if (data.length >= 20) {
    bollingerValidation = validateBollingerCoverage(data);
    if (!bollingerValidation.isValid) {
      recommendations.push('ボリンジャーバンドのカバレッジが理論値から逸脱しています。パラメータの調整を検討してください。');
    }
  }
  
  let overallAssessment: string;
  if (recommendations.length === 0) {
    overallAssessment = '統計的前提条件は概ね満たされています。';
  } else if (recommendations.length <= 2) {
    overallAssessment = '一部の統計的前提条件に注意が必要です。';
  } else {
    overallAssessment = '複数の統計的前提条件に問題があります。分析手法の見直しを推奨します。';
  }
  
  return {
    normalityTest,
    distributionStats,
    bollingerValidation,
    overallAssessment,
    recommendations
  };
}