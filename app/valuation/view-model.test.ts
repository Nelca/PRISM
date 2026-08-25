import { describe, expect, it } from "vitest";
import { exchangeAmount } from "@core/types/common";
import type { PairwiseDecomposition } from "@core/types/divergence";
import type { ValuationRecord } from "@core/types/valuation";
import { additivePairSteps, pairwiseToWaterfallSteps, zeroValueNote } from "./view-model";

describe("valuation view model", () => {
  it("倍率分解を連続するwaterfall差分へ変換する", () => {
    const pair = {
      methodIdA: "a", methodIdB: "b", valueA: exchangeAmount(100), valueB: exchangeAmount(300),
      ratio: 3, mode: "multiplicative", fallbackApplied: [], narrative: "",
      contributions: [{ factor: "discountRate", logContribution: Math.log(2), multiplier: 2,
        shareRatio: 1, status: "decomposed" }],
      residual: { logResidual: Math.log(1.5), multiplier: 1.5 },
    } satisfies PairwiseDecomposition;
    expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.value)).toEqual([100, 100, 100, 300]);
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
});
