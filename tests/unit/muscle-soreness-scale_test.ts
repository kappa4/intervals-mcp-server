/**
 * 筋肉痛スケール変更のBDDテスト
 * 
 * UCR_THEORETICAL_FOUNDATION.md section 3.2の変更に対応:
 * 旧: 1=悪い(重度), 4=良い(なし)
 * 新: 1=良い(なし), 4=悪い(重度) ← intervals.icuのスケールに合わせる
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { SubjectiveScoreCalculator } from "../../calculators/subjective-score-calculator.ts";
import type { SubjectiveData } from "../../calculators/subjective-score-calculator.ts";

describe("筋肉痛スケール変更 (Muscle Soreness Scale Reversal)", () => {
  let calculator: SubjectiveScoreCalculator;

  beforeEach(() => {
    calculator = new SubjectiveScoreCalculator();
  });

  describe("Scenario: intervals.icuスケールへの適合", () => {
    describe("Given: 筋肉痛データのみある状態", () => {
      it("When: 筋肉痛=1 (なし/最良), Then: 高いスコアを返す", () => {
        // Given: 筋肉痛なし（intervals.icuでは1=最良）
        const subjectiveData: SubjectiveData = {
          fatigue: 2,      // 普通(デフォルト)
          stress: 2,       // 普通(デフォルト)
          motivation: 3,   // 普通(デフォルト)
          mood: 3,         // 普通(デフォルト)
          soreness: 1,     // なし（最良）NEW!
          injury: null,
          alcohol: 0
        };

        // When: 主観的スコアを計算
        const score = calculator.calculate(subjectiveData);

        // Then: スコアは高め（筋肉痛なしは良い状態）
        // デフォルト状態（全て普通）より高いはず
        const defaultData: SubjectiveData = {
          fatigue: 2,
          stress: 2,
          motivation: 3,
          mood: 3,
          soreness: null,
          injury: null,
          alcohol: 0
        };
        const defaultScore = calculator.calculate(defaultData);
        
        // 筋肉痛なし(1)は良い状態なので、デフォルトより高い or 同等
        console.log(`Soreness=1 score: ${score}, Default score: ${defaultScore}`);
        assertEquals(score >= defaultScore, true, 
          `筋肉痛なし(1)のスコア${score}はデフォルト${defaultScore}以上であるべき`);
      });

      it("When: 筋肉痛=4 (重度/最悪), Then: 低いスコアを返す", () => {
        // Given: 重度の筋肉痛（intervals.icuでは4=最悪）
        const subjectiveData: SubjectiveData = {
          fatigue: 2,      // 普通(デフォルト)
          stress: 2,       // 普通(デフォルト)
          motivation: 3,   // 普通(デフォルト)
          mood: 3,         // 普通(デフォルト)
          soreness: 4,     // 重度（最悪）NEW!
          injury: null,
          alcohol: 0
        };

        // When: 主観的スコアを計算
        const score = calculator.calculate(subjectiveData);

        // Then: スコアは低め（重度の筋肉痛は悪い状態）
        const defaultData: SubjectiveData = {
          fatigue: 2,
          stress: 2,
          motivation: 3,
          mood: 3,
          soreness: null,
          injury: null,
          alcohol: 0
        };
        const defaultScore = calculator.calculate(defaultData);
        
        // 重度の筋肉痛(4)は悪い状態なので、デフォルトより低い
        console.log(`Soreness=4 score: ${score}, Default score: ${defaultScore}`);
        assertEquals(score < defaultScore, true,
          `重度の筋肉痛(4)のスコア${score}はデフォルト${defaultScore}より低いべき`);
      });
    });

    describe("Given: 全主観的指標が最良（すべて1）", () => {
      it("When: 筋肉痛も1（最良）, Then: 満点に近いスコア", () => {
        // Given: すべての指標が最良(1)
        const bestData: SubjectiveData = {
          fatigue: 1,      // 最良
          stress: 1,       // 最良
          motivation: 1,   // 最良
          mood: 1,         // 最良
          soreness: 1,     // なし（最良）NEW!
          injury: null,
          alcohol: 0
        };

        // When: 主観的スコアを計算
        const score = calculator.calculate(bestData);

        // Then: 満点（20点）に近い
        console.log(`All best (1) score: ${score}`);
        assertEquals(score >= 19, true, 
          `すべて最良(1)のスコア${score}は19点以上であるべき`);
      });
    });

    describe("Given: 全主観的指標が最悪（すべて4）", () => {
      it("When: 筋肉痛も4（最悪）, Then: 最低点に近いスコア", () => {
        // Given: すべての指標が最悪(4)
        const worstData: SubjectiveData = {
          fatigue: 4,      // 最悪
          stress: 4,       // 最悪
          motivation: 4,   // 最悪
          mood: 4,         // 最悪
          soreness: 4,     // 重度（最悪）NEW!
          injury: null,
          alcohol: 0
        };

        // When: 主観的スコアを計算
        const score = calculator.calculate(worstData);

        // Then: 最低点（0点）に近い
        console.log(`All worst (4) score: ${score}`);
        assertEquals(score <= 1, true,
          `すべて最悪(4)のスコア${score}は1点以下であるべき`);
      });
    });

    describe("Given: 筋肉痛スケールの順序性検証", () => {
      it("When: 筋肉痛1→2→3→4と変化, Then: スコアは単調減少", () => {
        const baseData: SubjectiveData = {
          fatigue: 2,
          stress: 2,
          motivation: 3,
          mood: 3,
          soreness: null,
          injury: null,
          alcohol: 0
        };

        // When: 筋肉痛を1から4まで変化させる
        const score1 = calculator.calculate({ ...baseData, soreness: 1 });
        const score2 = calculator.calculate({ ...baseData, soreness: 2 });
        const score3 = calculator.calculate({ ...baseData, soreness: 3 });
        const score4 = calculator.calculate({ ...baseData, soreness: 4 });

        // Then: スコアは単調減少（1が最良、4が最悪）
        console.log(`Soreness scores: 1=${score1}, 2=${score2}, 3=${score3}, 4=${score4}`);
        assertEquals(score1 >= score2, true, `Soreness=1(${score1}) >= Soreness=2(${score2})`);
        assertEquals(score2 >= score3, true, `Soreness=2(${score2}) >= Soreness=3(${score3})`);
        assertEquals(score3 >= score4, true, `Soreness=3(${score3}) >= Soreness=4(${score4})`);
      });
    });
  });

  describe("Scenario: 他の主観的指標との整合性", () => {
    describe("Given: 筋肉痛と他の指標の方向性が同じ", () => {
      it("When: 全指標が1（最良）, Then: 一貫性のある高スコア", () => {
        // Given: すべての指標が最良で一貫
        const consistentGood: SubjectiveData = {
          fatigue: 1,      // 最良（疲労なし）
          stress: 1,       // 最良（ストレスなし）
          motivation: 1,   // 最良（高モチベーション）
          mood: 1,         // 最良（良い気分）
          soreness: 1,     // 最良（筋肉痛なし）NEW!
          injury: null,
          alcohol: 0
        };

        // When: スコア計算
        const score = calculator.calculate(consistentGood);

        // Then: 高スコア（一貫性がある）
        console.log(`Consistent good score: ${score}`);
        assertEquals(score >= 19, true, 
          `一貫して良い状態のスコア${score}は19点以上であるべき`);
      });

      it("When: 全指標が4（最悪）, Then: 一貫性のある低スコア", () => {
        // Given: すべての指標が最悪で一貫
        const consistentBad: SubjectiveData = {
          fatigue: 4,      // 最悪（重度疲労）
          stress: 4,       // 最悪（高ストレス）
          motivation: 4,   // 最悪（低モチベーション）
          mood: 4,         // 最悪（悪い気分）
          soreness: 4,     // 最悪（重度筋肉痛）NEW!
          injury: null,
          alcohol: 0
        };

        // When: スコア計算
        const score = calculator.calculate(consistentBad);

        // Then: 低スコア（一貫性がある）
        console.log(`Consistent bad score: ${score}`);
        assertEquals(score <= 1, true,
          `一貫して悪い状態のスコア${score}は1点以下であるべき`);
      });
    });
  });

  describe("Scenario: 変換マップの詳細検証", () => {
    describe("Given: 筋肉痛の変換マップ", () => {
      it("When: 各値を変換, Then: 正しい正規化値", () => {
        // 内部メソッドをテストするため、実際の計算を通じて検証
        const baseData: SubjectiveData = {
          fatigue: null,
          stress: null,
          motivation: null,
          mood: null,
          soreness: null,
          injury: null,
          alcohol: 0
        };

        // 筋肉痛の各値でスコアを計算し、期待される傾向を確認
        const scores = [1, 2, 3, 4].map(soreness => {
          // 他の指標を中立にして筋肉痛の影響を分離
          const data = { 
            ...baseData, 
            soreness,
            fatigue: 2.5,    // 中間値
            stress: 2.5,     // 中間値
            motivation: 2.5, // 中間値
            mood: 2.5        // 中間値
          };
          return calculator.calculate(data);
        });

        console.log('Soreness conversion test:');
        console.log(`  1 (なし/最良): score=${scores[0]}`);
        console.log(`  2 (軽度): score=${scores[1]}`);
        console.log(`  3 (普通): score=${scores[2]}`);
        console.log(`  4 (重度/最悪): score=${scores[3]}`);

        // 期待される順序: 1 > 2 > 3 > 4
        assertEquals(scores[0] > scores[1], true, "Soreness 1 > 2");
        assertEquals(scores[1] > scores[2], true, "Soreness 2 > 3");
        assertEquals(scores[2] > scores[3], true, "Soreness 3 > 4");
      });
    });
  });
});