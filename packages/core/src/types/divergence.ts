/**
 * M4:乖離分解。
 * 参照元: docs/requirements/m4-divergence-decomposition.md、
 *         docs/roadmap/divergence-decomposition-completion-directive.md §5.5・§6.2〜§6.5
 *
 * 2026-09-06(完成実装):結果型を判別可能unionへ拡張した。
 *   - `PairwiseDecompositionV2 = DecomposedPair | StoppedPair`
 *   - 完全/部分分解、基準側、全 v(S)、構造化残差、停止理由コード、比較レシピ版を持つ
 *   - 旧型(`PairwiseDecomposition` 等)は保存済みrunの読出し用に `Legacy*` として残す。
 *     新runは `DivergenceDecompositionV2`(`schemaVersion: 2`)を書く
 *
 * 実装注記: M4要件定義書の付録は `MethodMetadata` / `EndpointCoverage` を
 * ValuationRecordとは別の入れ子型として定義していたが、実装では
 * ValuationRecord(valuation.ts)にそれらのフィールドを直接持たせている。
 * 完成実装では、反実仮想に必要な計算過程を `ValuationRecord.trace`(trace.ts)が持つ。
 */

import type { ExchangeAmount, ValueConcept, WelfareAmount } from "./common";
import type { ComparisonSubject, EvidenceRef, ReviewStatus, SubjectIdentityResult, ZeroMeaning } from "./comparison";
import type { DataAcquisitionAction, FactorCategory, KnownDifference, SwappedSetting } from "./recipe";

// ===========================================================================
// 旧型(2026-08 実装)。保存済みrun(resultSchemaVersion ≤ 10)の読出しにのみ使う。
// ===========================================================================

export type DecompositionFactor = "endpointCoverage" | "discountRate" | "geographicCalibration";

export type DecompositionMode =
  | "multiplicative" // 通常
  | "additive" // F-1
  | "not_decomposed"; // F-2 / F-3 / F-8 / 価値概念グループ間

export interface FactorContribution {
  factor: DecompositionFactor;
  /** c_i(Shapley寄与、対数空間)。 */
  logContribution: number;
  /** exp(c_i)。 */
  multiplier: number;
  /** F-9でnullになりうる(相殺時は割合表示を抑止する)。 */
  shareRatio: number | null;
  status: "decomposed" | "not_recalculable";
  /** status === "not_recalculable" の場合に理由を記録する。 */
  exclusionReason?: string;
}

/** @deprecated 旧エンジンの結果型。新runは `PairwiseDecompositionV2` を使う。 */
export interface PairwiseDecomposition {
  methodIdA: string;
  methodIdB: string;
  /** ValueConceptGroupの価値概念に合わせてExchangeAmount/WelfareAmountのどちらかになる(2026-08-02追記)。 */
  valueA: ExchangeAmount | WelfareAmount;
  valueB: ExchangeAmount | WelfareAmount;
  /** not_decomposed のとき null。 */
  ratio: number | null;
  mode: DecompositionMode;
  /** 例 ["F-4", "F-9"]。 */
  fallbackApplied: string[];
  contributions: FactorContribution[];
  residual: {
    logResidual: number;
    multiplier: number;
  } | null;
  /** 自動生成の読み下し文。テンプレート+機械的な数値埋め込みで構成する(M5 D-5と同じ原則)。 */
  narrative: string;
}

/** @deprecated 旧エンジンのグループ型。 */
export interface ValueConceptGroup {
  valueConcept: ValueConcept;
  methodIds: string[];
  /** 例 "SSBJ財務影響 / 投資判断"。 */
  usage: string;
  pairwiseDecompositions: PairwiseDecomposition[];
}

export interface RepresentativeValueSelection {
  groupValueConcept: ValueConcept;
  selectedMethodId: string;
  reason: string;
  priorYearMethodId?: string;
  recalculatedWithPriorMethod?: number;
}

/**
 * @deprecated 旧エンジンの結果。valuationRecordIds は分割前の総数に上限なし。
 * 各ValueConceptGroup内で 2 ≦ N ≦ 5(M4 §2.1、価値概念で分割した後のグループ単位で上限を適用する)。
 */
