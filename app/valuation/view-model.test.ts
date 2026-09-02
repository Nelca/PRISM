import { describe, expect, it } from "vitest";
import { exchangeAmount } from "@core/types/common";
import type { PairwiseDecomposition } from "@core/types/divergence";
import type { ValuationRecord } from "@core/types/valuation";
import { additivePairSteps, pairwiseToWaterfallSteps, readablePairNarrative, zeroValueNote } from "./view-model";

describe("valuation view model", () => {
  it("倍率分解を連続するwaterfall差分へ変換する", () => {
    const pair = {
      methodIdA: "a", methodIdB: "b", valueA: exchangeAmount(300), valueB: exchangeAmount(100),
      ratio: 3, mode: "multiplicative", fallbackApplied: [], narrative: "",
      contributions: [{ factor: "discountRate", logContribution: Math.log(2), multiplier: 2,
        shareRatio: 1, status: "decomposed" }],
      residual: { logResidual: Math.log(1.5), multiplier: 1.5 },
    } satisfies PairwiseDecomposition;
    expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.value)).toEqual([100, 100, 100, 300]);
    expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.label)).toEqual([
      "B 中心値", "割引率の違い", "分解不能な残差", "A 中心値",
    ]);
  });

  it("加法フォールバックでは両端と差額だけを返す", () => {
    const pair: PairwiseDecomposition = { methodIdA: "a", methodIdB: "b", valueA: exchangeAmount(0),
      valueB: exchangeAmount(25), ratio: null, mode: "additive", fallbackApplied: ["F-1"],
      contributions: [], residual: null, narrative: "" };
    expect(additivePairSteps(pair, "A", "B").map((step) => step.value)).toEqual([0, 25, 25]);
  });

  it("0円のIFVIレコードには地域係数の説明を付ける", () => {
    const record = { centralValue: exchangeAmount(0), methodId: "ifvi-water-consumption.access",
      geographicCalibration: { targetRegion: "JP" } } as ValuationRecord;
    expect(zeroValueNote(record)?.short).toContain("日本");
  });

  it("保存済みの旧形式ナラティブも大きい値を基準に読み直す", () => {
    const pair = {
      methodIdA: "small",
      methodIdB: "large",
      valueA: exchangeAmount(25),
      valueB: exchangeAmount(100),
      ratio: 0.25,
      mode: "multiplicative",
      fallbackApplied: [],
      contributions: [],
      residual: { logResidual: Math.log(0.25), multiplier: 0.25 },
      narrative: "small と large の差は 0.25倍 です。 説明されない残差です。",
    } satisfies PairwiseDecomposition;

    expect(readablePairNarrative(pair)).toBe("large は small の 4.00倍です。 説明されない残差です。");
  });
});
