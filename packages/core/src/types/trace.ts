/**
 * M4完成:再生可能な計算トレース(MethodEvaluationTrace)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.3・§6.2・T-05
 *
 * トレースは「最終値と一部メタデータ」ではなく、**再実行できる小さな計算プログラム**として持つ。
 * 各ステップは構造化された演算(積・和・MAX・べき・割引和)と、リテラルまたは前ステップ参照の
 * オペランドを持ち、汎用評価器(divergence/counterfactual.ts)が順に実行して最終値を再生する。
 * 反実仮想 v(S) は、比較レシピがステップのリテラルを差し替えたトレースを**同じ評価器で再実行**して
 * 得る(固定倍率の合成で代用しない、§6.2)。
 *
 * 全手法へ存在しない情報は optional の海にせず、`Availability` で判別可能な状態を持たせる(§5.3)。
 */

import type { LicenseMode } from "./common";
import type { CausalPathway, EvidenceRef, ZeroMeaning } from "./comparison";
import type { PhysicalQuantityInput } from "./valuation";

/** 情報の入手状態。`not_implemented_formula_published` は「式は公開済みだが未実装」を not_published と区別する(T-05.6)。 */
export type Availability =
  | { status: "available" }
  | { status: "not_applicable"; reason: string; evidence?: EvidenceRef[] }
  | { status: "not_published"; reason: string; evidence?: EvidenceRef[] }
  | { status: "not_licensed"; reason: string }
  | { status: "unmapped"; reason: string }
  | { status: "not_implemented_formula_published"; reason: string; evidence: EvidenceRef[] };

/** 比較前正規化(reconciliation)か、手法内部モデル(method_model)か(§5.5)。 */
export type TraceStepRole = "reconciliation" | "method_model";

export type TraceStepKind =
  | "input_snapshot"
  | "unit_conversion"
  | "currency_conversion"
  | "price_year_adjustment"
  | "coefficient_lookup"
  | "coefficient_application"
  | "endpoint_allocation"
  | "geographic_perspective"
  | "geographic_calibration"
  | "time_model"
  | "aggregation"
  | "site_correction";

/** リテラル値(出典付き)または前ステップの出力参照。 */
export type TraceOperand =
  | {
      kind: "literal";
      value: number;
      unit: string;
      currency?: "JPY" | "USD" | "EUR" | null;
      priceYear?: number | null;
      evidence: EvidenceRef[];
      /** 差し替え可能な設定を識別するキー(例 "ppp", "perspective_column")。反実仮想はこのキーで差し替える。 */
      settingKey?: string;
      /** 0 の場合、その意味(§5.6)。アダプターが付与する。 */
      zeroMeaning?: ZeroMeaning;
    }
  | { kind: "series"; values: number[]; unit: string; evidence: EvidenceRef[]; settingKey?: string }
  | { kind: "ref"; stepId: string };

/**
 * 構造化された演算。評価器はこれ以外の式を解釈しない(LLM・自由文の式を計算に使わない、§2-6)。
 * オペランド名は `inputs` のキーを指す。
 */
export type TraceOperation =
  | { op: "identity"; operand: string }
  | { op: "product"; operands: string[] }
  | { op: "sum"; operands: string[] }
  | { op: "max"; operands: string[] }
  | { op: "ratio"; numerator: string; denominator: string }
  | { op: "power"; base: string; exponent: string }
  /** Σ_t series[t] / (1+rate)^t 。損害の時間列が公開されている場合のみ使える。 */
  | { op: "discounted_sum"; series: string; rate: string };

export interface TraceValue {
  value: number;
  unit: string;
  currency?: "JPY" | "USD" | "EUR" | null;
  priceYear?: number | null;
}

export interface TraceStep {
  /** ステップID(トレース内で一意。例 "lime3.coefficient_application")。 */
  id: string;
  order: number;
  role: TraceStepRole;
  kind: TraceStepKind;
  label: string;
  /** 表示用の式(決定論的テンプレート)。計算には `operation` を使う。 */
  formula: string;
  operation: TraceOperation;
  inputs: Record<string, TraceOperand>;
  output: TraceValue;
  evidence: EvidenceRef[];
  /** false の場合、適用をスキップした事実と理由を残す(例 skipGeographicCalibration)。出力は入力をそのまま通す。 */
  applied: boolean;
  skipReason?: string;
  inputHash: string;
  outputHash: string;
}

/**
 * ハッシュ・順序・出力を持たない、プラグインが返すステップ草稿。
 * `trace/evaluate-trace.ts` の `materializeSteps` が順に評価して `TraceStep` に確定させる。
 * `applied: false` のステップは `operation` を `{ op: "identity", operand }` にし、素通しする入力を指す。
 */
export type TraceStepDraft = Omit<TraceStep, "order" | "inputHash" | "outputHash" | "output"> & {
  outputUnit: string;
  outputCurrency?: "JPY" | "USD" | "EUR" | null;
  outputPriceYear?: number | null;
  /** プラグインが期待値を持つ場合、評価器の算出値と許容誤差内で一致することを検証する。 */
  expectedOutput?: TraceValue;
};

export interface MethodEvaluationTrace {
  traceVersion: "1";
  /** 親手法ID(例 "ifvi-water-consumption")。 */
  methodId: string;
  /** 内訳ID(例 "VFes")。単一内訳の手法は methodId と同じ。 */
  subFactorId: string;
  /** ValuationRecord.methodId と同じ `{親手法ID}.{内訳ID}` 形式。 */
  recordMethodId: string;
  methodVersion: string;
  /** 係数セットの版(例 "aist-idea-v4.0-lime3-2026-05-15")。 */
  coefficientSetVersion: string;
  physicalQuantityId: string;
  inputSnapshot: PhysicalQuantityInput;
  /** 手法が入力をどう解釈したか(取水量に消費水係数を当てた等)。同一視しない(§4-1)。 */
  flowInterpretation: {
    inputProvides: string;
    methodAssumes: string;
    status: "match" | "assumed_equivalent" | "mismatch";
    evidence: EvidenceRef[];
  };
  steps: TraceStep[];
  /** 最終値(通常 JPY・較正後)。ValuationRecord.centralValue と許容誤差内で一致すること(T-05)。 */
  finalValue: TraceValue;
  endpointBreakdown: Availability;
  damageTimeProfile: Availability;
  siteCorrection: Availability;
  pathway: CausalPathway;
  underlyingModel: {
    /** 疫学/生態モデル・損害関数・基礎データの説明(決定論的テンプレート)。 */
    description: string;
    dataGeneration: string | "unmapped";
    evidence: EvidenceRef[];
  };
  /** 最終値が 0 の場合の意味(§5.6)。非ゼロなら undefined。 */
  zeroMeaning?: ZeroMeaning;
  license: { mode: LicenseMode; validUntil?: string; productionDisplayAllowed: boolean };
  /** steps・inputSnapshot・係数版・出典ハッシュを含むトレース全体のハッシュ。 */
  hash: string;
  /**
   * 完成実装 T-05:手法アダプターが `modelSteps` を提供したか(`"full"`)、
   * コアエンジン(`monetization/trace/build-trace.ts`)が較正前 centralValue を
   * 1ステップとして扱う汎用フォールバックで補ったか(`"generic_fallback"`)。
   * 既存トレース(このフィールドを持たずに構築されたもの、例:`packages/core/src/trace/*`の
   * 単体テスト用フィクスチャ)との後方互換のため optional にする。
   */
  adapterCoverage?: "full" | "generic_fallback";
}
