/**
 * ダミーデータをpackages/core/src/pipeline/*に接続し、M1〜M8の結果を1つにまとめる。
 * UIページ・出力API・GATE検証テストの3箇所から同じ結果を参照するための単一の入口。
 */

import { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import { runValuationPipeline } from "@core/pipeline/valuation-pipeline";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import { runDisclosurePipeline } from "@core/pipeline/disclosure-pipeline";
import { createIdSequence } from "@core/pipeline/ids";
import { ALL_PLUGINS } from "@core/monetization/registry";
import { buildBridge1NatureAdjustedProfit } from "@core/financial-bridge/bridge1";
import { buildBridge2SocialCostView } from "@core/financial-bridge/bridge2";
import { computeInternalizationStatus } from "@core/financial-bridge/internalization-status";
import { computeNatureDebt } from "@core/financial-bridge/nature-debt";
import { computeComparisonTargets } from "@core/financial-bridge/comparison-targets";
import { computeRecalculationHash } from "@core/ledger/recalculation-hash";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "@core/types/valuation";
import type { EvidenceCandidate } from "@core/disclosure/evidence-match";
import {
  BASELINE_NPV,
  buildCountermeasures,
  COMPANY_NAME,
  DEEP_DIVE_CALIBRATION,
  DEEP_DIVE_CONFIG,
  DEEP_DIVE_INPUT,
  DEEP_DIVE_PHYSICAL_QUANTITY_ID,
  demoGeocode,
  DISCLOSURE_CLAIM,
  excludedCategoriesForSite,
  interfacesByCategoryForSite,
  screeningValuationForMaterialIssue,
  SITE_ROWS,
} from "./company";

const NOW = "2027-02-14T09:12:00Z";

const DECOMPOSITION_VERSIONS = {
  algorithmVersion: "shapley-v1",
  cicesMatchLevel: "group",
  aopMappingVersion: "aop-mapping-v1",
  f3ThresholdVersion: "f3-v1",
  f8ThresholdVersion: "f8-v1",
};

/**
 * mulberry32による決定論的な疑似乱数生成器(uncertainty.test.tsのcreateSeededRngと同じ手法)。
 * M3のcombineUncertainty()はMath.random()をデフォルトで使い、rng注入口は
 * buildValuationRecords()の公開APIには現状ない(packages/core自体は変更しない)。
 * デモ用ページ・出力API・GATE検証テストが同じ画面遷移の中で毎回異なる乱数サンプルを
 * 見せると、同じシナリオのはずの数値がページごとに食い違って見えてしまう。
 * そのためデモ層に限定してMath.randomを一時的にシード固定の生成器に差し替える。
 */
function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom<T>(fn: () => T): T {
  const original = Math.random;
  Math.random = createSeededRng(42);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

export function runDemoPipeline() {
  return withSeededRandom(() => runDemoPipelineWithCurrentRandom());
}

function runDemoPipelineWithCurrentRandom() {
  const idSequence = createIdSequence("ae");

  const assessment = runAssessmentPipeline({
    rows: SITE_ROWS,
    geocode: demoGeocode,
    interfacesByCategoryForSite,
    excludedCategoriesForSite,
    screeningValuationForMaterialIssue: (issue) => screeningValuationForMaterialIssue(issue.siteId),
    idSequence,
    now: NOW,
  });

  const promoted = assessment.depthDecisions.filter((d) => d.depth === "deep_dive");

  const valuation = runValuationPipeline({
    materialIssueIds: promoted.map((d) => d.materialIssueId),
    deepDiveConfigForMaterialIssue: () => ({
      physicalQuantityId: DEEP_DIVE_PHYSICAL_QUANTITY_ID,
      input: DEEP_DIVE_INPUT,
      config: DEEP_DIVE_CONFIG,
      calibration: DEEP_DIVE_CALIBRATION,
      plugins: ALL_PLUGINS,
      calibrationSetVersion: "ifvi-water-consumption-v1",
      reconciliationFunctionVersion: "ifvi-reconciliation-v1",
    }),
    decompositionVersions: DECOMPOSITION_VERSIONS,
    idSequence,
    now: NOW,
  });

  const allValuationRecords = Object.values(valuation.valuationRecordsByMaterialIssue).flat();
  const replacementCost = allValuationRecords.find((r) => r.methodId === "replacement-cost") as
    | ExchangeValuationRecord
    | undefined;
  // lime3-waterプラグインは常にwelfare概念を返す(monetization/plugins/lime3-water.tsの実装より)
  const lime3 = allValuationRecords.find((r) => r.methodId === "lime3-water") as WelfareValuationRecord | undefined;

  // --- M5:財務接続(直接呼び出し) ---
  const financialBridge = replacementCost
    ? {
        bridge1: buildBridge1NatureAdjustedProfit(exchangeAmount(BASELINE_NPV.value), replacementCost.centralValue, exchangeAmount(0)),
        bridge2: lime3 ? buildBridge2SocialCostView(lime3.centralValue, 0.15) : null,
        internalizationStatus: computeInternalizationStatus(replacementCost.centralValue, exchangeAmount(2_000_000)),
        natureDebt: computeNatureDebt(
          computeInternalizationStatus(replacementCost.centralValue, exchangeAmount(2_000_000)).uninternalizedCost,
          [
            { scenario: "ngfs_net_zero_2050" as const, probability: 1 / 3, period: 5 },
            { scenario: "ngfs_current_policies" as const, probability: 1 / 3, period: 5 },
            { scenario: "gx_ets_official" as const, probability: 1 / 3, period: 5 },
          ],
          BASELINE_NPV.discountRate
        ),
      }
    : null;

  const comparisonTargets =
    financialBridge && replacementCost
      ? computeComparisonTargets({
          reportedOperatingProfit: exchangeAmount(BASELINE_NPV.value),
          natureDebt: financialBridge.natureDebt,
          existingImpairmentThreshold: exchangeAmount(50_000_000),
          leverage: { before: 1.8, after: 1.9 },
          interestCoverage: { before: 9.5, after: 9.1 },
        })
      : null;

  // --- M6:意思決定 ---
  const decision = replacementCost
    ? runDecisionPipeline({
        id: "dr-site042-2027",
        decisionTarget: "investment_approval",
        decisionMaker: "サステナビリティ推進室",
        decisionDate: "2027-02-14",
        approvalThreshold: { value: exchangeAmount(BASELINE_NPV.value + 25_000_000), source: "manual_entry" },
        relatedValuationRecords: [replacementCost],
        baselineNpv: BASELINE_NPV,
        countermeasures: buildCountermeasures(replacementCost.id),
        valuationRecordsById: { [replacementCost.id]: replacementCost },
        bindingMechanism: { kind: "weak_reference" },
        idSequence,
        now: NOW,
      })
    : null;

  // --- M7:開示検証 ---
  const disclosure = runDisclosurePipeline({
    claims: [DISCLOSURE_CLAIM],
    candidatesForClaim: (): EvidenceCandidate[] =>
      allValuationRecords
        .filter((r) => r.siteId === "site-042")
        .map((r) => ({
          recordId: r.id,
          category: "water",
          period: { startYear: 2027, endYear: 2030 },
          scope: "本社工場",
          transferFitnessTier: r.transferFitness.tier,
        })),
    idSequence,
    now: NOW,
  });

  // --- M8:パイプライン全体のRecalculationHash ---
  const recalculationHash = computeRecalculationHash({
    m1_sensitivityCriteriaVersion: "tnfd-leap-l3-v1",
    m2_priorityFormulaVersion: "priority-v1",
    m3_methodPluginVersions: {
      "replacement-cost": "1.0.0",
      "lime3-water": "3.0.0",
      "ifvi-water-consumption": "2026-03-final",
    },
    m3_geoCalibrationVersion: "ifvi-water-consumption-v1",
    m3_fitnessTierThresholdVersion: "fitness-tier-v1",
    m4_decompositionAlgorithmVersion: DECOMPOSITION_VERSIONS.algorithmVersion,
    m4_cicesMatchLevel: DECOMPOSITION_VERSIONS.cicesMatchLevel,
    m4_aopMappingVersion: DECOMPOSITION_VERSIONS.aopMappingVersion,
    m5_carbonPriceScenarioSetVersion: "carbon-price-v1",
    m6_bindingMechanismDefinitionVersion: "binding-mechanism-v1",
    m7_gapDetectionRuleVersion: "gap-detection-v1",
  });

  const assumptionEntries = [
    ...assessment.assumptionEntries,
    ...valuation.assumptionEntries,
    ...(decision?.assumptionEntries ?? []),
    ...disclosure.assumptionEntries,
  ];

  return {
    companyName: COMPANY_NAME,
    assessment,
    valuation,
    financialBridge,
    comparisonTargets,
    decision,
    disclosure,
    recalculationHash,
    assumptionEntries,
  };
}

export type DemoPipelineResult = ReturnType<typeof runDemoPipeline>;
