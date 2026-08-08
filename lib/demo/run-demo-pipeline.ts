/**
 * ダミーデータをpackages/core/src/pipeline/*に接続し、M1〜M8の結果を1つにまとめる。
 * UIページ・出力API・GATE検証テストの3箇所から同じ結果を参照するための単一の入口。
 *
 * 深掘り評価(M3)〜開示検証(M7)は、架空企業site-042専用の固定値(company.ts)に加え、
 * UIから追加された拠点(site-store.ts)についても、深掘りに進んだ拠点1件ごとに
 * 同じ組み立てロジックを繰り返して実行する(user-site-defaults.tsの汎用ビルダーを使う)。
 *
 * interaction-store.tsに保持されたUI操作(M2深度トグル・M4代表値変更・M6対策選択/反映先・
 * M7開示アクション)を、このパイプラインの各段への入力として合成する。
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
import type { DisclosureClaim } from "@core/types/disclosure";
import type { EvidenceCandidate } from "@core/disclosure/evidence-match";
import type { IntentionalDecisionInput } from "@core/pipeline/disclosure-pipeline";
import type { BaselineNpvInput } from "@core/types/financial-bridge";
import type { BindingMechanism } from "@core/types/decision";
import {
  BASELINE_NPV,
  buildCountermeasureCandidates,
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
import type { CountermeasureCandidate } from "./company";
import { listUserSiteEntries } from "./site-store";
import {
  buildUserBaselineNpv,
  buildUserCountermeasureCandidates,
  buildUserDeepDiveConfig,
  buildUserDisclosureClaim,
  DEFAULT_DEEP_DIVE_PARAMS,
} from "./user-site-defaults";
import {
  getBindingMechanismState,
  getDepthOverrides,
  getDisclosureClaimOverrideText,
  getIntentionalDecisions,
  getM4ChangeLog,
  getRepresentativeRecordId,
  getSelectedCountermeasureKey,
  listActionLog,
} from "./interaction-store";

const NOW = "2027-02-14T09:12:00Z";
const DECISION_MAKER = "宮里(サステナビリティ推進室)";

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

/** MaterialIssue.id は "${siteId}-mi-${category}" の形式(build-material-issues.ts)。 */
function siteIdFromMaterialIssueId(materialIssueId: string): string {
  return materialIssueId.replace(/-mi-\w+$/, "");
}

export function runDemoPipeline() {
  return withSeededRandom(() => runDemoPipelineWithCurrentRandom());
}

