/**
 * M8 D-1:AssumptionEntryの組み立て。
 * 参照元: docs/requirements/m8-ledger-versioning.md §1
 *
 * 「後から手で入力する」設計にしない(build-plan §5.8)。ここで実装するのは、各モジュールが
 * 既に計算し終えた事実(型)から`AssumptionEntryPayload`を機械的に転記する関数群であり、
 * 新しい判断は一切加えない。実際にM1〜M7のソースからこれらを呼び出す配線は、M1〜M7を
 * 連結するアプリケーション層が実装される段階で行う(plan file 論点1)。
 */

import type { AssumptionEntry, AssumptionEntryPayload, AssumptionSourceModule } from "../types/ledger";
import type { DepthDecision } from "../types/assessment";
import type { GeographicCalibrationRecord, TransferFitness, ValuationRecord } from "../types/valuation";
import type { ValuationRecordGroup } from "../monetization/build-valuation-records";
import type { PairwiseDecomposition, PairwiseDecompositionV2, RepresentativeValueSelection } from "../types/divergence";
import type { BindingMechanismChangeEntry } from "../types/decision";
import type { GapFinding, IntentionalDecisionRecord } from "../types/disclosure";
import type { SiteLocationResolution } from "../site/location";
import type { UnevaluatedCriterion } from "../types/site";

export function buildAssumptionEntry(
  id: string,
  createdAt: string,
  sourceModule: AssumptionSourceModule,
  relatedRecordId: string,
  payload: AssumptionEntryPayload
): AssumptionEntry {
  return { id, createdAt, sourceModule, relatedRecordId, payload };
}

// --- M1 ---

/** M1 D-3:座標解決で除外された場合の理由を転記する。除外がない場合はnullを返す。 */
export function deriveM1ExclusionPayload(
  resolution: SiteLocationResolution
): Extract<AssumptionEntryPayload, { module: "M1" }> | null {
  if (!resolution.excluded) {
    return null;
  }
  return { module: "M1", kind: "exclusion", reason: resolution.exclusionReason ?? "理由不明" };
}

/**
 * GAP-08/GAP-13:評価できなかった基準を1件ずつ台帳に転記する。
 * ライセンス保留(M8 D-4)・データソース不在(D-91)・Locate未実行(M1 D-3)を区別して残す。
 */
export function deriveM1UnevaluatedCriterionPayloads(
  unevaluated: UnevaluatedCriterion[]
): Extract<AssumptionEntryPayload, { module: "M1"; kind: "criterion_unevaluated" }>[] {
  return unevaluated.map((entry) => ({
    module: "M1",
    kind: "criterion_unevaluated",
    criterion: entry.criterion,
    reason: entry.reason,
    dataSources: entry.dataSources,
  }));
}

// --- M2 ---

export function deriveM2DepthDecisionPayload(
  decision: DepthDecision
): Extract<AssumptionEntryPayload, { module: "M2" }> {
  return {
    module: "M2",
    kind: "depth_decision",
    promotedManually: decision.promotedManually,
    exclusionReason: decision.exclusionReason,
  };
}

// --- M3 ---

export function deriveM3CoefficientCalibrationPayload(
  calibration: GeographicCalibrationRecord,
  setVersion: string
): Extract<AssumptionEntryPayload, { module: "M3"; kind: "coefficient_calibration" }> {
  return {
    module: "M3",
    kind: "coefficient_calibration",
    setVersion,
    pppSource: calibration.pppSource,
    incomeElasticity: calibration.incomeElasticity,
  };
}

export function deriveM3ReconciliationCheckPayload(
  group: ValuationRecordGroup,
  aggregationFunctionVersion: string
): Extract<AssumptionEntryPayload, { module: "M3"; kind: "reconciliation_check" }> | null {
  if (group.reconciledAggregate === undefined) {
    return null; // 単一内訳の手法にはreconciliation自体が存在しない
  }
  return {
    module: "M3",
    kind: "reconciliation_check",
    aggregationFunctionVersion,
    goldenTestPassed: true, // buildValuationRecordsForPluginがReconciliationErrorを投げずに戻った時点で通過済み
  };
}

