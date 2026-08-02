import { describe, expect, it } from "vitest";
import { buildPairwiseDecomposition } from "./pairwise-decomposition";
import { IDENTITY_CALIBRATION, makeValuationRecord } from "./test-helpers";

describe("buildPairwiseDecomposition", () => {
  it("符号が異なる場合はF-2で分解せず、ratioとresidualがnull", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100 });
    const b = makeValuationRecord({ methodId: "b", centralValue: -50 });

    const result = buildPairwiseDecomposition(a, b);
    expect(result.mode).toBe("not_decomposed");
    expect(result.fallbackApplied).toEqual(["F-2"]);
    expect(result.ratio).toBeNull();
    expect(result.residual).toBeNull();
    expect(result.contributions).toEqual([]);
  });

  it("乖離が5%未満の場合はF-8で分解しない", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 101 });
    const b = makeValuationRecord({ methodId: "b", centralValue: 100 });

    const result = buildPairwiseDecomposition(a, b);
    expect(result.mode).toBe("not_decomposed");
    expect(result.fallbackApplied).toEqual(["F-8"]);
  });

  it("§7.3.1:3要因すべて一致するペアは乖離の100%が残差になる", () => {
    // IFVIのVFnutrition vs LIME3相当:同一AoP・両方no_time_dimension・較正も同一
    const vfNutrition = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFnutrition",
      centralValue: 12_000,
      aopCode: "human_health",
      discountRateStatus: "no_time_dimension",
    });
    const lime3 = makeValuationRecord({
      methodId: "lime3-water",
      centralValue: 30_000,
      aopCode: "human_health",
      discountRateStatus: "no_time_dimension",
    });

    const result = buildPairwiseDecomposition(lime3, vfNutrition);

    expect(result.mode).toBe("multiplicative");
    expect(result.ratio).toBeCloseTo(30_000 / 12_000, 9);
    // 3要因すべてゼロ寄与("decomposed"かつlogContribution=0)
    for (const c of result.contributions) {
      expect(c.status).toBe("decomposed");
      expect(c.logContribution).toBe(0);
    }
    // 残差が乖離全体と一致する(説明済み分がゼロのため)
    expect(result.residual).not.toBeNull();
    expect(result.residual!.multiplier).toBeCloseTo(result.ratio!, 9);
    expect(result.narrative).toContain("説明されない残差");
  });

  it("VFes(resource_availability)と人間健康グループの比較:エンドポイント被覆はF-4、地理較正は計算される", () => {
    const vfEs = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFes",
      centralValue: 15_200,
      aopCode: "resource_availability",
      discountRateStatus: "no_time_dimension",
      geographicCalibration: { ...IDENTITY_CALIBRATION, pppValue: 1.2 },
    });
    const lime3 = makeValuationRecord({
      methodId: "lime3-water",
      centralValue: 30_000,
      aopCode: "human_health",
      discountRateStatus: "no_time_dimension",
    });

    const result = buildPairwiseDecomposition(vfEs, lime3);

    expect(result.mode).toBe("multiplicative");
    expect(result.fallbackApplied).toContain("F-4");

    const endpoint = result.contributions.find((c) => c.factor === "endpointCoverage")!;
    expect(endpoint.status).toBe("not_recalculable");
    expect(endpoint.exclusionReason).toBeDefined();

    const geo = result.contributions.find((c) => c.factor === "geographicCalibration")!;
    expect(geo.status).toBe("decomposed");
    expect(geo.multiplier).toBeCloseTo(1.2, 9);

    const discount = result.contributions.find((c) => c.factor === "discountRate")!;
    expect(discount.status).toBe("decomposed");
    expect(discount.logContribution).toBe(0);

    // 効率性: 地理較正の寄与 × 残差 = 全体比率(エンドポイント被覆はF-4で残差に含まれる)
    expect(geo.multiplier * result.residual!.multiplier).toBeCloseTo(result.ratio!, 6);
  });

  it("交換価値グループ(代替費用法 vs VFaccess):エンドポイント被覆はゼロ寄与、割引率はF-4", () => {
    const replacementCost = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 5_000_000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      discountRateStatus: "no_time_dimension",
    });
    const vfAccess = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFaccess",
      centralValue: 3_000_000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      discountRateStatus: "explicit",
      discountRate: 0.02,
    });

    const result = buildPairwiseDecomposition(replacementCost, vfAccess);

    const endpoint = result.contributions.find((c) => c.factor === "endpointCoverage")!;
    expect(endpoint.status).toBe("decomposed");
    expect(endpoint.logContribution).toBe(0);

    const discount = result.contributions.find((c) => c.factor === "discountRate")!;
    expect(discount.status).toBe("not_recalculable");
    expect(result.fallbackApplied).toContain("F-5c");
  });
});
