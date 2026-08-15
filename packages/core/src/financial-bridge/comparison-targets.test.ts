import { describe, expect, it } from "vitest";
import { computeComparisonTargets } from "./comparison-targets";
import type { ComparisonTargetsInput } from "./comparison-targets";
import { computeNatureDebt } from "./nature-debt";
import { exchangeAmount } from "../types/common";

describe("computeComparisonTargets", () => {
  const natureDebt = computeNatureDebt(
    exchangeAmount(1_000_000),
    [{ scenario: "ngfs_net_zero_2050_gcam", probability: 1, period: 0 }],
    0.05
  );

  /** 報告営業利益1,000万・自然債務100万・純有利子負債2,100万・EBITDA1,000万・支払利息100万。 */
  function input(overrides: Partial<ComparisonTargetsInput> = {}): ComparisonTargetsInput {
    return {
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureAdjustedOperatingProfit: exchangeAmount(9_000_000), // = 報告営業利益 − 自然債務
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(2_000_000),
      financials: { netDebt: 21_000_000, ebitda: 10_000_000, interestExpense: 1_000_000 },
      ...overrides,
    };
  }

  it("operatingProfitRatioを自然債務÷報告営業利益として算出する", () => {
    expect(computeComparisonTargets(input()).operatingProfitRatio).toBeCloseTo(1_000_000 / 10_000_000, 9);
  });

  it("reportedOperatingProfitが0の場合、operatingProfitRatioは0として扱う(0除算を避ける)", () => {
    const result = computeComparisonTargets(input({ reportedOperatingProfit: exchangeAmount(0) }));
    expect(result.operatingProfitRatio).toBe(0);
  });

  it("自然債務が既存の減損テスト閾値を上回る場合、changesAssumption=true", () => {
    const result = computeComparisonTargets(input({ existingImpairmentThreshold: exchangeAmount(500_000) }));

    expect(result.impairmentTestImpact.changesAssumption).toBe(true);
    expect(result.impairmentTestImpact.details).toContain("見直す必要があります");
  });

  it("自然債務が既存の減損テスト閾値以下の場合、changesAssumption=false", () => {
    const result = computeComparisonTargets(input({ existingImpairmentThreshold: exchangeAmount(5_000_000) }));

    expect(result.impairmentTestImpact.changesAssumption).toBe(false);
    expect(result.impairmentTestImpact.details).toContain("範囲内");
  });

  describe("信用指標の変化(D-5.2:PRISMが算術で計算する)", () => {
    it("レバレッジ比率の変化後は、自然債務を有利子負債に上乗せして算出する", () => {
      const [leverage] = computeComparisonTargets(input()).ratingCostOfCapitalImpact.ratios;

      expect(leverage.before).toBeCloseTo(2.1, 9); // 2,100万 / 1,000万
      expect(leverage.after).toBeCloseTo(2.2, 9); // (2,100万 + 100万) / 1,000万
    });

    it("インタレストカバレッジの変化後は、分子をブリッジ1の自然調整後営業利益に差し替えて算出する", () => {
      const ratios = computeComparisonTargets(input()).ratingCostOfCapitalImpact.ratios;
      const coverage = ratios[1];

      expect(coverage.before).toBeCloseTo(10, 9); // 1,000万 / 100万
      expect(coverage.after).toBeCloseTo(9, 9); // 900万 / 100万(新しい金利想定を置かない)
    });

    it("分母が0の比率はnullとし、0や近似値で埋めない(D-15)", () => {
      const result = computeComparisonTargets(
        input({ financials: { netDebt: 21_000_000, ebitda: 0, interestExpense: 0 } })
      );

      for (const change of result.ratingCostOfCapitalImpact.ratios) {
        expect(change.before).toBeNull();
        expect(change.after).toBeNull();
      }
      expect(result.ratingCostOfCapitalImpact.qualitativeNote).toContain("算出不能");
    });

    it("格付・資本コストの定性記述はD-5.2の固定テンプレート通りに数値を機械的に埋め込む", () => {
      const note = computeComparisonTargets(input()).ratingCostOfCapitalImpact.qualitativeNote;

      expect(note).toContain("2.1倍 → 2.2倍(+0.1pt)");
      expect(note).toContain("10.0倍 → 9.0倍(-1.0pt)");
      expect(note).toContain("予測・断定");
      expect(note).toContain("[非GAAP指標]");
    });
  });

  it("非GAAPラベルを付与する", () => {
    expect(computeComparisonTargets(input()).nonGaapLabel.label).toBe("非GAAP指標");
  });
});