export interface DivergenceDecomposition {
  id: string;
  targetPhysicalQuantityId: string;
  siteId: string;
  valuationRecordIds: string[];
  groups: ValueConceptGroup[];
  crossGroupComparison: {
    /** 常にtrue。価値概念をまたぐグループ間は分解しない。 */
    incommensurable: true;
    metadataDifferences: string[];
  } | null;
  representativeValueSelection?: RepresentativeValueSelection;
  assumptionEntryIds: string[];
  recalculationHash: string;
}

// ===========================================================================
// 新型(完成実装)
// ===========================================================================

export type AnalysisUnit = "cross_method" | "intra_method_breakdown";

/** §6.1・§6.3 の停止理由。1つの `not_comparable` へ潰さない。 */
export type StopReasonCode =
  | "different_subject"
  | "value_concept_mismatch"
  | "sign_mismatch"
  | "counterfactual_sign_mismatch"
  | "non_finite"
  | "normalization_mismatch"
  | "recipe_missing"
  | "recipe_version_unsupported"
  | "recipe_not_registrable" // レビュー状態が evidence_verified / domain_approved でない(§9.5)
  | "trace_insufficient"
  | "no_numerizable_factors"
  | "budget_exceeded"
  | "full_decomposition_endpoint_mismatch"
  | "efficiency_violation"
  | "group_limit_exceeded"
  | "license_blocked";

/** §6.3 の判定順で得た診断値。F-3/F-8 の業務閾値は H-06 未承認のため適用せず、値だけ残す。 */
export interface PairDiagnostics {
  /** min(|V_A|,|V_B|) / max(|V_A|,|V_B|)。両方0なら null。 */
  magnitudeGapRatio: number | null;
  /** ln(V_A / V_B)。定義できない場合 null。 */
  lnRatio: number | null;
  /** V_A − V_B(正規化後、共通通貨)。 */
  absoluteDifference: number | null;
  f3ThresholdApplied: false;
  f8ThresholdApplied: false;
}

export interface SubsetEvaluation {
  /** 差し替えた要因ID(ソート済み)。空配列が v(∅) = V_B。 */
  subset: string[];
  /** 固定したまま残した要因ID(F ∖ S)。 */
  fixed: string[];
  value: number;
  traceHash: string;
  swapped: SwappedSetting[];
}

export interface NumericContribution {
  factorId: string;
  category: FactorCategory;
  label: string;
  /** 加法: φ_i(共通通貨)。乗法: c_i(対数)。 */
  shapley: number;
  /** 加法モードの表示額。乗法では null。 */
  displayAmount: number | null;
  /** 乗法モードの表示倍率 exp(c_i)。加法では null。 */
  displayMultiplier: number | null;
  /** 寄与割合。相殺・全体差ゼロ・許容誤差内の場合 null(§6.5)。 */
  shareRatio: number | null;
  /** 許容誤差内でゼロか(ゼロ寄与公理の検証対象)。 */
  isZero: boolean;
  swapped: SwappedSetting[];
  evidence: EvidenceRef[];
}

export interface StructuredResidual {
  mode: "additive" | "multiplicative";
  /** 加法: R = V_A − V*。乗法: r = ln V_A − ln V*。 */
  value: number;
  /** 乗法のみ exp(r)。 */
  displayMultiplier: number | null;
  /** 加法: R/(V_A−V_B)、乗法: r/(ln V_A − ln V_B)。§6.5 の条件で null。 */
  ratio: number | null;
  ratioUnavailableReason?: "total_difference_within_tolerance" | "mixed_signs";
  /** 既知だが数値化不能な差異。ここへ金額を割り当てない(§6.4)。 */
  knownUnquantified: KnownDifference[];
  /** 非ゼロ残差があり、根拠付きの候補理由も特定できない場合 true(§6.5 未分類残差)。 */
  unclassified: boolean;
  nextActions: DataAcquisitionAction[];
}

export type DecisionImplication =
  | { kind: "representative_choice"; summary: string }
  | { kind: "additional_investigation"; summary: string }
  | { kind: "not_comparable"; summary: string };

export type ReverseDecomposition =
  | { defined: true; contributions: NumericContribution[]; vStar: number; residual: StructuredResidual }
  | { defined: false; reason: string };

