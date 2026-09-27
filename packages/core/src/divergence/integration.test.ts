/**
 * M4統合テスト(新エンジン V2)。
 * M3が生成する水カテゴリの6本の `ValuationRecord` をそのまま `buildDivergenceDecompositionV2` へ渡し、
 * 価値概念での分割・手法間ペアと内訳分析の分離・停止理由・ゼロ寄与を確認する。
 *
 * 旧エンジン(`buildDivergenceDecomposition`)の F-1〜F-9 フォールバック意味論は
 * `build-divergence-decomposition.test.ts` に残っている。ここは新意味論で書き換えたものであり、
 * 旧テストの件数へ新エンジンを合わせることはしない。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { buildDefaultBreakdownSpecs } from "../monetization/breakdown-specs";
import { getPluginsForCategory } from "../monetization/registry";
import { buildDivergenceDecompositionV2 } from "./build-divergence-decomposition-v2";
import { createProductionRegistry } from "./recipes/registry";
import { buildComparisonSubject } from "./subject";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import { TEST_DECOMPOSITION_VERSIONS_V2, TEST_VALUATION_VERSIONS } from "./test-helpers";

describe("M4統合テスト:M3が生成する水カテゴリ6本のValuationRecordを分解する(V2)", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  /**
   * pppValue=1.0(国内サイトのため較正なし)。全手法が同一の較正記録を共有するため、
   * このフィクスチャでは地理較正要因はどのペアでも差なし(ゼロ寄与)になる。
   * 地理的視点の差が実際に非ゼロ寄与になるケースは
   * `recipes/lime3-water-perspective.test.ts`(実データ)で検証している。
   */
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

  function build() {
    const records = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: getPluginsForCategory("water"),
      versions: TEST_VALUATION_VERSIONS,
    }).flatMap((group) => group.records);

    const decomposition = buildDivergenceDecompositionV2({
      id: "dd-site042-water-2027",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      subject: buildComparisonSubject({
        input,
        physicalQuantityId: "pq-site042-water-2027",
        provenance: "demo_default",
      }),
      records,
      registry: createProductionRegistry(),
      versions: TEST_DECOMPOSITION_VERSIONS_V2,
      breakdownSpecs: buildDefaultBreakdownSpecs(records),
    });
    return { records, decomposition };
  }

  it("交換価値グループ(代替費用法・VFaccess)と厚生価値グループ(VFnutrition/VFdisease/VFes/LIME3)に分割される", () => {
    const { decomposition } = build();
    const exchangeGroup = decomposition.groups.find((g) => g.valueConcept === "exchange")!;
    const welfareGroup = decomposition.groups.find((g) => g.valueConcept === "welfare")!;

    expect(exchangeGroup.recordMethodIds.slice().sort()).toEqual(
      ["replacement-cost", "ifvi-water-consumption.VFaccess"].sort()
    );
    expect(welfareGroup.recordMethodIds.slice().sort()).toEqual(
      [
        "lime3-water",
        "ifvi-water-consumption.VFnutrition",
        "ifvi-water-consumption.VFdisease",
        "ifvi-water-consumption.VFes",
      ].sort()
    );

    expect(decomposition.schemaVersion).toBe(2);
    expect(decomposition.crossGroupComparison?.incommensurable).toBe(true);
    expect(decomposition.valuationRecordIds).toHaveLength(6);
  });

  it("同一手法(IFVI)の内訳同士は手法間ペアにせず、内訳分析として別に扱う(§4-8)", () => {
    const { decomposition } = build();
    const crossMethodPairs = decomposition.groups.flatMap((group) => group.crossMethodPairs);
    expect(crossMethodPairs).toHaveLength(4);
    expect(crossMethodPairs.every((pair) => pair.parentMethodIdA !== pair.parentMethodIdB)).toBe(true);

    const breakdowns = decomposition.groups.flatMap((group) => group.breakdownAnalyses);
    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].parentMethodId).toBe("ifvi-water-consumption");
    expect(breakdowns[0].aggregate?.value).toBeCloseTo(10_000 * (0.3 + 1.5), 6);
    expect(breakdowns[0].aggregate?.mixesValueConcepts).toBe(true);
  });

  it("LIME3 vs IFVI 厚生価値内訳は部分分解になり、地理較正は差が無いためゼロ寄与になる", () => {
    const { decomposition } = build();
    const welfareGroup = decomposition.groups.find((g) => g.valueConcept === "welfare")!;
    // VFes は影響経路の対応付けがレビュー待ち(H-01)のため、本番では確定した分解に混ぜず停止する(§9.5)。
    const vfes = welfareGroup.crossMethodPairs.filter((pair) => pair.methodIdA.endsWith(".VFes") || pair.methodIdB.endsWith(".VFes"));
    expect(vfes).toHaveLength(1);
    expect(vfes[0].status === "stopped" && vfes[0].reason).toBe("recipe_not_registrable");
    const verified = welfareGroup.crossMethodPairs.filter((pair) => !vfes.includes(pair));
    expect(verified.length).toBeGreaterThan(0);
    for (const pair of verified) {
      expect(pair.status).toBe("decomposed");
      if (pair.status !== "decomposed") continue;
      expect(pair.recipe.id).toBe("lime3-vs-ifvi-welfare-water");
      expect(pair.kind).toBe("partial");
      expect(pair.mode).toBe("multiplicative"); // すべて正の値
      expect(pair.contributions).toHaveLength(1);
      expect(pair.contributions[0].factorId).toBe("geographic_calibration");
      expect(pair.contributions[0].isZero).toBe(true);
      // 寄与ゼロなので残差が全体差そのものになる。残差へ「その他」要因を作らない。
      expect(pair.explainedSum).toBe(0);
      expect(pair.residual.value).toBeCloseTo(pair.totalDifference, 12);
      expect(pair.residual.knownUnquantified.length).toBeGreaterThanOrEqual(3);
      expect(pair.residual.unclassified).toBe(false);
    }
  });

  it("交換価値グループ(代替費用法 vs VFaccess)は反実仮想を定義できず停止する", () => {
    const { decomposition } = build();
    const exchangeGroup = decomposition.groups.find((g) => g.valueConcept === "exchange")!;
    expect(exchangeGroup.crossMethodPairs).toHaveLength(1);
    const [pair] = exchangeGroup.crossMethodPairs;
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("no_numerizable_factors");
    expect(pair.qualitativeDifferences.map((difference) => difference.category)).toContain("time_model");
    expect(pair.missingData.some((action) => action.item.includes("損害時間列"))).toBe(true);
    expect(pair.implication.kind).toBe("additional_investigation");
  });

  it("再計算ハッシュは上流のレコード・トレース・レシピ・版から決まる", () => {
    const first = build().decomposition;
    const second = build().decomposition;
    expect(first.recalculationHash).toBe(second.recalculationHash);
    expect(first.versions).toEqual({ ...TEST_DECOMPOSITION_VERSIONS_V2 });
  });
});
