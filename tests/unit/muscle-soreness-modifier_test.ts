/**
 * 筋肉痛修正因子のBDDテスト
 * 
 * UCR_THEORETICAL_FOUNDATION.md section 3.2の変更に対応:
 * 旧: 1=悪い(重度), 4=良い(なし)
 * 新: 1=良い(なし), 4=悪い(重度) ← intervals.icuのスケールに合わせる
 * 
 * 筋肉痛は主観的スコアの一部ではなく、乗算的修正因子として適用される
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { UCRCalculatorRefactored } from "../../calculators/ucr-calculator-refactored.ts";
import type { UCRCalculationInput, WellnessData } from "../../ucr-types.ts";

describe("筋肉痛修正因子 (Muscle Soreness Modifier)", () => {
  let calculator: UCRCalculatorRefactored;

  beforeEach(() => {
    calculator = new UCRCalculatorRefactored();
  });

  /**
   * テスト用の基本データを作成
   */
  const createTestData = (soreness?: number): UCRCalculationInput => {
    const historical: WellnessData[] = [];
    
    // 10日分の最小限の履歴データ
    for (let i = 10; i > 0; i--) {
      historical.push({
        date: `2025-01-${String(10 - i).padStart(2, '0')}`,
        hrv: 50,
        rhr: 60,
        sleepHours: 7,
        sleepScore: 80
      });
    }
    
    const current: WellnessData = {
      date: '2025-01-10',
      hrv: 50,      // 中間的な値
      rhr: 60,      // 中間的な値
      sleepHours: 7,
      sleepScore: 80,
      fatigue: 2,    // 普通
      stress: 2,     // 普通
      motivation: 3, // 普通
      mood: 3,       // 普通
      soreness: soreness ?? null  // テスト対象
    };
    
    return { current, historical };
  };

  describe("Scenario: 筋肉痛修正因子の適用", () => {
    describe("Given: ベースラインスコアが同じ状態", () => {
      it("When: 筋肉痛=1 (なし/最良), Then: ペナルティなし (multiplier=1.0)", () => {
        // Given & When
        const result = calculator.calculate(createTestData(1));

        // Then: 修正因子が適用されていないことを確認
        console.log(`Soreness=1 result:`, {
          score: result.score,
          modifiers: result.modifiers
        });
        
        assertEquals(result.modifiers.muscleSorenessPenalty?.applied ?? false, false, 
          "筋肉痛なし(1)ではペナルティが適用されない");
      });

      it("When: 筋肉痛=2 (軽度), Then: 軽度ペナルティ (multiplier=0.9)", () => {
        // Given & When
        const result = calculator.calculate(createTestData(2));

        // Then
        console.log(`Soreness=2 result:`, {
          score: result.score,
          modifiers: result.modifiers
        });
        
        assertEquals(result.modifiers.muscleSorenessPenalty?.applied, true, 
          "筋肉痛軽度(2)でペナルティが適用される");
        assertEquals(result.modifiers.muscleSorenessPenalty?.value, 0.9,
          "軽度の筋肉痛は0.9倍の修正");
        assertEquals(result.modifiers.muscleSorenessPenalty?.reason, '軽度の筋肉痛');
      });

      it("When: 筋肉痛=3 (普通), Then: 中程度ペナルティ (multiplier=0.75)", () => {
        // Given & When
        const result = calculator.calculate(createTestData(3));

        // Then
        console.log(`Soreness=3 result:`, {
          score: result.score,
          modifiers: result.modifiers
        });
        
        assertEquals(result.modifiers.muscleSorenessPenalty?.applied, true,
          "筋肉痛普通(3)でペナルティが適用される");
        assertEquals(result.modifiers.muscleSorenessPenalty?.value, 0.75,
          "普通の筋肉痛は0.75倍の修正");
        assertEquals(result.modifiers.muscleSorenessPenalty?.reason, '普通の筋肉痛');
      });

      it("When: 筋肉痛=4 (重度/最悪), Then: 重度ペナルティ (multiplier=0.5)", () => {
        // Given & When
        const result = calculator.calculate(createTestData(4));

        // Then
        console.log(`Soreness=4 result:`, {
          score: result.score,
          modifiers: result.modifiers
        });
        
        assertEquals(result.modifiers.muscleSorenessPenalty?.applied, true,
          "筋肉痛重度(4)でペナルティが適用される");
        assertEquals(result.modifiers.muscleSorenessPenalty?.value, 0.5,
          "重度の筋肉痛は0.5倍の修正");
        assertEquals(result.modifiers.muscleSorenessPenalty?.reason, '重度の筋肉痛');
      });
    });

    describe("Given: 筋肉痛によるスコアの変化", () => {
      it("When: 筋肉痛が1→2→3→4と悪化, Then: UCRスコアが単調減少", () => {
        // Given & When
        const score1 = calculator.calculate(createTestData(1)).score;
        const score2 = calculator.calculate(createTestData(2)).score;
        const score3 = calculator.calculate(createTestData(3)).score;
        const score4 = calculator.calculate(createTestData(4)).score;

        // Then
        console.log(`Score progression: 1=${score1}, 2=${score2}, 3=${score3}, 4=${score4}`);
        
        assert(score1 > score2, `Soreness=1 (${score1}) > Soreness=2 (${score2})`);
        assert(score2 > score3, `Soreness=2 (${score2}) > Soreness=3 (${score3})`);
        assert(score3 > score4, `Soreness=3 (${score3}) > Soreness=4 (${score4})`);
      });

      it("When: 筋肉痛なし vs 重度, Then: スコア差は約50%", () => {
        // Given & When
        const scoreNone = calculator.calculate(createTestData(1)).score;
        const scoreSevere = calculator.calculate(createTestData(4)).score;

        // Then
        const ratio = scoreSevere / scoreNone;
        console.log(`Score ratio: ${scoreSevere} / ${scoreNone} = ${ratio}`);
        
        // 0.5倍の修正因子が適用されるが、他の要因もあるので完全に0.5にはならない
        assert(ratio >= 0.45 && ratio <= 0.55, 
          `重度筋肉痛のスコアは筋肉痛なしの約50% (実際: ${(ratio * 100).toFixed(1)}%)`);
      });
    });

    describe("Given: 高いベーススコア", () => {
      it("When: 筋肉痛=4 (重度), Then: 高スコアも大幅に減少", () => {
        // Given: 優れた状態のデータ
        const goodData = createTestData(4);
        goodData.current.hrv = 70;  // 良い
        goodData.current.rhr = 50;  // 良い
        goodData.current.sleepScore = 95;  // 良い
        goodData.current.fatigue = 1;  // 最良
        goodData.current.stress = 1;   // 最良
        goodData.current.motivation = 1; // 最良
        goodData.current.mood = 1;      // 最良

        // When
        const resultWithSoreness = calculator.calculate(goodData);
        
        // 筋肉痛なしの場合と比較
        goodData.current.soreness = 1;
        const resultWithoutSoreness = calculator.calculate(goodData);

        // Then
        console.log(`High base score:`, {
          withSoreness4: resultWithSoreness.score,
          withoutSoreness: resultWithoutSoreness.score,
          ratio: resultWithSoreness.score / resultWithoutSoreness.score
        });

        assert(resultWithSoreness.score < resultWithoutSoreness.score * 0.6,
          `重度筋肉痛は高ベーススコアも大幅に減少させる`);
      });
    });

    describe("Given: 複数の修正因子の組み合わせ", () => {
      it("When: 筋肉痛とアルコールの両方, Then: 修正因子が乗算される", () => {
        // Given
        const dataWithBoth = createTestData(3); // 普通の筋肉痛
        dataWithBoth.current.alcohol = 1; // 軽度の飲酒

        const dataOnlySoreness = createTestData(3);
        const dataOnlyAlcohol = createTestData(1);
        dataOnlyAlcohol.current.alcohol = 1;

        // When
        const resultBoth = calculator.calculate(dataWithBoth);
        const resultSoreness = calculator.calculate(dataOnlySoreness);
        const resultAlcohol = calculator.calculate(dataOnlyAlcohol);

        // Then
        console.log(`Multiple modifiers:`, {
          both: resultBoth.score,
          onlySoreness: resultSoreness.score,
          onlyAlcohol: resultAlcohol.score,
          modifiers: resultBoth.modifiers
        });

        assert(resultBoth.score < resultSoreness.score,
          "筋肉痛とアルコールの組み合わせは筋肉痛のみより低スコア");
        assert(resultBoth.score < resultAlcohol.score,
          "筋肉痛とアルコールの組み合わせはアルコールのみより低スコア");
        
        // 両方の修正因子が適用されていることを確認
        assertEquals(resultBoth.modifiers.muscleSorenessPenalty?.applied, true);
        assertEquals(resultBoth.modifiers.alcoholPenalty?.applied, true);
      });
    });
  });

  describe("Scenario: 理論仕様との整合性検証", () => {
    describe("Given: UCR理論仕様の修正因子テーブル", () => {
      it("When: 各筋肉痛レベルを適用, Then: 理論通りの係数", () => {
        // Given: 理論仕様の係数
        const expectedMultipliers = {
          1: 1.0,   // なし
          2: 0.9,   // 軽度
          3: 0.75,  // 普通
          4: 0.5    // 重度
        };

        // When & Then: 各レベルで検証
        for (const [level, expected] of Object.entries(expectedMultipliers)) {
          const result = calculator.calculate(createTestData(Number(level)));
          const actual = result.modifiers.muscleSorenessPenalty?.applied 
            ? result.modifiers.muscleSorenessPenalty.value 
            : 1.0;
          
          assertEquals(actual, expected,
            `Soreness=${level}の修正係数は${expected}であるべき`);
        }
      });
    });
  });
});