/**
 * M4完成 §6.1:比較可能性判定(6段階)。T-03.2 / T-08.4。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.1・§5.2・§5.6・§6.1
 *
 * 失敗理由を1つの `not_comparable` へ潰さず、理由コードと不足データを返す(§6.1)。
 * 判定順は固定する。
 *   1. 比較対象が同じか(`compareSubjects`)
 *   2. 価値概念が同じか
 *   3. 方向・費用/便益・符号の意味が同じか
 *   4. 正規化後の単位・通貨・価格年・期間が一致するか
 *   5. 比較レシピが存在し、対象手法版をサポートし、登録可能なレビュー状態か
 *   6. 各要因の反実仮想計算に必要なトレースが揃うか(ゼロ意味の出典を含む)
 *
 * ゼロ意味は手法アダプターが出典付きで確定する(§5.6)。このモジュールは値の大きさ・桁から
 * ゼロ意味を推論しない。0 なのに `trace.zeroMeaning` が無ければ不足データとして停止する。
 */

import type { CausalPathway, ComparisonSubject, PathwayCoverageComparison, SubjectIdentityResult } from "../types/comparison";
import type { DataAcquisitionAction, MethodComparisonRecipe } from "../types/recipe";
import type { StopReasonCode } from "../types/divergence";
import type { MethodEvaluationTrace } from "../types/trace";
import type { ValuationRecord } from "../types/valuation";
import { TOLERANCE_POLICY, toleranceScale, withinTolerance } from "./tolerance";

/** 同一対象判定に使った規則の版。`ComparisonSubject.identityRuleVersion` と照合する。 */
export const SUBJECT_IDENTITY_RULE_VERSION = "subject-identity-v1";

/** レシピを登録・実行してよいレビュー状態(§9.5)。 */
export const REGISTRABLE_REVIEW_STATUSES = ["evidence_verified", "domain_approved"] as const;

// ---------------------------------------------------------------------------
// 単位の単純換算(§5.5「kgとt、同じ観測期間の日付表記等は正規化できる」)
// ---------------------------------------------------------------------------

/**
 * 同じ次元内の線形換算だけを許す。観測量の異なる入力への拡縮、年間フローと現在価値の換算、
 * 異なる期間の年率化は**自動正規化しない**(§5.5)。ここに無い単位差は different_subject とする。
 */
const UNIT_DIMENSIONS: { dimension: string; factors: Record<string, number> }[] = [
  { dimension: "mass", factors: { g: 1e-3, kg: 1, t: 1e3, tonne: 1e3, ton: 1e3 } },
  { dimension: "volume", factors: { L: 1e-3, l: 1e-3, m3: 1, "m^3": 1, "m³": 1, km3: 1e9 } },
  { dimension: "area", factors: { m2: 1, "m^2": 1, "m²": 1, ha: 1e4, km2: 1e6 } },
];

export interface UnitConversion {
  /** from の値へ掛けると to の値になる係数。 */
  factor: number;
  dimension: string;
  label: string;
}

