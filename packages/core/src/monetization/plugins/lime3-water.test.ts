import { describe, expect, it } from "vitest";
import { lime3WaterPlugin } from "./lime3-water";
import type { PhysicalQuantityInput, MethodConfig } from "../../types/valuation";

const input: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 10_000,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

describe("lime3WaterPlugin", () => {
  it("外部価値係数を使って中心値を計算し、正しい形のMethodOutputを1件返す", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: { "lime3-water": 30_000 },
    };

    const outputs = lime3WaterPlugin.evaluate(input, config);

    expect(outputs).toHaveLength(1);
    const [output] = outputs;
    expect(output.centralValue).toBe(10_000 * 30_000);
    expect(output.valueConcept).toBe("welfare");
    expect(output.aopCode).toBe("human_health");
    expect(output.discountRateStatus).toBe("no_time_dimension");
    expect(output.transferFitness.tier).toBe("not_applicable");
  });

  it("価値係数が未指定の場合はエラーを投げる", () => {
    const config: MethodConfig = { depth: "screening" };

    expect(() => lime3WaterPlugin.evaluate(input, config)).toThrow(/lime3-water/);
  });
});
