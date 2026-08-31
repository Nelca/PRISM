import { describe, expect, it } from "vitest";
import { buildBridge1NatureAdjustedProfit, buildWaterfallSteps } from "./bridge1";
import { exchangeAmount } from "../types/common";

describe("buildBridge1NatureAdjustedProfit", () => {
  it("自然調整後営業利益を正しく算出し、非GAAPラベルを付与する", () => {
    const bridge1 = buildBridge1NatureAdjustedProfit(
      exchangeAmount(1_000_000_000),
      exchangeAmount(100_000_000),
      exchangeAmount(50_000_000)
    );

    expect(bridge1.natureAdjustedOperatingProfit).toBe(850_000_000);
    expect(bridge1.nonGaapLabel).toEqual({ label: "非GAAP指標", appliesTo: ["natureAdjustedOperatingProfit"] });
  });
});

describe("buildWaterfallSteps", () => {
  it("ブリッジ1の既存フィールドからウォーターフォール手順を組み立てる", () => {
    const bridge1 = buildBridge1NatureAdjustedProfit(
      exchangeAmount(1_000_000_000),
      exchangeAmount(100_000_000),
      exchangeAmount(50_000_000)
    );

    const steps = buildWaterfallSteps(bridge1);

    expect(steps).toEqual([
      { label: "報告営業利益", value: 1_000_000_000, isTotal: true },
      { label: "依存リスク正常化調整", value: -100_000_000, isTotal: false },
      { label: "将来内部化見込みコスト", value: -50_000_000, isTotal: false },
      { label: "確認済み増分便益", value: 0, isTotal: false },
      { label: "自然調整後営業利益", value: 850_000_000, isTotal: true },
    ]);
  });

  it("確認済み増分便益を費用と相殺せず別段で加算する", () => {
    const bridge1 = buildBridge1NatureAdjustedProfit(
      exchangeAmount(1_000_000_000),
      exchangeAmount(100_000_000),
      exchangeAmount(50_000_000),
      exchangeAmount(20_000_000)
    );

    expect(bridge1.verifiedIncrementalBenefit).toBe(20_000_000);
    expect(bridge1.natureAdjustedOperatingProfit).toBe(870_000_000);
  });
});