export function deriveM3FitnessTierPayload(
  tier: TransferFitness["tier"],
  compositeScore: number | null
): Extract<AssumptionEntryPayload, { module: "M3"; kind: "fitness_tier_assignment" }> {
  return { module: "M3", kind: "fitness_tier_assignment", tier, compositeScore };
}

/** 入力行→レビュー済み対応表→係数の解決を、M8へ機械的に転記する。 */
export function deriveM3InputMappingPayload(
  record: ValuationRecord
): Extract<AssumptionEntryPayload, { module: "M3"; kind: "input_mapping" }> | null {
  if (!record.mappingSnapshot || !record.factorSnapshot) return null;
  const sourceRecordHash =
    record.inputSnapshot && "sourceRecordHash" in record.inputSnapshot ? record.inputSnapshot.sourceRecordHash : null;
  return {
    module: "M3",
    kind: "input_mapping",
    physicalQuantityId: record.physicalQuantityId,
    sourceRecordHash,
    mappingId: record.mappingSnapshot.mappingId,
    mappingVersion: record.mappingSnapshot.mappingVersion,
    mappingHash: record.mappingSnapshot.mappingHash,
    factorId: record.factorSnapshot.factorId,
    factorSourceHash: record.factorSnapshot.sourceHash,
    currencyConversion: record.currencyConversion ?? null,
  };
}

/** 企業提供の交換価値入力を、費用・既計上額・便益を分離したまま台帳へ転記する。 */
export function deriveM3CorporateFinancialEffectPayload(
  record: ValuationRecord
): Extract<AssumptionEntryPayload, { module: "M3"; kind: "corporate_financial_effect" }> | null {
  const effect = record.financialEffectSnapshot;
  if (!effect) return null;
  return {
    module: "M3",
    kind: "corporate_financial_effect",
    financialEffectId: effect.id,
    grossCost: effect.grossCost,
    alreadyInternalizedCost: effect.alreadyInternalizedCost,
    verifiedIncrementalBenefit: effect.verifiedIncrementalBenefit,
    amountBasis: effect.amountBasis,
    doubleCountKey: effect.doubleCountKey,
    sourceHash: effect.sourceHash,
    dataVersion: effect.dataVersion,
  };
}

// --- M4 ---

/**
 * M4の台帳payloadへ記録する版。完成実装(T-13/T-14)で、比較レシピレジストリ・許容誤差・
 * 同一対象判定規則・因果経路対応表の版を追加した。`DivergenceDecompositionVersionsV2`
 * (divergence/pairwise-decomposition-v2.ts)と同じ形であり、そのまま相互に渡せる。
 */
export interface M4DecompositionVersions {
  algorithmVersion: string;
  cicesMatchLevel: string;
  aopMappingVersion: string;
  f3ThresholdVersion: string;
  f8ThresholdVersion: string;
  recipeRegistryVersion: string;
  toleranceVersion: string;
  subjectRuleVersion: string;
  pathwayMappingVersion: string;
}

/**
 * 完成実装 T-13/T-14:新エンジン(`PairwiseDecompositionV2`)から台帳payloadを転記する。
 * 新しい判断は加えない。
 *
 * - `fallbackApplied` は「この結果を左右した分岐」を機械的に写す。停止ペアは停止理由コード、
 *   分解ペアは採用モードと完全/部分の区分。旧エンジンの F-1〜F-9 のような救済分岐は新経路に無い。
 * - `nonDecomposableFactors` は数値化できなかった既知差異のカテゴリ(§5.5 の分類)。
 *   金額を割り当てていないことは `StructuredResidual` 側に残る。
 */
