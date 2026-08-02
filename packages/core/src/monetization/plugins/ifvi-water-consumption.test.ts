import { describe, expect, it } from "vitest";
import { ifviWaterConsumptionPlugin, reconstructIfviWaterConsumption } from "./ifvi-water-consumption";
import type { PhysicalQuantityInput, MethodConfig, MethodOutput } from "../../types/valuation";

const input: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 1,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

const baseValueFactors = {
  "ifvi-vfnutrition": 12_000,
  "ifvi-vfdisease": 9_500,
  "ifvi-vfes": 15_200,
  "ifvi-vfaccess": 3_000,
};

describe("ifviWaterConsumptionPlugin", () => {
  it("4本のMethodOutputを、D-1の表通りの価値概念・AoP・割引ステータスで返す", () => {
    const config: MethodConfig = { depth: "screening", externalValueFactors: baseValueFactors };
    const outputs = ifviWaterConsumptionPlugin.evaluate(input, config);

    expect(outputs).toHaveLength(4);

    const nutrition = outputs.find((o) => o.subFactorId === "VFnutrition")!;
    expect(nutrition.valueConcept).toBe("welfare");
    expect(nutrition.aopCode).toBe("human_health");
    expect(nutrition.discountRateStatus).toBe("no_time_dimension");

    const disease = outputs.find((o) => o.subFactorId === "VFdisease")!;
    expect(disease.valueConcept).toBe("welfare");
    expect(disease.aopCode).toBe("human_health");
    expect(disease.discountRateStatus).toBe("no_time_dimension");

    const es = outputs.find((o) => o.subFactorId === "VFes")!;
    expect(es.valueConcept).toBe("welfare");
    expect(es.aopCode).toBe("resource_availability");
    expect(es.discountRateStatus).toBe("no_time_dimension");

    const access = outputs.find((o) => o.subFactorId === "VFaccess")!;
    expect(access.valueConcept).toBe("exchange");
    expect(access.aopCode).toBe("not_applicable");
    expect(access.discountRateStatus).toBe("explicit");
    expect(access.discountRate).toBe(0.02);
  });

  it("スクリーニング深度ではVFesが無条件でティアC固定になる(M3 D-6)", () => {
    const config: MethodConfig = { depth: "screening", externalValueFactors: baseValueFactors };
    const outputs = ifviWaterConsumptionPlugin.evaluate(input, config);
    const es = outputs.find((o) => o.subFactorId === "VFes")!;

    expect(es.transferFitness.tier).toBe("C");
    expect(es.transferFitness.dimensions).toBeUndefined();
  });

  it("深掘り深度で5次元スコアが与えられれば、実際に適合度ティアを計算する", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: baseValueFactors,
      vfesFitnessDimensions: {
        ecologicalFit: 0.9,
        socioeconomicFit: 0.9,
        serviceDefinitionFit: 0.9,
        temporalDistance: 0.9,
        spatialScaleFit: 0.9,
      },
    };
    const outputs = ifviWaterConsumptionPlugin.evaluate(input, config);
    const es = outputs.find((o) => o.subFactorId === "VFes")!;

    expect(es.transferFitness.tier).toBe("A");
  });

  it("深掘り深度でも5次元スコアが未指定ならティアCにフォールバックする", () => {
    const config: MethodConfig = { depth: "deep_dive", externalValueFactors: baseValueFactors };
    const outputs = ifviWaterConsumptionPlugin.evaluate(input, config);
    const es = outputs.find((o) => o.subFactorId === "VFes")!;

    expect(es.transferFitness.tier).toBe("C");
  });

  it("外部価値係数が不足している場合はエラーを投げる", () => {
    const config: MethodConfig = { depth: "screening", externalValueFactors: { "ifvi-vfnutrition": 1 } };
    expect(() => ifviWaterConsumptionPlugin.evaluate(input, config)).toThrow(/ifvi-vfdisease/);
  });
});

describe("reconstructIfviWaterConsumption", () => {
  it("access + max(nutrition, disease, es) を計算する(IFVI Eq.2)", () => {
    const outputs: Pick<MethodOutput, "subFactorId" | "centralValue">[] = [
      { subFactorId: "VFnutrition", centralValue: 100 },
      { subFactorId: "VFdisease", centralValue: 300 }, // これがMAX
      { subFactorId: "VFes", centralValue: 200 },
      { subFactorId: "VFaccess", centralValue: 50 },
    ];

    expect(reconstructIfviWaterConsumption(outputs as MethodOutput[])).toBe(50 + 300);
  });

  it("内訳が1本でも欠けるとエラーを投げる", () => {
    const outputs: Pick<MethodOutput, "subFactorId" | "centralValue">[] = [
      { subFactorId: "VFnutrition", centralValue: 100 },
    ];

    expect(() => reconstructIfviWaterConsumption(outputs as MethodOutput[])).toThrow();
  });
});

describe("ifviWaterConsumptionPlugin.reconciliation", () => {
  it("ゴールデンテストベクタが、実装のreconstruct関数と一致する(D-2の整合性検証)", () => {
    const spec = ifviWaterConsumptionPlugin.reconciliation!;
    expect(spec.goldenTestVectors.length).toBeGreaterThan(0);

    for (const vector of spec.goldenTestVectors) {
      const config: MethodConfig = { depth: "screening", externalValueFactors: baseValueFactors };
      const outputs = ifviWaterConsumptionPlugin.evaluate(vector.input, config);
      const reconstructed = spec.reconstruct(outputs);
      expect(Math.abs(reconstructed - vector.expectedAggregate)).toBeLessThanOrEqual(spec.tolerance);
    }
  });

  it("出典がIFVI公式ではなく自己整合性チェック用であることを明記している", () => {
    const spec = ifviWaterConsumptionPlugin.reconciliation!;
    for (const vector of spec.goldenTestVectors) {
      expect(vector.source).toMatch(/IFVI公式.*ではない/);
    }
  });
});
