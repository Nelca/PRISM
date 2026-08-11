import { describe, expect, it } from "vitest";
import { ghgCarbonPriceConversionPlugin } from "./ghg-carbon-price-conversion";
import type { PhysicalQuantityInput, MethodConfig } from "../../types/valuation";

const input: PhysicalQuantityInput = {
  category: "climate",
  physicalQuantity: 1_000, // tCO2e
  unit: "tCO2e",
  siteId: "site-050",
  sourceRegion: "JP",
  targetRegion: "JP",
};

describe("ghgCarbonPriceConversionPlugin", () => {
  it("GHG排出量 × 社会的費用・GX-ETS価格 で2本の内訳値を返す", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: {
        "carbon-social-cost-usd-per-tco2": 236,
        "gx-ets-adjustment-baseline-price-jpy-per-tco2": 1_700,
      },
    };

    const outputs = ghgCarbonPriceConversionPlugin.evaluate(input, config);

    expect(outputs).toHaveLength(2);
    const socialCost = outputs.find((o) => o.subFactorId === "ghg-social-cost")!;
    const gxEts = outputs.find((o) => o.subFactorId === "ghg-gx-ets-price")!;

    expect(socialCost.valueConcept).toBe("welfare");
    expect(socialCost.centralValue).toBe(1_000 * 236);
    expect(socialCost.aopCode).toBe("unmapped");
    expect(socialCost.aopMappingConfidence).toBe("unmapped");

    expect(gxEts.valueConcept).toBe("exchange");
    expect(gxEts.centralValue).toBe(1_000 * 1_700);
    expect(gxEts.aopCode).toBe("not_applicable");
    expect(gxEts.discountRateStatus).toBe("no_time_dimension");
  });

  it("社会的費用の係数が未指定の場合はエラーを投げる(推定で埋めない)", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: { "gx-ets-adjustment-baseline-price-jpy-per-tco2": 1_700 },
    };

    expect(() => ghgCarbonPriceConversionPlugin.evaluate(input, config)).toThrow(/carbon-social-cost/);
  });

  it("GX-ETS価格の係数が未指定の場合はエラーを投げる(推定で埋めない)", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: { "carbon-social-cost-usd-per-tco2": 236 },
    };

    expect(() => ghgCarbonPriceConversionPlugin.evaluate(input, config)).toThrow(/gx-ets-adjustment-baseline-price/);
  });

  it("supportedCategoriesはclimateのみ", () => {
    expect(ghgCarbonPriceConversionPlugin.supportedCategories).toEqual(["climate"]);
  });

  it("reconciliationは持たない(交換価値と厚生価値は型レベルで合成不可のため集計自体が発生しない)", () => {
    expect(ghgCarbonPriceConversionPlugin.reconciliation).toBeUndefined();
  });
});