export function deriveM4DecompositionPayload(
  pair: PairwiseDecompositionV2,
  versions: M4DecompositionVersions
): Extract<AssumptionEntryPayload, { module: "M4"; kind: "decomposition" }> {
  const nonDecomposableFactors = [
    ...new Set(
      (pair.status === "decomposed" ? pair.residual.knownUnquantified : pair.qualitativeDifferences).map(
        (difference) => difference.category
      )
    ),
  ];
  const fallbackApplied =
    pair.status === "stopped" ? [pair.reason] : [pair.mode, pair.kind];

  return {
    module: "M4",
    kind: "decomposition",
    algorithmVersion: versions.algorithmVersion,
    symmetryAxiomApplied: true,
    cicesMatchLevel: versions.cicesMatchLevel,
    aopMappingVersion: versions.aopMappingVersion,
    fallbackApplied,
    nonDecomposableFactors,
    f3ThresholdVersion: versions.f3ThresholdVersion,
    f8ThresholdVersion: versions.f8ThresholdVersion,
    recipeId: pair.recipe?.id,
    recipeVersion: pair.recipe?.version,
    recipeHash: pair.recipe?.hash,
    decompositionKind: pair.status === "decomposed" ? pair.kind : undefined,
    decompositionStatus: pair.status,
    stopReason: pair.status === "stopped" ? pair.reason : undefined,
    toleranceVersion: versions.toleranceVersion,
    subjectRuleVersion: versions.subjectRuleVersion,
    pathwayMappingVersion: versions.pathwayMappingVersion,
    evaluationCount: pair.status === "decomposed" ? pair.evaluationCount : undefined,
  };
}

/**
 * 旧エンジン(`PairwiseDecomposition`、resultSchemaVersion ≤ 10)の結果から台帳payloadを作る。
 * 保存済みrunの読み直し・移行検証にだけ使う。新runは `deriveM4DecompositionPayload` を使う。
 */
export function deriveM4LegacyDecompositionPayload(
  decomposition: PairwiseDecomposition,
  versions: Pick<M4DecompositionVersions, "algorithmVersion" | "cicesMatchLevel" | "aopMappingVersion" | "f3ThresholdVersion" | "f8ThresholdVersion">
): Extract<AssumptionEntryPayload, { module: "M4"; kind: "decomposition" }> {
  const nonDecomposableFactors = decomposition.contributions
    .filter((c) => c.status === "not_recalculable")
    .map((c) => c.factor);

  return {
    module: "M4",
    kind: "decomposition",
    algorithmVersion: versions.algorithmVersion,
    symmetryAxiomApplied: true,
    cicesMatchLevel: versions.cicesMatchLevel,
    aopMappingVersion: versions.aopMappingVersion,
    fallbackApplied: decomposition.fallbackApplied,
    nonDecomposableFactors,
    f3ThresholdVersion: versions.f3ThresholdVersion,
    f8ThresholdVersion: versions.f8ThresholdVersion,
  };
}

export function deriveM4RepresentativeValueSelectionPayload(
  selection: RepresentativeValueSelection
): Extract<AssumptionEntryPayload, { module: "M4"; kind: "representative_value_selection" }> {
  return {
    module: "M4",
    kind: "representative_value_selection",
    selectedMethodId: selection.selectedMethodId,
    reason: selection.reason,
  };
}

// --- M6 ---

export function deriveM6BindingMechanismChangePayload(
  entry: BindingMechanismChangeEntry
): Extract<AssumptionEntryPayload, { module: "M6" }> {
  return {
    module: "M6",
    kind: "binding_mechanism_change",
    previous: entry.previousMechanism.kind,
    next: entry.newMechanism.kind,
    reason: entry.reason,
  };
}

// --- M7 ---

export function deriveM7GapFindingPayload(finding: GapFinding): Extract<AssumptionEntryPayload, { module: "M7"; kind: "gap_finding" }> {
  return { module: "M7", kind: "gap_finding", gapType: finding.gapType ?? "none" };
}

export function deriveM7IntentionalDecisionPayload(
  record: IntentionalDecisionRecord
): Extract<AssumptionEntryPayload, { module: "M7"; kind: "intentional_decision" }> {
  return { module: "M7", kind: "intentional_decision", reason: record.reason };
}
