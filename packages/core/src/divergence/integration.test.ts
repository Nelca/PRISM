/**
 * M4統合テスト(実装計画フェーズ8)。
 * M3統合テスト(monetization/integration.test.ts)が生成する水カテゴリの6本のValuationRecordを
 * そのままM4の buildDivergenceDecomposition に渡し、要件定義書§7.3.1の再現と、
 * VFes(resource_availability)絡みのF-4フォールバックを確認する。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { getPluginsForCategory } from "../monetization/registry";
import { buildDivergenceDecomposition } from "./build-divergence-decomposition";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import { TEST_DECOMPOSITION_VERSIONS, TEST_VALUATION_VERSIONS } from "./test-helpers";

describe("M4統合テスト:M3が生成する水カテゴリ6本のValuationRecordを分解する", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  // M3統合テストと同一の較正(pppValue=1.0=国内サイトのため較正なし)。
  // 全手法が同一の較正を共有するため、このフィクスチャでは地理較正要因は
  // どのペアでも差なし(ゼロ寄与)になる。地理較正が実際に計算されるケースは
  // pairwise-decomposition.test.ts で個別に検証済み。
  const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
    pppSource: "世界銀行ICP 2024年版",
    pppValue: 1.0,
    incomeElasticity: 0.7,
    sourceIncomeLevel: 100,
    targetIncomeLevel: 100,
    deflator: 1.0,
    relativePriceEscalationRate: 1.0,
    elapsedYears: 0,
    areaScaling: 1.0,
  };

  const config: MethodConfig = {
    depth: "screening",
    unitReplacementCost: 500,
    externalValueFactors: {
      "lime3-water": 30_000,
      "ifvi-vfnutrition": 1.2,
      "ifvi-vfdisease": 0.95,
      "ifvi-vfes": 1.5,
      "ifvi-vfaccess": 0.3,
    },
  };

  function buildRecords() {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: getPluginsForCategory("water"),
      versions: TEST_VALUATION_VERSIONS,
    });
    return groups.flatMap((g) => g.records);
  }

  it("交換価値グループ(代替費用法・VFaccess)と厚生価値グループ(VFnutrition/VFdisease/VFes/LIME3)に分割される", () => {
    const records = buildRecords();
    const decomposition = buildDivergenceDecomposition({
      id: "dd-site042-water-2027",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      records,
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    const exchangeGroup = decomposition.groups.find((g) => g.valueConcept === "exchange")!;
    const welfareGroup = decomposition.groups.find((g) => g.valueConcept === "welfare")!;

    expect(exchangeGroup.methodIds.sort()).toEqual(
      ["replacement-cost", "ifvi-water-consumption.VFaccess"].sort()
    );
    expect(welfareGroup.methodIds.sort()).toEqual(
      [
        "lime3-water",
        "ifvi-water-consumption.VFnutrition",
        "ifvi-water-consumption.VFdisease",
        "ifvi-water-consumption.VFes",
      ].sort()
    );

    expect(decomposition.crossGroupComparison?.incommensurable).toBe(true);
    expect(decomposition.valuationRecordIds).toHaveLength(6);
  });

  it("§7.3.1:同一AoPペア(VFnutrition vs LIME3)は3要因とも差がなく、乖離の100%が残差になる", () => {
    const records = buildRecords();
    const decomposition = buildDivergenceDecomposition({
      id: "dd-site042-water-2027",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      records,
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    const welfareGroup = decomposition.groups.find((g) => g.valueConcept === "welfare")!;
    const pair = welfareGroup.pairwiseDecompositions.find(
      (p) =>
        [p.methodIdA, p.methodIdB].includes("lime3-water") &&
        [p.methodIdA, p.methodIdB].includes("ifvi-water-consumption.VFnutrition")
    )!;

    expect(pair).toBeDefined();
    expect(pair.mode).toBe("multiplicative");
    for (const c of pair.contributions) {
      expect(c.status).toBe("decomposed");
      expect(c.logContribution).toBe(0);
    }
    expect(pair.residual).not.toBeNull();
    expect(pair.residual!.multiplier).toBeCloseTo(pair.ratio!, 9);
    expect(pair.narrative).toContain("説明されない残差");
  });

  it("VFes(resource_availability)と人間健康グループのペアは、エンドポイント被覆がF-4で残差に落ちる", () => {
    const records = buildRecords();
    const decomposition = buildDivergenceDecomposition({
      id: "dd-site042-water-2027",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      records,
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    const welfareGroup = decomposition.groups.find((g) => g.valueConcept === "welfare")!;
    const pair = welfareGroup.pairwiseDecompositions.find(
      (p) =>
        [p.methodIdA, p.methodIdB].includes("lime3-water") &&
        [p.methodIdA, p.methodIdB].includes("ifvi-water-consumption.VFes")
    )!;

    expect(pair).toBeDefined();
    expect(pair.fallbackApplied).toContain("F-4");
    const endpoint = pair.contributions.find((c) => c.factor === "endpointCoverage")!;
    expect(endpoint.status).toBe("not_recalculable");
    expect(endpoint.exclusionReason).toBeDefined();

    // このフィクスチャでは全手法が同一の地理較正を共有するため、地理較正もゼロ寄与になり、
    // 乖離の全体がF-4によって残差に落ちる(地理較正が実際に計算されるケースはpairwise-decomposition.test.tsで検証済み)。
    expect(pair.residual).not.toBeNull();
    expect(pair.residual!.multiplier).toBeCloseTo(pair.ratio!, 6);
  });

  it("交換価値グループ(代替費用法 vs VFaccess)は割引率がF-5cで残差に落ちる", () => {
    const records = buildRecords();
    const decomposition = buildDivergenceDecomposition({
      id: "dd-site042-water-2027",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      records,
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    const exchangeGroup = decomposition.groups.find((g) => g.valueConcept === "exchange")!;
    expect(exchangeGroup.pairwiseDecompositions).toHaveLength(1);
    const [pair] = exchangeGroup.pairwiseDecompositions;

    expect(pair.fallbackApplied).toContain("F-5c");
    const discount = pair.contributions.find((c) => c.factor === "discountRate")!;
    expect(discount.status).toBe("not_recalculable");

    const endpoint = pair.contributions.find((c) => c.factor === "endpointCoverage")!;
    expect(endpoint.status).toBe("decomposed"); // not_applicable同士は一致とみなす(§3.2)
    expect(endpoint.logContribution).toBe(0);
  });
});
