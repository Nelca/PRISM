/**
 * M4完成:比較レシピ(MethodComparisonRecipe)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.4・§6.2・§9.5・T-06
 *
 * 手法ペア×カテゴリごとに、比較可能範囲・正規化手順・反実仮想の差し替え式・完全/部分分解の区分・
 * 評価回数の予算・レビュー状態を宣言する。汎用エンジンはレシピが無いペアを自動推定で比較しない(§5.4)。
 * レシピはコードプラグイン(型安全な差し替え式)として `divergence/recipes/*.ts` に置く。
 */

import type { ImpactCategory, ValueConcept } from "./common";
import type { EvidenceRef, ReviewRecord } from "./comparison";
import type { MethodEvaluationTrace } from "./trace";

/** §5.5 の原因分類。数値化できるのは 3〜7 のうちレシピが反実仮想を定義できたものだけ。 */
export type FactorCategory =
  | "normalization" // 1. 比較前正規化(reconciliation)。方法論寄与に含めない
  | "value_concept" // 2. 異なる問い。数値分解せず停止理由
  | "coverage_pathway" // 3. 被覆・因果経路
  | "time_model" // 4. 時間モデル
  | "geographic_model" // 5. 地理モデル
  | "valuation_technique" // 6. 価値評価技法
  | "underlying_model_data" // 7. 基礎モデル・データ
  | "unclassified"; // 8. 未分類残差

/** 数値化可能な要因の差し替えで、何をどの値からどの値へ変えたか。 */
export interface SwappedSetting {
  stepId: string;
  settingKey: string;
  from: { value: number | number[]; label: string; evidence: EvidenceRef[] };
  to: { value: number | number[]; label: string; evidence: EvidenceRef[] };
}

/** 取得すれば再計算できるようになるデータと、そのGATE。 */
export interface DataAcquisitionAction {
  item: string;
  candidateSource: string;
  /** 取得後にその要因の反実仮想が定義できるようになるか。 */
  enablesRecalculation: boolean;
  gate?: "H-01" | "H-02" | "H-03" | "H-05";
}

/** 数値化不能だが一次資料で分かる差異(§6.4)。残差の金額をここへ割り当てない。 */
export interface KnownDifference {
  category: FactorCategory;
  description: string;
  sideA: string;
  sideB: string;
  evidence: EvidenceRef[];
  acquisitionAction?: DataAcquisitionAction;
}

export type SwapResult =
  | { ok: true; trace: MethodEvaluationTrace; swapped: SwappedSetting[] }
  | { ok: false; reason: string; missingData: DataAcquisitionAction[] };

/**
 * 反実仮想で差し替える1要因。`swap(base, target)` は「base(手法B)のトレースに、target(手法A)の
 * この要因の設定だけを差し替えたトレース」を返す。式を定義できない場合は理由を返し、倍率を仮置きしない(§4-5)。
 */
export interface CounterfactualFactor {
  id: string;
  category: Exclude<FactorCategory, "normalization" | "value_concept" | "unclassified">;
  label: string;
  swap: (base: MethodEvaluationTrace, target: MethodEvaluationTrace) => SwapResult;
  evidence: EvidenceRef[];
}

export interface NormalizationSpec {
  id: string;
  /** 例 "USD→JPY 通貨換算"、"価格年を共通年へ調整"。 */
  label: string;
  /** どのトレースステップ kind を reconciliation として扱うか。 */
  stepKinds: MethodEvaluationTrace["steps"][number]["kind"][];
  evidence: EvidenceRef[];
}

export interface RecipeSupportCheck {
  ok: boolean;
  reason?: "recipe_version_unsupported" | "trace_insufficient" | "license_blocked";
  detail?: string;
}

export interface MethodComparisonRecipe {
  id: string;
  version: string;
  category: ImpactCategory;
  /** 対象手法(親手法ID)と内訳・版の範囲。`subFactorId` 省略時は全内訳。 */
  methodA: { methodId: string; subFactorId?: string; versionRange: string };
  methodB: { methodId: string; subFactorId?: string; versionRange: string };
  /** 手法間比較か、同一手法の内部変種(LIME3の世界平均/日本等)か。後者は状態Bの件数に算入しない(§7.2.1)。 */
  analysisUnit: "cross_method" | "intra_method_variant";
  countsTowardRealDataEvidence: boolean;
  review: ReviewRecord;
  evidence: EvidenceRef[];
  comparableScope: {
    valueConcept: ValueConcept;
    /** 同一対象判定で一致が必要な属性(§5.1)。 */
    requiredSubjectAttributes: string[];
    pathwayNote: string;
  };
  supports: (traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace) => RecipeSupportCheck;
  normalization: NormalizationSpec[];
  factors: CounterfactualFactor[];
  /** 完全分解を宣言した場合、V* = V_A を許容誤差で検証し不一致なら停止する(§6.2)。 */
  decompositionKind: "full" | "partial";
  /** v(∅) = V_B。基準側は常に B。 */
  baseline: "B";
  /** v_reverse(S) = v_forward(F∖S) が成立するレシピのみ true(§6.2 A/B反転の保証条件)。 */
  reverseCompatible: boolean;
  /** 固定して残すモデル差(部分分解)。 */
  fixedDifferences: KnownDifference[];
  /** §6.3-3:全値が正でも倍率比較に適さず、共通の金額差が意味を持つ場合に加法を使う理由。 */
  modePolicy: { preferAdditive?: { reason: string } };
  /** 評価回数の予算(§6.2)。超過時は要因を減らして部分分解にするか停止する。 */
  budget: { maxFactors: number; maxEvaluations: number };
  /** テスト専用レシピ。本番レジストリでは有効化しない(§3.1)。 */
  testOnly?: true;
  /** id・version・factor id・evidence hash から算出。レジストリが埋める。 */
  hash: string;
}