/** 単純換算できる場合だけ係数を返す。できない場合 null(推定で埋めない)。 */
export function convertUnit(from: string, to: string): UnitConversion | null {
  if (from === to) return { factor: 1, dimension: "identical", label: `単位一致(${from})` };
  for (const { dimension, factors } of UNIT_DIMENSIONS) {
    const fromFactor = factors[from];
    const toFactor = factors[to];
    if (fromFactor !== undefined && toFactor !== undefined) {
      return {
        factor: fromFactor / toFactor,
        dimension,
        label: `単位換算 ${from}→${to}(×${fromFactor / toFactor})`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. 比較対象の同一性(§5.1)
// ---------------------------------------------------------------------------

function compareFlow(a: ComparisonSubject["flow"], b: ComparisonSubject["flow"]): { reasons: string[]; assumptions: string[] } {
  const reasons: string[] = [];
  const assumptions: string[] = [];

  if (a.kind !== b.kind) {
    return { reasons: [`フロー種別が異なります(A: ${a.kind} / B: ${b.kind})。`], assumptions };
  }

  /** "unknown" 同士は同一と仮定し、その仮定を明示する。"unknown" と具体値は different_subject(§4-1)。 */
  const compareAttribute = (label: string, valueA: string, valueB: string) => {
    if (valueA === valueB) {
      if (valueA === "unknown") assumptions.push(`${label}が両側とも不明のため、同一と仮定しました(推定で埋めていません)。`);
      return;
    }
    if (valueA === "unknown" || valueB === "unknown") {
      reasons.push(`${label}が一方だけ不明です(A: ${valueA} / B: ${valueB})。不明側を具体値へ推定しません。`);
      return;
    }
    reasons.push(`${label}が異なります(A: ${valueA} / B: ${valueB})。`);
  };

  if (a.kind === "water" && b.kind === "water") {
    compareAttribute("水源種別", a.waterSource, b.waterSource);
    compareAttribute("水の使用形態", a.waterUse, b.waterUse);
  } else if (a.kind === "pollution" && b.kind === "pollution") {
    compareAttribute("物質コード", a.substanceCode, b.substanceCode);
    compareAttribute("排出媒体", a.releaseMedium, b.releaseMedium);
    compareAttribute("排出/移動の区分", a.releaseKind, b.releaseKind);
  } else if (a.kind === "waste" && b.kind === "waste") {
    compareAttribute("廃棄物種別", a.wasteTypeCode, b.wasteTypeCode);
    compareAttribute("処理経路", a.treatmentRoute, b.treatmentRoute);
    compareAttribute("処理場所", a.treatmentLocation, b.treatmentLocation);
    compareAttribute("重量基準", a.weightBasis, b.weightBasis);
    if (a.hazardous !== b.hazardous) reasons.push(`有害/非有害の区分が異なります(A: ${a.hazardous} / B: ${b.hazardous})。`);
  } else if (a.kind === "land_use" && b.kind === "land_use") {
    compareAttribute("土地利用の行為", a.activityKind, b.activityKind);
    compareAttribute("土地区分", a.landClass ?? "unknown", b.landClass ?? "unknown");
    compareAttribute("転換前の土地区分", a.landClassBefore ?? "unknown", b.landClassBefore ?? "unknown");
    compareAttribute("転換後の土地区分", a.landClassAfter ?? "unknown", b.landClassAfter ?? "unknown");
  } else if (a.kind === "climate" && b.kind === "climate") {
    compareAttribute("スコープ", a.scope ?? "unknown", b.scope ?? "unknown");
  }

  return { reasons, assumptions };
}

function periodLabel(period: ComparisonSubject["period"]): string {
  if (period.kind === "annual") return `年次 ${period.year ?? "不明"}`;
  if (period.kind === "reference_date") return `基準日 ${period.date}`;
  return "不明";
}

/**
 * §5.1:カテゴリ・フロー属性・単位・数量・地点/地域・期間・時間基準を照合する。
 * 単位は同一次元の単純換算(kg/t 等)だけ許し、換算後の数量一致を要求する。
 * 同一性判定に失敗したペアは `different_subject` とし、金額倍率を計算しない。
 */
export function compareSubjects(a: ComparisonSubject, b: ComparisonSubject): SubjectIdentityResult {
  const reasons: string[] = [];
  const assumptions: string[] = [];

  if (a.category !== b.category) {
    reasons.push(`カテゴリが異なります(A: ${a.category} / B: ${b.category})。`);
  }

  const flow = compareFlow(a.flow, b.flow);
  reasons.push(...flow.reasons);
  assumptions.push(...flow.assumptions);

  const conversion = convertUnit(a.quantity.unit, b.quantity.unit);
  if (conversion === null) {
    reasons.push(
      `数量の単位が異なり、単純換算の対象外です(A: ${a.quantity.unit} / B: ${b.quantity.unit})。観測量の異なる入力へ拡縮しません。`
    );
  } else {
    if (conversion.factor !== 1) assumptions.push(conversion.label);
    const convertedA = a.quantity.value * conversion.factor;
    const scale = toleranceScale([convertedA, b.quantity.value]);
    if (!withinTolerance(convertedA, b.quantity.value, scale, TOLERANCE_POLICY.money)) {
      reasons.push(
        `数量が一致しません(A: ${a.quantity.value} ${a.quantity.unit} → ${convertedA} ${b.quantity.unit} / B: ${b.quantity.value} ${b.quantity.unit})。`
      );
    }
  }

  if (a.quantity.measurementBoundary !== b.quantity.measurementBoundary) {
    reasons.push(`測定境界が異なります(A: ${a.quantity.measurementBoundary} / B: ${b.quantity.measurementBoundary})。`);
  }
  if (a.location.siteId !== b.location.siteId) {
    reasons.push(`拠点が異なります(A: ${a.location.siteId} / B: ${b.location.siteId})。`);
  }
  if (a.location.region !== b.location.region) {
    reasons.push(`対象地域が異なります(A: ${a.location.region} / B: ${b.location.region})。`);
  }

  if (a.period.kind !== b.period.kind) {
    reasons.push(`期間の指定方法が異なります(A: ${periodLabel(a.period)} / B: ${periodLabel(b.period)})。`);
  } else if (a.period.kind === "unknown" && b.period.kind === "unknown") {
    assumptions.push("期間が両側とも不明のため、同一期間と仮定しました(異なる期間の年率化はしていません)。");
  } else if (periodLabel(a.period) !== periodLabel(b.period)) {
    reasons.push(`期間が異なります(A: ${periodLabel(a.period)} / B: ${periodLabel(b.period)})。`);
  }

  if (a.timeBasis !== b.timeBasis) {
    reasons.push(`時間基準が異なります(A: ${a.timeBasis} / B: ${b.timeBasis})。年間フローと現在価値を自動換算しません。`);
  }

  if (reasons.length > 0) return { kind: "different_subject", reasons };
  return { kind: "same", assumptions };
}

// ---------------------------------------------------------------------------
// 被覆経路の比較(§5.2・§4-3)
// ---------------------------------------------------------------------------

/**
 * AoP一致だけで被覆一致と判定しない。pressure / midpoint / damagePathway / metric /
 * valuationTechnique まで比較する。どちらかが "unmapped" の階層があれば `unmapped` を返す。
 * これは停止条件ではなく、レシピが `fixedDifferences` や定性差異へ使うための材料である。
 */
export function comparePathways(a: CausalPathway, b: CausalPathway): PathwayCoverageComparison {
  const layers: { label: string; valueA: string; valueB: string }[] = [
    { label: "圧力/素過程フロー", valueA: a.pressure, valueB: b.pressure },
    { label: "中間影響", valueA: a.midpoint, valueB: b.midpoint },
    { label: "損害経路", valueA: a.damagePathway, valueB: b.damagePathway },
    { label: "AoP", valueA: a.aopCode, valueB: b.aopCode },
    { label: "測定指標", valueA: a.metric ?? "none", valueB: b.metric ?? "none" },
    { label: "価値評価技法", valueA: a.valuationTechnique, valueB: b.valuationTechnique },
  ];

  const unmappedA = layers.filter((layer) => layer.valueA === "unmapped").map((layer) => layer.label);
  const unmappedB = layers.filter((layer) => layer.valueB === "unmapped").map((layer) => layer.label);
  if (unmappedA.length > 0 || unmappedB.length > 0) {
    const unmappedSide = unmappedA.length > 0 && unmappedB.length > 0 ? "both" : unmappedA.length > 0 ? "A" : "B";
    const detail = [
      unmappedA.length > 0 ? `A: ${unmappedA.join("、")}` : "",
      unmappedB.length > 0 ? `B: ${unmappedB.join("、")}` : "",
    ]
      .filter((part) => part.length > 0)
      .join(" / ");
    return { kind: "unmapped", unmappedSide, reason: `特定できない階層があります(${detail})。推定で埋めません。` };
  }

  const differences = layers
    .filter((layer) => layer.valueA !== layer.valueB)
    .map((layer) => `${layer.label}: A ${layer.valueA} / B ${layer.valueB}`);

  if (differences.length > 0) return { kind: "different_pathway", differences };
  return { kind: "same_pathway" };
}

// ---------------------------------------------------------------------------
// 版レンジ(§5.4 「対象手法と版の範囲」)
// ---------------------------------------------------------------------------

/**
 * 版レンジの照合。決定論的で読みやすい最小構文だけを解釈する。
 *   "*"          … すべての版
 *   "1.2.0"      … 完全一致
 *   "1.*" / "1"  … 先頭一致(ドット区切りの接頭辞)
 *   "1.0|2.0"    … いずれかに一致
 * 範囲不等式(>=、<)は解釈しない。曖昧な照合で版不一致を見逃さないため。
 */
export function versionInRange(version: string, range: string): boolean {
  return range
    .split("|")
    .map((part) => part.trim())
    .some((part) => {
      if (part === "*" || part === "") return part === "*";
      if (part === version) return true;
      if (part.endsWith(".*")) {
        const prefix = part.slice(0, -2);
        return version === prefix || version.startsWith(`${prefix}.`);
      }
      return false;
    });
}

/** レシピの片側(methodA / methodB)が、その手法IDと版に一致するか。 */
export function recipeSideMatches(
  side: MethodComparisonRecipe["methodA"],
  target: { methodId: string; subFactorId: string; methodVersion: string }
): boolean {
  if (side.methodId !== target.methodId) return false;
  if (side.subFactorId !== undefined && side.subFactorId !== target.subFactorId) return false;
  return versionInRange(target.methodVersion, side.versionRange);
}

// ---------------------------------------------------------------------------
// 6段階の比較可能性判定
// ---------------------------------------------------------------------------

export interface ComparabilityInput {
  recordA: ValuationRecord;
  recordB: ValuationRecord;
  traceA?: MethodEvaluationTrace;
  traceB?: MethodEvaluationTrace;
  subjectA: ComparisonSubject;
  subjectB: ComparisonSubject;
  /** レジストリが見つけたレシピ。見つからない場合は undefined。 */
  recipe?: MethodComparisonRecipe;
  /** テスト専用レシピを実行してよいか(レジストリの設定と同じ値を渡す)。 */
  allowTestOnly?: boolean;
}

export type ComparabilityResult =
  | { ok: true; normalizationApplied: string[]; assumptions: string[]; subjectIdentity: SubjectIdentityResult }
  | {
      ok: false;
      reason: StopReasonCode;
      detail: string;
      missingData: DataAcquisitionAction[];
      subjectIdentity: SubjectIdentityResult;
    };

/** `{親手法ID}.{内訳ID}` 形式から親手法IDを取り出す。 */
export function parentMethodIdOf(methodId: string): string {
  const dot = methodId.indexOf(".");
  return dot === -1 ? methodId : methodId.slice(0, dot);
}

function subFactorIdOf(record: ValuationRecord, trace?: MethodEvaluationTrace): string {
  if (trace) return trace.subFactorId;
  const dot = record.methodId.indexOf(".");
  return dot === -1 ? record.methodId : record.methodId.slice(dot + 1);
}

function reconciliationLabels(trace: MethodEvaluationTrace | undefined, side: "A" | "B"): string[] {
  if (!trace) return [];
  return trace.steps
    .filter((step) => step.role === "reconciliation" && step.applied)
    .map((step) => `${side}: ${step.label}`);
}

/** 0 の値にゼロ意味の出典が無い場合の不足データ。値からゼロ意味を推論しない(§5.6)。 */
function zeroMeaningAction(methodId: string): DataAcquisitionAction {
  return {
    item: `${methodId} のゼロ意味の出典(公表0 / 非該当 / 被覆外 / 検出限界・丸め / 欠損 / 計算結果0 の区別)`,
    candidateSource: "手法の一次資料(該当表・セル)または手法アダプターの計算記録",
    enablesRecalculation: true,
  };
}

function traceAction(methodId: string): DataAcquisitionAction {
  return {
    item: `${methodId} の再生可能な計算トレース(§5.3)`,
    candidateSource: "手法アダプター(monetization/trace/*)の出力",
    enablesRecalculation: true,
  };
}

/**
 * §6.1 の6段階を固定順で判定する。判定順を入れ替えない(理由コードの意味が変わるため)。
 *
 * 3段階目の符号判定はトレースの最終値を使う。トレースが無い場合だけ `ValuationRecord.centralValue`
 * で代替し、トレース不足そのものは6段階目で `trace_insufficient` として返す。
 * 5段階目でレシピが未指定の場合、トレースが無くてレジストリ照会自体ができなかったのか
 * (`trace_insufficient`)、照会したうえで該当が無かったのか(`recipe_missing`)を区別する。
 */
export function checkComparability(input: ComparabilityInput): ComparabilityResult {
  const { recordA, recordB, traceA, traceB, subjectA, subjectB, recipe } = input;

  // 1. 比較対象
  const subjectIdentity = compareSubjects(subjectA, subjectB);
  if (subjectIdentity.kind === "different_subject") {
    return {
      ok: false,
      reason: "different_subject",
      detail: subjectIdentity.reasons.join(" "),
      missingData: [],
      subjectIdentity,
    };
  }
  const assumptions = [...subjectIdentity.assumptions];

  // 2. 価値概念
  if (recordA.valueConcept !== recordB.valueConcept) {
    return {
      ok: false,
      reason: "value_concept_mismatch",
      detail: `価値概念が異なります(A: ${recordA.valueConcept} / B: ${recordB.valueConcept})。異なる問いのため数値分解しません。`,
      missingData: [],
      subjectIdentity,
    };
  }

  // 3. 方向・費用/便益・符号の意味
  const valueA = traceA ? traceA.finalValue.value : (recordA.centralValue as number);
  const valueB = traceB ? traceB.finalValue.value : (recordB.centralValue as number);
  if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
    return {
      ok: false,
      reason: "non_finite",
      detail: `最終値が有限値ではありません(A: ${valueA} / B: ${valueB})。欠損を0へ置換しません。`,
      missingData: [],
      subjectIdentity,
    };
  }
  const signA = Math.sign(valueA);
  const signB = Math.sign(valueB);
  if (signA !== 0 && signB !== 0 && signA !== signB) {
    return {
      ok: false,
      reason: "sign_mismatch",
      detail: `符号の意味が一致しません(A: ${valueA} / B: ${valueB})。費用/便益の定性的な不一致のため倍率を計算しません。`,
      missingData: [],
      subjectIdentity,
    };
  }

  // 4. 正規化後の単位・通貨・価格年
  const normalizationApplied = [
    ...(recipe?.normalization.map((spec) => spec.label) ?? []),
    ...reconciliationLabels(traceA, "A"),
    ...reconciliationLabels(traceB, "B"),
  ].filter((label, index, all) => all.indexOf(label) === index);

  if (traceA && traceB) {
    const mismatches: string[] = [];
    if (traceA.finalValue.unit !== traceB.finalValue.unit) {
      mismatches.push(`単位(A: ${traceA.finalValue.unit} / B: ${traceB.finalValue.unit})`);
    }
    if ((traceA.finalValue.currency ?? null) !== (traceB.finalValue.currency ?? null)) {
      mismatches.push(`通貨(A: ${traceA.finalValue.currency ?? "未指定"} / B: ${traceB.finalValue.currency ?? "未指定"})`);
    }
    if ((traceA.finalValue.priceYear ?? null) !== (traceB.finalValue.priceYear ?? null)) {
      mismatches.push(`価格年(A: ${traceA.finalValue.priceYear ?? "未指定"} / B: ${traceB.finalValue.priceYear ?? "未指定"})`);
    }
    if (mismatches.length > 0) {
      return {
        ok: false,
        reason: "normalization_mismatch",
        detail: `正規化後も表現が揃っていません: ${mismatches.join("、")}。正規化を方法論寄与へ混ぜません。`,
        missingData: [],
        subjectIdentity,
      };
    }
  }

  // 5. 比較レシピ
  if (!recipe) {
    if (!traceA || !traceB) {
      return {
        ok: false,
        reason: "trace_insufficient",
        detail: "計算トレースが無いため比較レシピを特定できません(レシピ未登録とは区別します)。",
        missingData: [!traceA ? traceAction(recordA.methodId) : null, !traceB ? traceAction(recordB.methodId) : null].filter(
          (action): action is DataAcquisitionAction => action !== null
        ),
        subjectIdentity,
      };
    }
    return {
      ok: false,
      reason: "recipe_missing",
      detail: `${recordA.methodId} と ${recordB.methodId} の比較レシピが未登録です。自動推定で比較しません。`,
      missingData: [
        {
          item: `${parentMethodIdOf(recordA.methodId)} × ${parentMethodIdOf(recordB.methodId)} の比較レシピ(反実仮想の差し替え式と根拠資料)`,
          candidateSource: "両手法の一次資料(方法論文書の該当式)",
          enablesRecalculation: true,
        },
      ],
      subjectIdentity,
    };
  }

  const sideATarget = { methodId: parentMethodIdOf(recordA.methodId), subFactorId: subFactorIdOf(recordA, traceA), methodVersion: recordA.methodVersion };
  const sideBTarget = { methodId: parentMethodIdOf(recordB.methodId), subFactorId: subFactorIdOf(recordB, traceB), methodVersion: recordB.methodVersion };
  if (!recipeSideMatches(recipe.methodA, sideATarget) || !recipeSideMatches(recipe.methodB, sideBTarget)) {
    return {
      ok: false,
      reason: "recipe_version_unsupported",
      detail: `比較レシピ ${recipe.id}@${recipe.version} は ${recordA.methodId}@${recordA.methodVersion} と ${recordB.methodId}@${recordB.methodVersion} の組合せをサポートしません(対象版: A ${recipe.methodA.versionRange} / B ${recipe.methodB.versionRange})。`,
      missingData: [],
      subjectIdentity,
    };
  }
  if (!REGISTRABLE_REVIEW_STATUSES.includes(recipe.review.status as (typeof REGISTRABLE_REVIEW_STATUSES)[number])) {
    return {
      ok: false,
      reason: "recipe_not_registrable",
      detail: `比較レシピ ${recipe.id}@${recipe.version} のレビュー状態が ${recipe.review.status} です。実行できるのは ${REGISTRABLE_REVIEW_STATUSES.join(" / ")} のみです。`,
      missingData: [],
      subjectIdentity,
    };
  }
  if (recipe.testOnly === true && input.allowTestOnly !== true) {
    return {
      ok: false,
      reason: "recipe_not_registrable",
      detail: `比較レシピ ${recipe.id}@${recipe.version} はテスト専用(testOnly)です。本番レジストリでは実行しません。`,
      missingData: [],
      subjectIdentity,
    };
  }

  // 6. 反実仮想に必要なトレース(ゼロ意味の出典を含む)
  if (!traceA || !traceB) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail: "反実仮想の再実行に必要な計算トレースがありません。",
      missingData: [!traceA ? traceAction(recordA.methodId) : null, !traceB ? traceAction(recordB.methodId) : null].filter(
        (action): action is DataAcquisitionAction => action !== null
      ),
      subjectIdentity,
    };
  }

  for (const [side, trace, record] of [
    ["A", traceA, recordA],
    ["B", traceB, recordB],
  ] as const) {
    if (trace.finalValue.value === 0 && trace.zeroMeaning === undefined) {
      return {
        ok: false,
        reason: "trace_insufficient",
        detail: `${side}側(${record.methodId})の値が 0 ですが、ゼロ意味が出典付きで確定していません。値からゼロ意味を推論しません(§5.6)。`,
        missingData: [zeroMeaningAction(record.methodId)],
        subjectIdentity,
      };
    }
    if (trace.zeroMeaning?.code === "missing") {
      return {
        ok: false,
        reason: "trace_insufficient",
        detail: `${side}側(${record.methodId})のゼロ意味が "missing"(必要値が未取得)です。0として計算に入れません(§5.6)。`,
        missingData: [zeroMeaningAction(record.methodId)],
        subjectIdentity,
      };
    }
  }

  const support = recipe.supports(traceA, traceB);
  if (!support.ok) {
    const reason: StopReasonCode =
      support.reason === "recipe_version_unsupported"
        ? "recipe_version_unsupported"
        : support.reason === "license_blocked"
          ? "license_blocked"
          : "trace_insufficient";
    return {
      ok: false,
      reason,
      detail: support.detail ?? `比較レシピ ${recipe.id}@${recipe.version} がこのトレースの組合せをサポートしません。`,
      missingData:
        reason === "trace_insufficient"
          ? [
              {
                item: `${recordA.methodId} / ${recordB.methodId} の反実仮想に必要なトレース段階`,
                candidateSource: support.detail ?? "手法の一次資料",
                enablesRecalculation: true,
              },
            ]
          : [],
      subjectIdentity,
    };
  }

  return { ok: true, normalizationApplied, assumptions, subjectIdentity };
}
