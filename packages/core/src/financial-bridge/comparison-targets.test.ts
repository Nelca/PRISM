import { describe, expect, it } from "vitest";
import { computeComparisonTargets } from "./comparison-targets";
import { computeNatureDebt } from "./nature-debt";
import { exchangeAmount } from "../types/common";

describe("computeComparisonTargets", () => {
  const natureDebt = computeNatureDebt(
    exchangeAmount(1_000_000),
    [{ scenario: "ngfs_net_zero_2050", probability: 1, period: 0 }],
    0.05
  );

  it("operatingProfitRatioを自然債務÷報告営業利益として算出する", () => {
    const result = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(2_000_000),
      leverage: { before: 2.1, after: 2.4 },
      interestCoverage: { before: 8.2, after: 7.5 },
    });

    expect(result.operatingProfitRatio).toBeCloseTo(1_000_000 / 10_000_000, 9);
  });

  it("自然債務が既存の減損テスト閾値を上回る場合、changesAssumption=true", () => {
    const result = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(500_000), // natureDebt(1,000,000)より小さい
      leverage: { before: 2.1, after: 2.4 },
      interestCoverage: { before: 8.2, after: 7.5 },
    });

    expect(result.impairmentTestImpact.changesAssumption).toBe(true);
    expect(result.impairmentTestImpact.details).toContain("見直す必要があります");
  });

  it("自然債務が既存の減損テスト閾値以下の場合、changesAssumption=false", () => {
    const result = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(5_000_000),
      leverage: { before: 2.1, after: 2.4 },
      interestCoverage: { before: 8.2, after: 7.5 },
    });

    expect(result.impairmentTestImpact.changesAssumption).toBe(false);
    expect(result.impairmentTestImpact.details).toContain("範囲内");
  });

  it("格付・資本コストの定性記述はD-5.2の固定テンプレート通りに数値を機械的に埋め込む", () => {
    const result = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(2_000_000),
      leverage: { before: 2.1, after: 2.4 },
      interestCoverage: { before: 8.2, after: 7.5 },
    });

    const note = result.ratingCostOfCapitalImpact.qualitativeNote;
    expect(note).toContain("2.1倍 → 2.4倍(+0.3pt)");
    expect(note).toContain("8.2倍 → 7.5倍(-0.7pt)");
    expect(note).toContain("予測・断定");
    expect(note).toContain("[非GAAP指標]");
  });

  it("非GAAPラベルを付与する", () => {
    const result = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(10_000_000),
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(2_000_000),
      leverage: { before: 2.1, after: 2.4 },
      interestCoverage: { before: 8.2, after: 7.5 },
    });

    expect(result.nonGaapLabel.label).toBe("非GAAP指標");
  });
});
