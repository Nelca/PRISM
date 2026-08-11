import { describe, expect, it } from "vitest";
import { runValuationPipeline } from "./valuation-pipeline";
import { createIdSequence } from "./ids";
import { getPluginsForCategory } from "../monetization/registry";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import type { DeepDiveConfig } from "./valuation-pipeline";

const NOW = "2026-08-02T00:00:00Z";

describe("runValuationPipeline", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
    pppSource: "test",
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
    depth: "deep_dive",
    unitReplacementCost: 500,
    externalValueFactors: {
      "lime3-water": 30_000,
      "ifvi-vfnutrition": 1.2,
      "ifvi-vfdisease": 0.95,
      "ifvi-vfes": 1.5,
      "ifvi-vfaccess": 0.3,
    },
    vfesFitnessDimensions: {
      ecologicalFit: 0.8,
      socioeconomicFit: 0.7,
      serviceDefinitionFit: 0.9,
      temporalDistance: 0.6,
      spatialScaleFit: 0.75,
    },
  };

  const deepDiveConfig: DeepDiveConfig = {
    physicalQuantityId: "pq-site042-water-2027",
    input,
    config,
    calibration,
    plugins: getPluginsForCategory("water"),
    calibrationSetVersion: "ifvi-water-consumption-v1",
    reconciliationFunctionVersion: "ifvi-reconciliation-v1",
    fitnessTierThresholdVersion: "fitness-tier-v1",
  };

  it("M3のValuationRecordが生成され、AssumptionEntry(較正・適合度ティア・整合性検証)が実際に反映される", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: {
        algorithmVersion: "shapley-v1",
        cicesMatchLevel: "group",
        aopMappingVersion: "aop-mapping-v1",
        f3ThresholdVersion: "f3-v1",
        f8ThresholdVersion: "f8-v1",
      },
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    const records = result.valuationRecordsByMaterialIssue["mi-site042-water"];
    expect(records).toHaveLength(6); // 代替費用法1・LIME3 1・IFVI4本

    for (const record of records) {
      expect(record.assumptionEntryIds.length).toBeGreaterThanOrEqual(2); // 較正+適合度ティア(+整合性検証)
    }

    const vfes = records.find((r) => r.methodId === "ifvi-water-consumption.VFes")!;
    expect(vfes.transferFitness.tier).not.toBe("C"); // deep_dive+vfesFitnessDimensions指定のため実計算される

    const m3Entries = result.assumptionEntries.filter((e) => e.sourceModule === "M3");
    expect(m3Entries.length).toBeGreaterThan(0);
    const reconciliationEntry = m3Entries.find((e) => e.payload.kind === "reconciliation_check");
    expect(reconciliationEntry).toBeDefined(); // IFVIグループはreconciliationを持つ
  });

  it("M4の乖離分解が実行され、AssumptionEntry(decomposition)が実際に生成される", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: {
        algorithmVersion: "shapley-v1",
        cicesMatchLevel: "group",
        aopMappingVersion: "aop-mapping-v1",
        f3ThresholdVersion: "f3-v1",
        f8ThresholdVersion: "f8-v1",
      },
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.divergenceDecompositions).toHaveLength(1);
    const decomposition = result.divergenceDecompositions[0];
    expect(decomposition.groups.length).toBeGreaterThan(0);

    const m4Entries = result.assumptionEntries.filter((e) => e.sourceModule === "M4");
    const totalPairwise = decomposition.groups.reduce((sum, g) => sum + g.pairwiseDecompositions.length, 0);
    expect(m4Entries).toHaveLength(totalPairwise);
  });

  const DECOMPOSITION_VERSIONS = {
    algorithmVersion: "shapley-v1",
    cicesMatchLevel: "group",
    aopMappingVersion: "aop-mapping-v1",
    f3ThresholdVersion: "f3-v1",
    f8ThresholdVersion: "f8-v1",
  };

  describe("M4 §7.4:代表値の選択(GAP-09)", () => {
    function run(selection?: {
      groupValueConcept: "exchange" | "welfare";
      selectedMethodId: string;
      reason: string;
      priorYearMethodId?: string;
    }) {
      return runValuationPipeline({
        materialIssueIds: ["mi-site042-water"],
        deepDiveConfigForMaterialIssue: () => deepDiveConfig,
        representativeSelectionForMaterialIssue: () => selection,
        decompositionVersions: DECOMPOSITION_VERSIONS,
        idSequence: createIdSequence("ae"),
        now: NOW,
      });
    }

    it("利用者が選択していなければ、代表値の選択は記録されない(理由を捏造しない)", () => {
      const result = run();
      expect(result.divergenceDecompositions[0].representativeValueSelection).toBeUndefined();
      expect(result.assumptionEntries.some((e) => e.payload.kind === "representative_value_selection")).toBe(false);
    });

    it("手法を変更すると、前年度手法での再計算値が並記され、AssumptionEntryが生成される", () => {
      const result = run({
        groupValueConcept: "exchange",
        selectedMethodId: "ifvi-water-consumption.VFaccess",
        reason: "IFVIが水消費方法論の最終版を公開したため",
        priorYearMethodId: "replacement-cost",
      });

      const selection = result.divergenceDecompositions[0].representativeValueSelection!;
      expect(selection.selectedMethodId).toBe("ifvi-water-consumption.VFaccess");
      expect(selection.priorYearMethodId).toBe("replacement-cost");

      // 構想書9.3の必須要件:前年度手法での再計算値の並記
      const records = result.valuationRecordsByMaterialIssue["mi-site042-water"];
      const priorRecord = records.find((r) => r.methodId === "replacement-cost")!;
      expect(selection.recalculatedWithPriorMethod).toBe(priorRecord.centralValue as unknown as number);
      expect(result.representativeSelectionStatus["mi-site042-water"].status).toBe("recalculated");

      const entry = result.assumptionEntries.find((e) => e.payload.kind === "representative_value_selection")!;
      expect(entry).toBeDefined();
      expect(entry.relatedRecordId).toBe(result.divergenceDecompositions[0].id);
      expect(result.divergenceDecompositions[0].assumptionEntryIds).toContain(entry.id);
    });

    it("前年度と同じ手法を選んだ場合は、再計算値の並記は行わない", () => {
      const result = run({
        groupValueConcept: "exchange",
        selectedMethodId: "replacement-cost",
        reason: "前年度から継続",
        priorYearMethodId: "replacement-cost",
      });

      expect(result.divergenceDecompositions[0].representativeValueSelection?.recalculatedWithPriorMethod).toBeUndefined();
      expect(result.representativeSelectionStatus["mi-site042-water"].status).toBe("same_method");
    });
  });
});
