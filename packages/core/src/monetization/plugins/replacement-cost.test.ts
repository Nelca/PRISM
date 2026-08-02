import { describe, expect, it } from "vitest";
import { replacementCostPlugin } from "./replacement-cost";
import type { PhysicalQuantityInput, MethodConfig } from "../../types/valuation";

const input: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 10_000, // m3
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

describe("replacementCostPlugin", () => {
  it("物理量 × 単価 で中心値を計算し、正しい形のMethodOutputを1件返す", () => {
    const config: MethodConfig = { depth: "screening", unitReplacementCost: 500 };

    const outputs = replacementCostPlugin.evaluate(input, config);

    expect(outputs).toHaveLength(1);
    const [output] = outputs;
    expect(output.centralValue).toBe(10_000 * 500);
    expect(output.valueConcept).toBe("exchange");
    expect(output.aopCode).toBe("not_applicable");
    expect(output.discountRateStatus).toBe("no_time_dimension");
    expect(output.discountRate).toBeNull();
    expect(output.transferFitness.tier).toBe("not_applicable");
  });

  it("unitReplacementCostが未指定の場合はエラーを投げる(推定で埋めない)", () => {
    const config: MethodConfig = { depth: "screening" };

    expect(() => replacementCostPlugin.evaluate(input, config)).toThrow(/unitReplacementCost/);
  });

  it("reconciliationは持たない(単一手法のため不要)", () => {
    expect(replacementCostPlugin.reconciliation).toBeUndefined();
  });
});
