/**
 * ダミーデータをpackages/core/src/pipeline/*に接続し、M1〜M8の結果を1つにまとめる。
 * UIページ・出力API・GATE検証テストの3箇所から同じ結果を参照するための単一の入口。
 *
 * 深掘り評価(M3)〜開示検証(M7)は、架空企業site-042専用の固定値(company.ts)に加え、
 * 追加登録された拠点についても、深掘りに進んだ拠点1件ごとに
 * 同じ組み立てロジックを繰り返して実行する(user-site-defaults.tsの汎用ビルダーを使う)。
 *
 * **入力はすべて引数で受け取る**(2026-08-08、永続化対応)。以前はプロセス内ストア
 * (site-store.ts / interaction-store.ts)を直接読んでいたが、拠点も操作も
 * DBのテーブルになったため、読み出しは呼び出し側(lib/pipeline/execute-run.ts)の責務にした。
 * これによりこのファイルは副作用を持たない純粋な組み立て関数になり、テストからも
 * 任意の入力で呼べる。
 */

import { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import { runValuationPipeline } from "@core/pipeline/valuation-pipeline";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import { runDisclosurePipeline } from "@core/pipeline/disclosure-pipeline";
import { createIdSequence } from "@core/pipeline/ids";
import { ALL_PLUGINS } from "@core/monetization/registry";
import { createSeededRng } from "@core/monetization/rng";
import { runFinancialBridgePipeline } from "@core/pipeline/financial-bridge-pipeline";
import { computeRecalculationHash } from "@core/ledger/recalculation-hash";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "@core/types/valuation";
import type { DisclosureClaim } from "@core/types/disclosure";
import type { EvidenceCandidate } from "@core/disclosure/evidence-match";
import type { IntentionalDecisionInput } from "@core/pipeline/disclosure-pipeline";
import type { BaselineNpvInput } from "@core/types/financial-bridge";
import type { ApprovalThreshold, BindingMechanism } from "@core/types/decision";
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
  FLAGSHIP_FINANCIALS,
  interfacesByCategoryForSite,
  PRIOR_YEAR_METHOD_BY_MATERIAL_ISSUE,
  screeningValuationForMaterialIssue,
  SITE_ROWS,
} from "./company";
import type { CountermeasureCandidate } from "./company";
import type { UserSiteEntry } from "./site-entry";
import {
  buildUserBaselineNpv,
  buildUserCountermeasureCandidates,
  buildUserDeepDiveConfig,
  buildUserDisclosureClaim,
  buildUserFinancials,
  DEFAULT_DEEP_DIVE_PARAMS,
} from "./user-site-defaults";
import { emptyInteractionState } from "./interaction-state";
import type { InteractionState } from "./interaction-state";

const NOW = "2027-02-14T09:12:00Z";
const DECISION_MAKER = "宮里(サステナビリティ推進室)";

/** M6 D-6の拘束方式定義の版。DecisionRecordの再計算ハッシュに入る(GAP-06)。 */
const DECISION_VERSIONS = { bindingMechanismDefinitionVersion: "binding-mechanism-v1" };

const DECOMPOSITION_VERSIONS = {
  algorithmVersion: "shapley-v1",
  cicesMatchLevel: "group",
  aopMappingVersion: "aop-mapping-v1",
  f3ThresholdVersion: "f3-v1",
  f8ThresholdVersion: "f8-v1",
};

/** MaterialIssue.id は "${siteId}-mi-${category}" の形式(build-material-issues.ts)。 */
function siteIdFromMaterialIssueId(materialIssueId: string): string {
  return materialIssueId.replace(/-mi-\w+$/, "");
}

export interface RunPipelineInput {
  /** 追加登録された拠点(架空企業site-042の固定データは company.ts が持つ)。 */
  userSites: UserSiteEntry[];
  /** 追記イベントを畳み込んだユーザー操作の現在値。 */
  interactions: InteractionState;
  /**
   * モンテカルロの乱数シード。runと一緒に保存され、後から同じ結果を再現するために使う。
   * 以前は Math.random をグローバルに差し替えていた(D-103)が、
   * packages/core が rng を引数で受け取れるようになったため廃止した。
   */
  rngSeed: number;
}

