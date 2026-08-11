/**
 * M8統合テスト(実装計画フェーズ5)。
 * M1〜M7の実際の出力からAssumptionEntryを導出し、RecalculationHashを算出し、
 * 旧版パラメータでの再計算が可能であることを実証する。
 */
import { describe, expect, it } from "vitest";
import {
  deriveM1ExclusionPayload,
  deriveM3CoefficientCalibrationPayload,
  deriveM3FitnessTierPayload,
  deriveM3ReconciliationCheckPayload,
  deriveM4DecompositionPayload,
  deriveM6BindingMechanismChangePayload,
  deriveM7GapFindingPayload,
  deriveM7IntentionalDecisionPayload,
} from "./assumption-entry";
import { computeRecalculationHash } from "./recalculation-hash";
import { getActiveVersion, registerInitialVersion, supersedeVersion } from "./versioned-parameter-set";
import { computeGatedSensitivityScore } from "./license-gated-sensitivity";
import { resolveSiteLocation } from "../site/location";
import { buildMaterialIssues } from "../site/build-material-issues";
import { buildNatureInterfaces } from "../site/locate";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { getPluginsForCategory } from "../monetization/registry";
import { applyGeographicCalibration } from "../monetization/calibration";
import { buildPairwiseDecomposition } from "../divergence/pairwise-decomposition";
import { appendBindingMechanismChange } from "../decision/binding-mechanism";
import { buildGapFinding } from "../disclosure/gap-finding";
import { buildIntentionalDecisionRecord } from "../disclosure/intentional-decision";
import type { Site } from "../types/site";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import type { DisclosureClaim } from "../types/disclosure";
import type { RecalculationHashInputs } from "../types/ledger";
import { TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";

describe("M8統合テスト", () => {
  it("M1:座標解決の除外結果からAssumptionEntryを導出できる", () => {
    const site: Site = {
      id: "site-001",
      name: "拠点",
      siteType: "own_site",
      industrySector: "chemicals",
      location: { kind: "address", address: "存在しない住所", geocoded: false },
    };
    const resolution = resolveSiteLocation(site, () => null);
    const payload = deriveM1ExclusionPayload(resolution);
    expect(payload).not.toBeNull();
    expect(payload!.reason).toContain("ジオコーディング");
  });

  const calibrationV1: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
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

  function buildWaterRecords() {
    const input: PhysicalQuantityInput = {
      category: "water",
      physicalQuantity: 10_000,
      unit: "m3",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
    };
    return buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration: calibrationV1,
      plugins: getPluginsForCategory("water"),
      versions: TEST_VALUATION_VERSIONS,
    });
  }

  it("M3:実際のValuationRecordから較正・整合性検証・適合度ティアのAssumptionEntryを導出できる", () => {
    const groups = buildWaterRecords();
    const ifviGroup = groups.find((g) => g.methodId === "ifvi-water-consumption")!;
    const vfes = ifviGroup.records.find((r) => r.methodId === "ifvi-water-consumption.VFes")!;

    const calibrationPayload = deriveM3CoefficientCalibrationPayload(vfes.geographicCalibration, "ifvi-water-consumption-v1");
    expect(calibrationPayload.pppSource).toBe("世界銀行ICP 2024年版");

    const reconciliationPayload = deriveM3ReconciliationCheckPayload(ifviGroup, "ifvi-reconciliation-v1");
    expect(reconciliationPayload).toEqual({
      module: "M3",
      kind: "reconciliation_check",
      aggregationFunctionVersion: "ifvi-reconciliation-v1",
      goldenTestPassed: true,
    });

    const fitnessPayload = deriveM3FitnessTierPayload(vfes.transferFitness.tier, null);
    expect(fitnessPayload.tier).toBe("C"); // スクリーニング深度は無条件でティアC固定(M3 D-6)
  });

  it("M4:実際のPairwiseDecompositionからAssumptionEntryを導出できる", () => {
    const groups = buildWaterRecords();
    const records = groups.flatMap((g) => g.records);
    const vfes = records.find((r) => r.methodId === "ifvi-water-consumption.VFes")!;
    const lime3 = records.find((r) => r.methodId === "lime3-water")!;

    const decomposition = buildPairwiseDecomposition(vfes, lime3);
    const payload = deriveM4DecompositionPayload(decomposition, {
      algorithmVersion: "shapley-v1",
      cicesMatchLevel: "group",
      aopMappingVersion: "aop-mapping-v1",
      f3ThresholdVersion: "f3-v1",
      f8ThresholdVersion: "f8-v1",
    });

    expect(payload.fallbackApplied).toContain("F-4"); // aopCodeが異なるため
    expect(payload.nonDecomposableFactors).toContain("endpointCoverage");
  });

  it("M6:拘束方式の変更履歴からAssumptionEntryを導出できる", () => {
    const history = appendBindingMechanismChange([], {
      changedAt: "2026-08-02T00:00:00Z",
      previousMechanism: { kind: "weak_reference" },
      newMechanism: { kind: "npv_formula_replacement" },
      reason: "投資判断予算が確保されたため拘束方式を強化",
    });
    const payload = deriveM6BindingMechanismChangePayload(history[0]);
    expect(payload).toEqual({
      module: "M6",
      kind: "binding_mechanism_change",
      previous: "weak_reference",
      next: "npv_formula_replacement",
      reason: "投資判断予算が確保されたため拘束方式を強化",
    });
  });

  it("M7:GapFinding・IntentionalDecisionRecordからAssumptionEntryを導出できる", () => {
    const claim: DisclosureClaim = {
      id: "claim-1",
      sourceDocument: "統合報告書2024",
      sourcePageOrSection: "p.1",
      rawText: "テスト",
      claimType: "state",
      extractedMetadata: { category: "climate", quantityMentioned: null, periodMentioned: null, scopeMentioned: null },
      extractionConfidence: "high",
    };
    const finding = buildGapFinding("finding-1", claim, []);
    expect(deriveM7GapFindingPayload(finding)).toEqual({ module: "M7", kind: "gap_finding", gapType: "G1_no_evidence" });

    const decisionRecord = buildIntentionalDecisionRecord("finding-1", "軽微なため許容", "team", "2026-08-02T00:00:00Z");
    expect(deriveM7IntentionalDecisionPayload(decisionRecord)).toEqual({
      module: "M7",
      kind: "intentional_decision",
      reason: "軽微なため許容",
    });
  });

  it("RecalculationHash:M1〜M7の版情報を束ねたハッシュが決定論的である", () => {
    const inputs: RecalculationHashInputs = {
      m1_sensitivityCriteriaVersion: "tnfd-leap-l3-v1",
      m2_priorityFormulaVersion: "priority-v1",
      m3_methodPluginVersions: { "replacement-cost": "1.0.0", "lime3-water": "3.0.0", "ifvi-water-consumption": "2026-03-final" },
      m3_geoCalibrationVersion: "geo-calib-v1",
      m3_fitnessTierThresholdVersion: "fitness-tier-v1",
      m4_decompositionAlgorithmVersion: "shapley-v1",
      m4_cicesMatchLevel: "group",
      m4_aopMappingVersion: "aop-mapping-v1",
      m5_carbonPriceScenarioSetVersion: "carbon-price-v1",
      m6_bindingMechanismDefinitionVersion: "binding-mechanism-v1",
      m7_gapDetectionRuleVersion: "gap-detection-v1",
    };
    expect(computeRecalculationHash(inputs).hash).toBe(computeRecalculationHash(inputs).hash);
  });

  it("D-4の具体例:WDPA pending時、感応度スコアを暫定算出する(M1の実際のCriteriaMetを使用)", () => {
    const interfaces = buildNatureInterfaces(
      { id: "site-042", name: "拠点", siteType: "own_site", industrySector: "chemicals", location: { kind: "coordinates", lat: 1, lng: 1 } },
      [
        { layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", lookup: () => true },
        { layerType: "water_stress", dataSource: "Aqueduct", licenseMode: "reference_only", lookup: () => true },
        { layerType: "dependency_impact", dataSource: "ENCORE", licenseMode: "reference_only", lookup: () => true },
      ]
    );
    const [materialIssue] = buildMaterialIssues("site-042", { water: interfaces });

    const gated = computeGatedSensitivityScore(materialIssue.criteriaMet, {
      highBiodiversityImportance: { dataSourceId: "wdpa", licenseMode: "pending_review" },
    });

    // 2026-08-08(GAP-08)以降、ゲーティングはM1のMaterialIssue組み立て時点で適用される。
    // したがってM1の算出時点で既に暫定スコア(WDPA/IBAT分を除いた2)になっている。
    expect(materialIssue.sensitivityScore).toBe(2);
    expect(materialIssue.unevaluatedCriteria).toContainEqual({
      criterion: "highBiodiversityImportance",
      reason: "license_pending",
      dataSources: ["IBAT"],
    });

    // M8側のcomputeGatedSensitivityScoreを重ねて適用しても結果は変わらない(冪等)。
    // 二重にゲーティングしてスコアがさらに下がる、という事故が起きないことの確認。
    expect(gated.score).toBe(2);
    expect(gated.pendingCriteria).toEqual(["highBiodiversityImportance"]);
  });

  it("VersionedParameterSet:旧版(v1)を保持したまま新版(v2)に遷移し、v1時点のパラメータで再計算できる", () => {
    const groups = buildWaterRecords();
    const vfes = groups.flatMap((g) => g.records).find((r) => r.methodId === "ifvi-water-consumption.VFes")!;
    const v1Calibration = vfes.geographicCalibration; // v1時点で実際に使われた較正パラメータ(ValuationRecordに自己完結)

    const registry = [registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01")];
    const updated = supersedeVersion(
      registry,
      "ifvi-water-consumption",
      "v2",
      "2027-04-01",
      "IFVIがWater Consumption方法論を改訂"
    );

    expect(getActiveVersion(updated, "ifvi-water-consumption")?.version).toBe("v2");
    // v1は削除されず、supersededByが設定された状態でレジストリに残る
    expect(updated.find((v) => v.version === "v1")?.supersededBy).toBe("v2");

    // 「旧版係数での再計算」= v1のGeographicCalibrationRecordをそのまま計算関数に渡すだけでよい
    const recalculatedWithV1 = applyGeographicCalibration(1000, v1Calibration);
    expect(recalculatedWithV1).toBe(1000); // v1(すべて恒等)の場合は変化なし、という再現性の確認
  });
});