function runDemoPipelineWithCurrentRandom() {
  const idSequence = createIdSequence("ae");
  const userSiteEntries = listUserSiteEntries();
  const deepDiveParamsBySiteId = new Map(userSiteEntries.map((entry) => [entry.row.id, entry.deepDive]));

  // --- M2:優先度算定の結果によらない手動昇格/降格を合成する ---
  const manualOverrides = new Set(
    userSiteEntries.filter((entry) => entry.deepDive.forcePromote).map((entry) => `${entry.row.id}-mi-water`)
  );
  const manualDemotions = new Set<string>();
  for (const [materialIssueId, mode] of getDepthOverrides()) {
    if (mode === "promote") manualOverrides.add(materialIssueId);
    else manualDemotions.add(materialIssueId);
  }

  const assessment = runAssessmentPipeline({
    rows: [...SITE_ROWS, ...userSiteEntries.map((entry) => entry.row)],
    geocode: demoGeocode,
    interfacesByCategoryForSite,
    excludedCategoriesForSite,
    screeningValuationForMaterialIssue: (issue) => screeningValuationForMaterialIssue(issue.siteId),
    promotionOptions: { manualOverrides, manualDemotions },
    idSequence,
    now: NOW,
  });

  const promoted = assessment.depthDecisions.filter((d) => d.depth === "deep_dive");

  const valuation = runValuationPipeline({
    materialIssueIds: promoted.map((d) => d.materialIssueId),
    deepDiveConfigForMaterialIssue: (materialIssueId) => {
      const siteId = siteIdFromMaterialIssueId(materialIssueId);
      if (siteId === "site-042") {
        return {
          physicalQuantityId: DEEP_DIVE_PHYSICAL_QUANTITY_ID,
          input: DEEP_DIVE_INPUT,
          config: DEEP_DIVE_CONFIG,
          calibration: DEEP_DIVE_CALIBRATION,
          plugins: ALL_PLUGINS,
          calibrationSetVersion: "ifvi-water-consumption-v1",
          reconciliationFunctionVersion: "ifvi-reconciliation-v1",
        };
      }
      const params = deepDiveParamsBySiteId.get(siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
      return buildUserDeepDiveConfig(siteId, params);
    },
    decompositionVersions: DECOMPOSITION_VERSIONS,
    idSequence,
    now: NOW,
  });

  const allValuationRecords = Object.values(valuation.valuationRecordsByMaterialIssue).flat();

  // --- M4:代表値選択(未選択時はreplacement-costをデフォルト代表値とする) ---
  const representativeRecordByMaterialIssue: Record<string, string> = {};
  const m4ChangeLogByMaterialIssue: Record<string, { from: string; to: string; reason: string }> = {};
  for (const materialIssueId of Object.keys(valuation.valuationRecordsByMaterialIssue)) {
    const records = valuation.valuationRecordsByMaterialIssue[materialIssueId];
    const defaultRecord = records.find((r) => r.methodId === "replacement-cost") ?? records[0];
    const overrideId = getRepresentativeRecordId(materialIssueId);
    const overrideRecord = overrideId ? records.find((r) => r.id === overrideId) : undefined;
    const representative = overrideRecord ?? defaultRecord;
    if (representative) representativeRecordByMaterialIssue[materialIssueId] = representative.id;
    const changeLog = getM4ChangeLog(materialIssueId);
    if (changeLog) m4ChangeLogByMaterialIssue[materialIssueId] = changeLog;
  }

  /**
   * M5・M6は交換価値(exchange)のレコードのみを使う(厚生価値は投資判断に使わない、という
   * 既存の設計原則。company.tsコメント参照)。代表値の上書きが厚生価値を指していても、
   * 決定計算では常にexchange概念のレコードにフォールバックする。
   */
  function representativeRecordForSite(siteId: string): ExchangeValuationRecord | undefined {
    const materialIssueId = `${siteId}-mi-water`;
    const records = valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [];
    const id = representativeRecordByMaterialIssue[materialIssueId];
    const overridden = records.find((r) => r.id === id && r.valueConcept === "exchange");
    const fallback = records.find((r) => r.methodId === "replacement-cost" && r.valueConcept === "exchange");
    return (overridden ?? fallback) as ExchangeValuationRecord | undefined;
  }

  // --- M5:財務接続、M6:対策案比較と意思決定(深掘りに進んだ拠点1件ごと) ---
  const promotedSiteIds = [...new Set(promoted.map((d) => siteIdFromMaterialIssueId(d.materialIssueId)))];

  const decisions = promotedSiteIds.flatMap((siteId) => {
    const siteRecords = allValuationRecords.filter((r) => r.siteId === siteId);
    const representative = representativeRecordForSite(siteId);
    if (!representative) return [];

    const site = assessment.sites.find((s) => s.id === siteId);
    if (!site) return [];

    // lime3-waterプラグインは常にwelfare概念を返す(monetization/plugins/lime3-water.tsの実装より)
    const lime3 = siteRecords.find((r) => r.methodId === "lime3-water") as WelfareValuationRecord | undefined;

    const isFlagshipSite = siteId === "site-042";
    const deepDiveParams = deepDiveParamsBySiteId.get(siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
    const baselineNpv: BaselineNpvInput = isFlagshipSite ? BASELINE_NPV : buildUserBaselineNpv(deepDiveParams);
    const approvalThresholdValue = isFlagshipSite
      ? exchangeAmount(BASELINE_NPV.value + 25_000_000)
      : exchangeAmount(deepDiveParams.approvalThresholdValue);

    const internalizationStatus = computeInternalizationStatus(representative.centralValue, exchangeAmount(2_000_000));
    const financialBridge = {
      bridge1: buildBridge1NatureAdjustedProfit(exchangeAmount(baselineNpv.value), representative.centralValue, exchangeAmount(0)),
      bridge2: lime3 ? buildBridge2SocialCostView(lime3.centralValue, 0.15) : null,
      internalizationStatus,
      natureDebt: computeNatureDebt(
        internalizationStatus.uninternalizedCost,
        [
          { scenario: "ngfs_net_zero_2050" as const, probability: 1 / 3, period: 5 },
          { scenario: "ngfs_current_policies" as const, probability: 1 / 3, period: 5 },
          { scenario: "gx_ets_official" as const, probability: 1 / 3, period: 5 },
        ],
        baselineNpv.discountRate
      ),
    };

    const comparisonTargets = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(baselineNpv.value),
      natureDebt: financialBridge.natureDebt,
      existingImpairmentThreshold: exchangeAmount(50_000_000),
      leverage: { before: 1.8, after: 1.9 },
      interestCoverage: { before: 9.5, after: 9.1 },
    });

    // --- M6:対策案4種を並行して計算し、比較テーブル/散布図に使う ---
    const candidates: CountermeasureCandidate[] = isFlagshipSite
      ? buildCountermeasureCandidates(representative.id)
      : buildUserCountermeasureCandidates(siteId, representative.id, deepDiveParams);

    const bindingState = getBindingMechanismState(siteId);
    const bindingMechanism: BindingMechanism = bindingState?.mechanism ?? { kind: "weak_reference" };
    const bindingHistory = bindingState?.history ?? [];
    const latestBindingChange = bindingHistory[bindingHistory.length - 1];

    const countermeasureCandidates = candidates.map((candidate) => {
      const previewDecision = runDecisionPipeline({
        id: `dr-${siteId}-${candidate.key}-preview`,
        decisionTarget: "investment_approval",
        decisionMaker: DECISION_MAKER,
        decisionDate: "2027-02-14",
        approvalThreshold: { value: approvalThresholdValue, source: "manual_entry" },
        relatedValuationRecords: [representative],
        baselineNpv,
        countermeasures: [candidate.countermeasure],
        valuationRecordsById: { [representative.id]: representative },
        bindingMechanism,
        idSequence,
        now: NOW,
      });
      return {
        key: candidate.key,
        label: candidate.label,
        investmentCost: candidate.countermeasure.investmentCost,
        avoidedPhysicalQuantity: candidate.avoidedPhysicalQuantity,
        decisionRecord: previewDecision.decisionRecord,
      };
    });

    const selectedKey = getSelectedCountermeasureKey(siteId) ?? candidates[0].key;
    const selectedCandidate = candidates.find((c) => c.key === selectedKey) ?? candidates[0];

    const decision = runDecisionPipeline({
      id: isFlagshipSite ? "dr-site042-2027" : `dr-${siteId}-2027`,
      decisionTarget: "investment_approval",
      decisionMaker: DECISION_MAKER,
      decisionDate: "2027-02-14",
      approvalThreshold: { value: approvalThresholdValue, source: "manual_entry" },
      relatedValuationRecords: [representative],
      baselineNpv,
      countermeasures: [selectedCandidate.countermeasure],
      valuationRecordsById: { [representative.id]: representative },
      bindingMechanism,
      ...(latestBindingChange
        ? {
            bindingMechanismChange: {
              previousMechanism: latestBindingChange.previousMechanism,
              reason: latestBindingChange.reason,
              changedAt: latestBindingChange.changedAt,
            },
          }
        : {}),
      idSequence,
      now: NOW,
    });
    // 直近の変更のみpipelineの標準経路でAssumptionEntryを生成する。それより前の変更は
    // このデモが毎回ゼロから再計算する構成上、当時のAssumptionEntryを再現できないため、
    // bindingMechanismHistory配列にのみ反映する(表示上の履歴としては完全な形にする)。
    const decisionRecord = {
      ...decision.decisionRecord,
      bindingMechanismHistory: bindingHistory,
    };

    return [
      {
        siteId,
        siteName: site.name,
        decision: { decisionRecord, assumptionEntries: decision.assumptionEntries },
        financialBridge,
        comparisonTargets,
        countermeasureCandidates,
        selectedCountermeasureKey: selectedKey,
      },
    ];
  });

  // --- M7:開示検証(site-042固定claim + 深掘りに進んだ他拠点の自動生成claim) ---
  const userClaims: DisclosureClaim[] = decisions
    .filter((d) => d.siteId !== "site-042")
    .map((d) => {
      const site = assessment.sites.find((s) => s.id === d.siteId)!;
      const params = deepDiveParamsBySiteId.get(d.siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
      return buildUserDisclosureClaim(site, params);
    });
  const baseClaims: DisclosureClaim[] = [DISCLOSURE_CLAIM, ...userClaims];
  const claimSiteId = new Map<string, string>([[DISCLOSURE_CLAIM.id, "site-042"]]);
  userClaims.forEach((claim, i) => claimSiteId.set(claim.id, decisions.filter((d) => d.siteId !== "site-042")[i].siteId));

  // M7①(記載を弱める)の上書きテキストを適用する。
  const claims: DisclosureClaim[] = baseClaims.map((claim) => {
    const overrideText = getDisclosureClaimOverrideText(claim.id);
    return overrideText ? { ...claim, rawText: overrideText } : claim;
  });

  const candidatesForClaim = (claim: DisclosureClaim): EvidenceCandidate[] => {
    const siteId = claimSiteId.get(claim.id);
    return allValuationRecords
      .filter((r) => r.siteId === siteId)
      .map((r) => ({
        recordId: r.id,
        category: "water",
        period: claim.extractedMetadata.periodMentioned ?? { startYear: 2027, endYear: 2030 },
        scope: claim.extractedMetadata.scopeMentioned ?? "",
        transferFitnessTier: r.transferFitness.tier,
      }));
  };

  // M7③(意図的判断として記録)はclaimId単位で保存されているが、coreのAPIはgapFindingId単位
  // で受け取る。gapFindingIdはidSequence()から動的に生成されるため、まず使い捨てのidSequence
  // で発見用に1回実行し、claimId→gapFindingIdの対応を得てから本番の実行を行う(2パス方式)。
  const discoveryDisclosure = runDisclosurePipeline({
    claims,
    candidatesForClaim,
    idSequence: createIdSequence("discovery"),
    now: NOW,
  });
  const gapFindingIdByClaimId = new Map(discoveryDisclosure.gapFindings.map((f) => [f.claimId, f.id]));

  const intentionalDecisionInputs: IntentionalDecisionInput[] = [];
  for (const [claimId, stored] of getIntentionalDecisions()) {
    const gapFindingId = gapFindingIdByClaimId.get(claimId);
    if (!gapFindingId) continue;
    intentionalDecisionInputs.push({ gapFindingId, reason: stored.reason, recordedBy: DECISION_MAKER, recordedAt: stored.recordedAt });
  }

  const disclosure = runDisclosurePipeline({
    claims,
    candidatesForClaim,
    intentionalDecisions: intentionalDecisionInputs,
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
    ...decisions.flatMap((d) => d.decision.assumptionEntries),
    ...disclosure.assumptionEntries,
  ];

  return {
    companyName: COMPANY_NAME,
    assessment,
    valuation: {
      ...valuation,
      representativeRecordByMaterialIssue,
      m4ChangeLogByMaterialIssue,
    },
    decisions,
    disclosure,
    disclosureClaims: claims,
    disclosureClaimSiteId: Object.fromEntries(claimSiteId),
    recalculationHash,
    assumptionEntries,
    actionLog: listActionLog(),
  };
}

export type DemoPipelineResult = ReturnType<typeof runDemoPipeline>;