export function runDemoPipeline(input: RunPipelineInput = defaultRunPipelineInput()) {
  const idSequence = createIdSequence("ae");
  const rng = createSeededRng(input.rngSeed);
  const userSiteEntries = input.userSites;
  const interactions = input.interactions;
  const deepDiveParamsBySiteId = new Map(userSiteEntries.map((entry) => [entry.row.id, entry.deepDive]));

  // --- M2:優先度算定の結果によらない手動昇格/降格を合成する ---
  const manualOverrides = new Set(
    userSiteEntries.filter((entry) => entry.deepDive.forcePromote).map((entry) => `${entry.row.id}-mi-water`)
  );
  const manualDemotions = new Set<string>();
  for (const [materialIssueId, mode] of interactions.depthOverrides) {
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
          fitnessTierThresholdVersion: "fitness-tier-v1",
        };
      }
      const params = deepDiveParamsBySiteId.get(siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
      return buildUserDeepDiveConfig(siteId, params);
    },
    /**
     * M4 §7.4:代表値の選択。**利用者が実際に選んだときだけ**渡す。
     * 未選択のまま既定値(代替費用法)を使っている状態を「選択した」と記録しない
     * (選択には理由が必須であり、理由をシステムが捏造しないため)。
     */
    representativeSelectionForMaterialIssue: (materialIssueId) => {
      const selection = interactions.representativeSelection.get(materialIssueId);
      if (!selection) return undefined;
      return {
        groupValueConcept: selection.valueConcept,
        selectedMethodId: selection.methodId,
        reason: selection.reason,
        priorYearMethodId: PRIOR_YEAR_METHOD_BY_MATERIAL_ISSUE[materialIssueId],
      };
    },
    decompositionVersions: DECOMPOSITION_VERSIONS,
    idSequence,
    now: NOW,
    rng,
  });

  const allValuationRecords = Object.values(valuation.valuationRecordsByMaterialIssue).flat();

  // --- M4:代表値選択(未選択時はreplacement-costをデフォルト代表値とする) ---
  const representativeRecordByMaterialIssue: Record<string, string> = {};
  const m4ChangeLogByMaterialIssue: Record<string, { from: string; to: string; reason: string }> = {};
  for (const materialIssueId of Object.keys(valuation.valuationRecordsByMaterialIssue)) {
    const records = valuation.valuationRecordsByMaterialIssue[materialIssueId];
    const defaultRecord = records.find((r) => r.methodId === "replacement-cost") ?? records[0];
    const overrideId = interactions.representativeRecordId.get(materialIssueId);
    const overrideRecord = overrideId ? records.find((r) => r.id === overrideId) : undefined;
    const representative = overrideRecord ?? defaultRecord;
    if (representative) representativeRecordByMaterialIssue[materialIssueId] = representative.id;
    const changeLog = interactions.m4ChangeLog.get(materialIssueId);
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

    /**
     * M6 D-4・D-10:通常NPVと承認閾値は企業提供。画面から入力されていればそれを使う。
     * **承認閾値が未入力なら "pending" を渡す。**業界標準値で仮置きしない(D-10のC案却下理由)。
     * 未入力でも自然調整後NPVのレンジ・自然関連コストは通常どおり算出される(段階的開示)。
     */
    const enteredParameters = interactions.decisionParameters.get(siteId);
    const baselineNpv: BaselineNpvInput = enteredParameters
      ? {
          value: enteredParameters.baselineNpvValue,
          discountRate: enteredParameters.discountRate,
          horizon: enteredParameters.horizon,
          source: "manual_entry",
        }
      : isFlagshipSite
        ? BASELINE_NPV
        : buildUserBaselineNpv(deepDiveParams);

    const approvalThreshold: ApprovalThreshold | "pending" = enteredParameters
      ? enteredParameters.approvalThresholdValue === null
        ? "pending"
        : { value: exchangeAmount(enteredParameters.approvalThresholdValue), source: "manual_entry" }
      : {
          value: exchangeAmount(
            isFlagshipSite ? BASELINE_NPV.value + 25_000_000 : deepDiveParams.approvalThresholdValue
          ),
          source: "manual_entry",
        };

    // --- M5:財務接続(パイプライン層経由。以前はデモ層が各関数を直接呼んでいた、GAP-10)---
    // 画面から入力された財務データがあればそれを使う(M5 D-1:企業提供・PRISMは検証しない)。
    const entered = interactions.companyFinancials;
    const companyFinancials = entered
      ? {
          reportedOperatingProfit: exchangeAmount(entered.reportedOperatingProfit),
          currentlyInternalizedCost: exchangeAmount(entered.currentlyInternalizedCost),
          existingImpairmentThreshold: exchangeAmount(entered.existingImpairmentThreshold),
          creditMetrics: {
            netDebt: entered.netDebt,
            ebitda: entered.ebitda,
            interestExpense: entered.interestExpense,
          },
        }
      : isFlagshipSite
        ? FLAGSHIP_FINANCIALS
        : buildUserFinancials(deepDiveParams);
    const financialBridgeResult = runFinancialBridgePipeline({
      exchangeRecord: representative,
      ...(lime3 ? { welfareRecord: lime3 } : {}),
      // 以前は通常NPVを報告営業利益として渡していた(別概念の値の代入)。企業提供の
      // 報告営業利益を使う。実データの入口はT-15(財務パラメータ入力UI)で作る。
      reportedOperatingProfit: companyFinancials.reportedOperatingProfit,
      currentlyInternalizedCost: companyFinancials.currentlyInternalizedCost,
      existingImpairmentThreshold: companyFinancials.existingImpairmentThreshold,
      financials: companyFinancials.creditMetrics,
      // 3シナリオ均等割り(M5 D-4.3の中立的な初期値。PRISMは特定シナリオを推奨しない)
      internalizationProbabilities: [
        { scenario: "ngfs_net_zero_2050", probability: 1 / 3, period: 5 },
        { scenario: "ngfs_current_policies", probability: 1 / 3, period: 5 },
        { scenario: "gx_ets_official", probability: 1 / 3, period: 5 },
      ],
      discountRate: baselineNpv.discountRate,
      socialCostInternalizationRate: 0.15,
    });

    const financialBridge = {
      bridge1: financialBridgeResult.bridge1,
      bridge2: financialBridgeResult.bridge2,
      internalizationStatus: financialBridgeResult.internalizationStatus,
      natureDebt: financialBridgeResult.natureDebt,
    };
    const comparisonTargets = financialBridgeResult.comparisonTargets;

    // --- M6:対策案4種を並行して計算し、比較テーブル/散布図に使う ---
    const candidates: CountermeasureCandidate[] = isFlagshipSite
      ? buildCountermeasureCandidates(representative.id)
      : buildUserCountermeasureCandidates(siteId, representative.id, deepDiveParams);

    const bindingState = interactions.bindingMechanismState.get(siteId);
    const bindingMechanism: BindingMechanism = bindingState?.mechanism ?? { kind: "weak_reference" };
    const bindingHistory = bindingState?.history ?? [];
    const latestBindingChange = bindingHistory[bindingHistory.length - 1];

    const countermeasureCandidates = candidates.map((candidate) => {
      const previewDecision = runDecisionPipeline({
        id: `dr-${siteId}-${candidate.key}-preview`,
        decisionTarget: "investment_approval",
        decisionMaker: DECISION_MAKER,
        decisionDate: "2027-02-14",
        approvalThreshold,
        relatedValuationRecords: [representative],
        baselineNpv,
        countermeasures: [candidate.countermeasure],
        valuationRecordsById: { [representative.id]: representative },
        bindingMechanism,
        versions: DECISION_VERSIONS,
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

    const selectedKey = interactions.selectedCountermeasureKey.get(siteId) ?? candidates[0].key;
    const selectedCandidate = candidates.find((c) => c.key === selectedKey) ?? candidates[0];

    const decision = runDecisionPipeline({
      id: isFlagshipSite ? "dr-site042-2027" : `dr-${siteId}-2027`,
      decisionTarget: "investment_approval",
      decisionMaker: DECISION_MAKER,
      decisionDate: "2027-02-14",
      approvalThreshold,
      relatedValuationRecords: [representative],
      baselineNpv,
      countermeasures: [selectedCandidate.countermeasure],
      valuationRecordsById: { [representative.id]: representative },
      bindingMechanism,
      versions: DECISION_VERSIONS,
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
    const overrideText = interactions.disclosureClaimOverrideText.get(claim.id);
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
  for (const [claimId, stored] of interactions.intentionalDecisions) {
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
    actionLog: interactions.actionLog,
  };
}

/**
 * 入力を渡さずに呼ばれた場合の既定値(架空企業1社分のみ・操作なし・固定シード)。
 * GATE検証テストのように「追加拠点も操作もない状態」を対象とする呼び出し元のために残す。
 */
function defaultRunPipelineInput(): RunPipelineInput {
  return { userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED };
}

/** 既定のシード。runごとに変える必要はない(同じ入力からは同じ結果が出ることを優先する)。 */
export const DEFAULT_RNG_SEED = 42;

/**
 * 保存済みrunの`result`(jsonb)の構造の版。
 *
 * ページは再計算せず保存済みrunを読む(計画B-2)。そのため**結果の構造を変える
 * コード変更をすると、古い形のまま保存されたrunを新しいコードが読んで壊れる。**
 * この版を上げると、読み出し時に自動で再実行される(lib/pipeline/execute-run.ts)。
 *
 * **結果オブジェクトの形を変えたら必ず上げること。**値の計算方法だけを変えた場合は
 * 上げなくても壊れないが、過去のrunと比較したいなら上げる方が安全。
 */
export const RESULT_SCHEMA_VERSION = 2;

export type DemoPipelineResult = ReturnType<typeof runDemoPipeline>;