interface PairCommon {
  analysisUnit: "cross_method";
  methodIdA: string;
  methodIdB: string;
  parentMethodIdA: string;
  parentMethodIdB: string;
  subjectId: string;
  valueConcept: ValueConcept;
  /** 正規化後の値(共通通貨・価格年)。 */
  valueA: number;
  valueB: number;
  /** 正規化で適用したステップ(reconciliation)。方法論寄与に含めない。 */
  normalizationApplied: string[];
  zeroMeaningA?: ZeroMeaning;
  zeroMeaningB?: ZeroMeaning;
  qualitativeDifferences: KnownDifference[];
  diagnostics: PairDiagnostics;
  implication: DecisionImplication;
  /** 決定論的テンプレートで生成した読み下し文(結論→含意→寄与→定性差→残差→次アクション)。 */
  narrative: string;
}

export interface DecomposedPair extends PairCommon {
  status: "decomposed";
  mode: "additive" | "multiplicative";
  kind: "full" | "partial";
  baseline: "B";
  direction: "B_to_A";
  /** 到達値 V* = v(F)。完全分解では V_A と許容誤差内で一致する。 */
  vStar: number;
  /** 加法: V_A − V_B。乗法: ln V_A − ln V_B。 */
  totalDifference: number;
  /** 加法: Σφ_i = V* − V_B。乗法: Σc_i = ln V* − ln V_B。 */
  explainedSum: number;
  contributions: NumericContribution[];
  residual: StructuredResidual;
  subsets: SubsetEvaluation[];
  recipe: { id: string; version: string; hash: string; reviewStatus: ReviewStatus };
  tolerance: { version: string };
  reverse: ReverseDecomposition;
  evaluationCount: number;
}

export interface StoppedPair extends PairCommon {
  status: "stopped";
  reason: StopReasonCode;
  detail: string;
  missingData: DataAcquisitionAction[];
  nextActions: DataAcquisitionAction[];
  recipe?: { id: string; version: string; hash: string; reviewStatus: ReviewStatus };
  subjectIdentity?: SubjectIdentityResult;
}

export type PairwiseDecompositionV2 = DecomposedPair | StoppedPair;

/** 同一手法の内訳分析(§4-8)。手法間ペアとは別の分析単位で、加法Shapleyの対象ではない。 */
export interface IntraMethodBreakdownAnalysis {
  analysisUnit: "intra_method_breakdown";
  parentMethodId: string;
  subjectId: string;
  /** 例 "VFaccess + MAX(VFnutrition, VFdisease, VFes)"。 */
  aggregationFormula: string;
  components: {
    recordMethodId: string;
    subFactorId: string;
    valueConcept: ValueConcept;
    value: number;
    zeroMeaning?: ZeroMeaning;
    /** 集計式でこの内訳が採用されたか(MAXで選ばれた等)。 */
    selectedByAggregation: boolean;
  }[];
  /** 公式集計値(価値概念が混在する場合はその事実を明示し、グループ比較には使わない)。 */
  aggregate: { value: number; mixesValueConcepts: boolean; note: string } | null;
  narrative: string;
}

export interface ValueConceptGroupV2 {
  valueConcept: ValueConcept;
  /** 例 "SSBJ財務影響 / 投資判断"。 */
  usage: string;
  parentMethodIds: string[];
  recordMethodIds: string[];
  crossMethodPairs: PairwiseDecompositionV2[];
  breakdownAnalyses: IntraMethodBreakdownAnalysis[];
  /** 親手法数の上限(T-02-11)。超過ペアは例外ではなく `group_limit_exceeded` として残す。 */
  groupLimit: { maxParentMethods: number; exceeded: boolean; excludedPairs: { methodIdA: string; methodIdB: string }[] };
}

export interface DivergenceDecompositionV2 {
  schemaVersion: 2;
  id: string;
  targetPhysicalQuantityId: string;
  siteId: string;
  subject: ComparisonSubject;
  valuationRecordIds: string[];
  groups: ValueConceptGroupV2[];
  crossGroupComparison: {
    /** 常にtrue。価値概念をまたぐグループ間は分解しない。 */
    incommensurable: true;
    metadataDifferences: string[];
  } | null;
  representativeValueSelection?: RepresentativeValueSelection;
  assumptionEntryIds: string[];
  /** 結果を左右した版(レシピレジストリ・許容誤差・同一性規則・経路対応表・f3/f8)。 */
  versions: Record<string, string>;
  recalculationHash: string;
}

export type AnyDivergenceDecomposition = DivergenceDecomposition | DivergenceDecompositionV2;

export function isDivergenceDecompositionV2(value: AnyDivergenceDecomposition): value is DivergenceDecompositionV2 {
  return (value as DivergenceDecompositionV2).schemaVersion === 2;
}
