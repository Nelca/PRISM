/**
 * パイプライン統合テスト(実装計画フェーズ6)。
 * build-plan §7.1のGATE(「デザインパートナー1社の実データを投入し、M1からM8まで通す」)の
 * 技術的な前提を、架空だが現実的な1社分のデータで検証する。
 *
 * M1(評価パイプライン)→M3スクリーニング(モック)→M2(優先度・昇格判定)
 * →M3深掘り+M4(乖離分解)→M5(財務接続、直接呼び出し)→M6(意思決定)→M7(開示検証)
 * →M8(RecalculationHash)までを通しで検証する。
 */
import { describe, expect, it } from "vitest";
import { runAssessmentPipeline } from "./assessment-pipeline";
import { runValuationPipeline } from "./valuation-pipeline";
import { runDecisionPipeline } from "./decision-pipeline";
import { runDisclosurePipeline } from "./disclosure-pipeline";
import { createIdSequence } from "./ids";
import { ALL_PLUGINS } from "../monetization/registry";
import { buildBridge1NatureAdjustedProfit } from "../financial-bridge/bridge1";
import { buildBridge2SocialCostView } from "../financial-bridge/bridge2";
import { computeRecalculationHash } from "../ledger/recalculation-hash";
import { IDENTITY_CALIBRATION, TEST_DECISION_VERSIONS, TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";
import { exchangeAmount } from "../types/common";
import type { SiteRow } from "../site/ingest";
import type { NatureInterface, Site } from "../types/site";
import type {
  ExchangeValuationRecord,
  GeographicCalibrationRecord,
  MethodConfig,
  PhysicalQuantityInput,
  WelfareValuationRecord,
} from "../types/valuation";
import type { Countermeasure } from "../types/decision";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { DisclosureClaim } from "../types/disclosure";
import type { EvidenceCandidate } from "../disclosure/evidence-match";
import type { RecalculationHashInputs } from "../types/ledger";

const NOW = "2027-02-14T09:12:00Z";

describe("パイプライン統合テスト:架空の1社分のデータでM1〜M8を通しで検証する(build-plan §7.1)", () => {
  // --- 架空企業の拠点データ(CSV相当) ---
  const rows: SiteRow[] = [
    { id: "site-042", name: "化学工場(本社工場)", siteType: "own_site", industrySector: "chemicals", lat: 35.0, lng: 139.0 },
    { id: "site-050", name: "金属加工工場", siteType: "own_site", industrySector: "steel", lat: 34.0, lng: 135.0 },
    { id: "site-099", name: "海外サプライヤー", siteType: "supplier_site", industrySector: "textile", address: "住所不明地区" },
  ];

  const idSequence = createIdSequence("ae");

  it("M1→M2:拠点取込から深掘り昇格判定までが通し、除外・AssumptionEntryが正しく記録される", () => {
    const assessment = runAssessmentPipeline({
      rows,
      // site-099は住所解決に失敗する想定(架空のジオコーディングサービス)
      geocode: (address) => (address === "住所不明地区" ? null : { lat: 0, lng: 0 }),
      interfacesByCategoryForSite: (site: Site): Partial<Record<"water", NatureInterface[]>> => {
        if (site.id === "site-042") {
          // 化学工場は水ストレス地域・KBA近接・ENCORE依存度高
          return {
            water: [
              { id: `${site.id}-kba`, siteId: site.id, layerType: "kba", rawResult: true, dataSource: "IBAT", licenseMode: "pending_review" },
              { id: `${site.id}-ws`, siteId: site.id, layerType: "water_stress", rawResult: true, dataSource: "Aqueduct", licenseMode: "reference_only" },
              { id: `${site.id}-dep`, siteId: site.id, layerType: "dependency_impact", rawResult: true, dataSource: "ENCORE", licenseMode: "reference_only" },
            ],
          };
        }
        // 金属加工工場は水ストレスのみ該当
        return { water: [{ id: `${site.id}-ws`, siteId: site.id, layerType: "water_stress", rawResult: true, dataSource: "Aqueduct", licenseMode: "reference_only" }] };
      },
      excludedCategoriesForSite: () => ["water"],
      // M3スクリーニング(モック):化学工場の方が財務エクスポージャが大きい想定
      screeningValuationForMaterialIssue: (issue): ExchangeValuationRecord => ({
        id: `screen-${issue.id}`,
        methodId: "replacement-cost",
        methodVersion: "1.0.0",
        physicalQuantityId: `pq-${issue.siteId}`,
        siteId: issue.siteId,
        aopCode: "not_applicable",
        aopSourceLabel: "screening",
        aopMappingConfidence: "high",
        quantileRange:
          issue.siteId === "site-042"
            ? { p5: 8_000_000, p50: 10_000_000, p95: 12_000_000 }
            : { p5: 800_000, p50: 1_000_000, p95: 1_200_000 },
        parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
        transferFitness: { tier: "not_applicable" },
        discountRate: null,
        discountRateStatus: "no_time_dimension",
        geographicCalibration: IDENTITY_CALIBRATION,
        scopeExclusions: [],
        recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
        assumptionEntryIds: [],
        recalculationHash: "placeholder:screening",
        valueConcept: "exchange",
        centralValue: exchangeAmount(issue.siteId === "site-042" ? 10_000_000 : 1_000_000),
      }),
      idSequence,
      now: NOW,
    });

    // site-099(住所不明)は除外され、監査可能なMaterialIssueとして記録される
    const excludedIssue = assessment.materialIssues.find((i) => i.siteId === "site-099")!;
    expect(excludedIssue.excluded).toBe(true);
    expect(assessment.assumptionEntries.some((e) => e.sourceModule === "M1" && e.relatedRecordId === excludedIssue.id)).toBe(true);

    // 評価対象は2件(site-042, site-050)、うち感応度・財務エクスポージャの大きいsite-042のみ深掘りに昇格する
    expect(assessment.priorityScores).toHaveLength(2);
    const promoted = assessment.depthDecisions.filter((d) => d.depth === "deep_dive");
    expect(promoted).toHaveLength(1);
    expect(promoted[0].materialIssueId).toContain("site-042");

    // M2のAssumptionEntryが各DepthDecisionに反映されている
    for (const decision of assessment.depthDecisions) {
      expect(decision.assumptionEntryIds).toHaveLength(1);
    }

    // --- M3(深掘り)→M4 ---
    const input: PhysicalQuantityInput = {
      category: "water",
      physicalQuantity: 10_000,
      unit: "m3",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
    };
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

    const valuation = runValuationPipeline({
      materialIssueIds: [promoted[0].materialIssueId],
      deepDiveConfigForMaterialIssue: () => ({
        physicalQuantityId: "pq-site042-water-2027",
        input,
        config,
        calibration,
        plugins: ALL_PLUGINS,
        versions: TEST_VALUATION_VERSIONS,
        calibrationSetVersion: "ifvi-water-consumption-v1",
        reconciliationFunctionVersion: "ifvi-reconciliation-v1",
        fitnessTierThresholdVersion: "fitness-tier-v1",
      }),
      decompositionVersions: {
        algorithmVersion: "shapley-v1",
        cicesMatchLevel: "group",
        aopMappingVersion: "aop-mapping-v1",
        f3ThresholdVersion: "f3-v1",
        f8ThresholdVersion: "f8-v1",
      },
      idSequence,
      now: NOW,
    });

    const records = valuation.valuationRecordsByMaterialIssue[promoted[0].materialIssueId];
    expect(records).toHaveLength(6);
    expect(valuation.divergenceDecompositions).toHaveLength(1);
    expect(valuation.assumptionEntries.filter((e) => e.sourceModule === "M3").length).toBeGreaterThan(0);
    expect(valuation.assumptionEntries.filter((e) => e.sourceModule === "M4").length).toBeGreaterThan(0);

    // --- M5(財務接続、直接呼び出し) ---
    // replacement-costは常にexchange概念、lime3-waterは常にwelfare概念を返す(各プラグインの実装より)
    const replacementCost = records.find((r) => r.methodId === "replacement-cost")! as ExchangeValuationRecord;
    const lime3 = records.find((r) => r.methodId === "lime3-water")! as WelfareValuationRecord;
    expect(replacementCost.valueConcept).toBe("exchange");
    expect(lime3.valueConcept).toBe("welfare");

    const bridge1 = buildBridge1NatureAdjustedProfit(exchangeAmount(1_000_000_000), replacementCost.centralValue, exchangeAmount(0));
    expect(bridge1.nonGaapLabel.label).toBe("非GAAP指標");

    const bridge2 = buildBridge2SocialCostView(lime3.centralValue, 0.1);
    expect(bridge2.disclosureOnlyLabel).toBe(true);

    // --- M6(意思決定) ---
    const baselineNpv: BaselineNpvInput = { value: 500_000_000, discountRate: 0.05, horizon: 10, source: "manual_entry" };
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 20_000_000, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: replacementCost.centralValue, sourceValuationRecordId: replacementCost.id }],
      },
    ];
    const decision = runDecisionPipeline({
      id: "dr-site042-2027",
      decisionTarget: "investment_approval",
      decisionMaker: "sustainability-team",
      decisionDate: "2027-02-14",
      approvalThreshold: { value: exchangeAmount(505_000_000), source: "manual_entry" },
      relatedValuationRecords: [replacementCost],
      baselineNpv,
      countermeasures,
      valuationRecordsById: { [replacementCost.id]: replacementCost },
      bindingMechanism: { kind: "weak_reference" },
      versions: TEST_DECISION_VERSIONS,
      idSequence,
      now: NOW,
    });
    expect(decision.decisionRecord.natureAdjustedNpv.central).toBeGreaterThan(baselineNpv.value);

    // --- M7(開示検証) ---
    const claim: DisclosureClaim = {
      id: "claim-2027-report-p42-01",
      sourceDocument: "統合報告書2027",
      sourcePageOrSection: "p.42",
      rawText: "当社は化学工場における水使用量を継続的に評価しています。",
      claimType: "state",
      extractedMetadata: { category: "water", quantityMentioned: null, periodMentioned: null, scopeMentioned: null },
      extractionConfidence: "high",
    };
    const disclosure = runDisclosurePipeline({
      claims: [claim],
      candidatesForClaim: (): EvidenceCandidate[] =>
        records.map((r) => ({
          recordId: r.id,
          category: "water",
          period: null,
          scope: null,
          transferFitnessTier: r.transferFitness.tier,
        })),
      idSequence,
      now: NOW,
    });
    expect(disclosure.gapFindings[0].gapType).not.toBe("G1_no_evidence"); // 水カテゴリの根拠が実在するため

    // --- M8(RecalculationHash) ---
    const hashInputs: RecalculationHashInputs = {
      m1_sensitivityCriteriaVersion: "tnfd-leap-l3-v1",
      m2_priorityFormulaVersion: "priority-v1",
      m3_methodPluginVersions: {
        "replacement-cost": "1.0.0",
        "lime3-water": "3.0.0",
        "ifvi-water-consumption": "2026-03-final",
      },
      m3_geoCalibrationVersion: "ifvi-water-consumption-v1",
      m3_fitnessTierThresholdVersion: "fitness-tier-v1",
      m4_decompositionAlgorithmVersion: "shapley-v1",
      m4_cicesMatchLevel: "group",
      m4_aopMappingVersion: "aop-mapping-v1",
      m5_carbonPriceScenarioSetVersion: "carbon-price-v1",
      m6_bindingMechanismDefinitionVersion: "binding-mechanism-v1",
      m7_gapDetectionRuleVersion: "gap-detection-v1",
    };
    const hashResult = computeRecalculationHash(hashInputs);
    expect(computeRecalculationHash(hashInputs).hash).toBe(hashResult.hash); // 決定論的

    // --- 監査証跡の総括:全段階のAssumptionEntryが実際に蓄積されている ---
    const allEntries = [
      ...assessment.assumptionEntries,
      ...valuation.assumptionEntries,
      ...decision.assumptionEntries,
      ...disclosure.assumptionEntries,
    ];
    const modulesRepresented = new Set(allEntries.map((e) => e.sourceModule));
    expect(modulesRepresented).toEqual(new Set(["M1", "M2", "M3", "M4", "M7"])); // M6は今回bindingMechanismChangeなしのため0件
  });
});
