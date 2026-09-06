import { describe, expect, it } from "vitest";
import { runValuationPipeline } from "./valuation-pipeline";
import { MAX_PARENT_METHODS_PER_GROUP } from "../divergence/build-divergence-decomposition-v2";
import { SUBJECT_IDENTITY_RULE_VERSION } from "../divergence/comparability";
import { isDivergenceDecompositionV2 } from "../types/divergence";
import { createIdSequence } from "./ids";
import { getPluginsForCategory } from "../monetization/registry";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import type { DeepDiveConfig } from "./valuation-pipeline";
import { TEST_DECOMPOSITION_VERSIONS_V2 } from "../divergence/test-helpers";

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
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
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

  it("M4の乖離分解(V2)が実行され、手法間ペアごとにAssumptionEntry(decomposition)が生成される", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.divergenceDecompositions).toHaveLength(1);
    const decomposition = result.divergenceDecompositions[0];
    expect(isDivergenceDecompositionV2(decomposition)).toBe(true);
    expect(decomposition.schemaVersion).toBe(2);
    expect(decomposition.versions).toEqual({ ...TEST_DECOMPOSITION_VERSIONS_V2 });

    // T-13.2:比較対象は物理入力から機械的に構築される(手作業の値コピーが無い)。
    expect(decomposition.subject.physicalQuantityId).toBe("pq-site042-water-2027");
    expect(decomposition.subject.quantity).toEqual({ value: 10_000, unit: "m3", measurementBoundary: "site" });
    expect(decomposition.subject.identityRuleVersion).toBe(SUBJECT_IDENTITY_RULE_VERSION);
    expect(decomposition.subject.flow).toEqual({ kind: "water", waterSource: "unknown", waterUse: "withdrawal" });
    expect(decomposition.subject.provenance).toBe("demo_default");

    // 交換価値1ペア(代替費用法×VFaccess)+ 厚生価値3ペア(LIME3×IFVI3内訳)。
    // IFVIの内訳どうしは手法間ペアに数えない(§4-8)。
    const crossMethodPairs = decomposition.groups.flatMap((group) => group.crossMethodPairs);
    expect(crossMethodPairs).toHaveLength(4);
    expect(crossMethodPairs.every((pair) => pair.parentMethodIdA !== pair.parentMethodIdB)).toBe(true);

    const m4Entries = result.assumptionEntries.filter((e) => e.sourceModule === "M4");
    expect(m4Entries).toHaveLength(crossMethodPairs.length);
    const payload = m4Entries[0].payload;
    if (payload.module !== "M4" || payload.kind !== "decomposition") throw new Error("M4 decomposition payload ではありません");
    expect(payload.toleranceVersion).toBe(TEST_DECOMPOSITION_VERSIONS_V2.toleranceVersion);
    expect(payload.subjectRuleVersion).toBe(TEST_DECOMPOSITION_VERSIONS_V2.subjectRuleVersion);
    expect(payload.decompositionStatus).toBeDefined();
  });

  it("同一手法(IFVI)の内訳分析は別の分析単位として扱い、台帳エントリを作らない(§4-8・T-13.3)", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
      idSequence: createIdSequence("ae"),
      now: NOW,
    });
    const decomposition = result.divergenceDecompositions[0];
    const breakdowns = decomposition.groups.flatMap((group) => group.breakdownAnalyses);
    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].parentMethodId).toBe("ifvi-water-consumption");
    expect(breakdowns[0].aggregationFormula).toBe("VFaccess + MAX(VFnutrition, VFdisease, VFes)");
    // Eq.2 = VFaccess + MAX(VFnutrition, VFdisease, VFes) = 10,000×(0.3 + max(1.2, 0.95, 1.5))
    expect(breakdowns[0].aggregate?.value).toBeCloseTo(10_000 * (0.3 + 1.5), 6);
    expect(breakdowns[0].aggregate?.mixesValueConcepts).toBe(true);

    const m4Entries = result.assumptionEntries.filter((e) => e.sourceModule === "M4");
    const crossMethodPairs = decomposition.groups.flatMap((group) => group.crossMethodPairs);
    expect(m4Entries).toHaveLength(crossMethodPairs.length); // 内訳分析の分だけ増えない
  });

  it("グループ内の親手法数が上限を超えても例外にせず、group_limit_exceeded として残す(T-02-11)", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
      idSequence: createIdSequence("ae"),
      now: NOW,
    });
    for (const group of result.divergenceDecompositions[0].groups) {
      expect(group.groupLimit.maxParentMethods).toBe(MAX_PARENT_METHODS_PER_GROUP);
      expect(group.groupLimit.exceeded).toBe(false);
      expect(group.groupLimit.excludedPairs).toEqual([]);
    }
  });

  it("代替費用法 × VFaccess は反実仮想を定義できず停止する(理由コードと不足データを返す)", () => {
    const result = runValuationPipeline({
      materialIssueIds: ["mi-site042-water"],
      deepDiveConfigForMaterialIssue: () => deepDiveConfig,
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
      idSequence: createIdSequence("ae"),
      now: NOW,
    });
    const exchange = result.divergenceDecompositions[0].groups.find((group) => group.valueConcept === "exchange")!;
    expect(exchange.crossMethodPairs).toHaveLength(1);
    const [pair] = exchange.crossMethodPairs;
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("no_numerizable_factors");
    expect(pair.missingData.length).toBeGreaterThan(0);
  });

  const DECOMPOSITION_VERSIONS = TEST_DECOMPOSITION_VERSIONS_V2;

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
