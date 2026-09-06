/**
 * M4完成:1ペア分の `PairwiseDecompositionV2` を組み立てる(新経路)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.1〜§6.4
 *
 * 流れ: 比較可能性 → 比較レシピ → 反実仮想(全 v(S)) → モード判定 → Shapley → 残差 →
 *       逆方向 → 意思決定への含意 → 読み下し文。どの段階で止まっても理由コードと不足データを返す。
 *
 * **A/Bの向き。** レジストリが「A/Bを入れ替えた向き」でレシピを見つけた場合、結果の A/B を
 * レシピの向き(methodA が差し替え先、methodB が基準側)へ揃えて出力する。基準側 B を捏造せず、
 * v(∅) = V_B が常にレシピの宣言どおりに成り立つようにするため。出力の `methodIdA` / `methodIdB` が
 * 入力の recordA / recordB と入れ替わることがある。
 */

import type { ComparisonSubject } from "../types/comparison";
import type {
  DecisionImplication,
  DecomposedPair,
  NumericContribution,
  PairwiseDecompositionV2,
  ReverseDecomposition,
  StopReasonCode,
  StoppedPair,
} from "../types/divergence";
import type { DataAcquisitionAction, KnownDifference, MethodComparisonRecipe } from "../types/recipe";
import type { MethodEvaluationTrace } from "../types/trace";
import type { ValuationRecord } from "../types/valuation";
import { checkComparability, parentMethodIdOf } from "./comparability";
import { evaluateSubsets, type ExcludedFactor } from "./counterfactual";
import { buildNarrativeV2 } from "./narrative-v2";
import { buildPairDiagnostics, selectDecompositionMode, type DecompositionModeV2 } from "./mode-selection";
import { buildResidual, excludedFactorsAsKnownDifferences } from "./residual";
import type { RecipeRegistry } from "./recipes/registry";
import { computeShapleyValues } from "./shapley";
import { TOLERANCE_POLICY, isZeroWithinTolerance, toleranceScale } from "./tolerance";

/**
 * 残差が全体差を支配していると判定する比率。
 *
 * **これは業務閾値(F-3/F-8、H-06の対象)ではない。** 数値を丸めたり寄与を省略したりせず、
 * 「利用者にどの行動を勧めるか」という含意の分類にだけ使う。残差が全体差の半分を超える場合、
 * 代表値の選択より先に追加調査を提示する、という表示上の規則である。
 */
export const RESIDUAL_DOMINANCE_RATIO = 0.5;

/** 比較不能として扱う停止理由(§6.1)。不足データ系は追加調査に分類する。 */
const NOT_COMPARABLE_REASONS: StopReasonCode[] = [
  "different_subject",
  "value_concept_mismatch",
  "sign_mismatch",
  "counterfactual_sign_mismatch",
];

export interface DivergenceDecompositionVersionsV2 {
  algorithmVersion: string;
  cicesMatchLevel: string;
  aopMappingVersion: string;
  /** F-3 の桁差閾値の版。新経路では無効化版(`F3_THRESHOLD_DISABLED_VERSION`)。 */
  f3ThresholdVersion: string;
  /** F-8 の有意乖離閾値の版。新経路では無効化版(`F8_THRESHOLD_DISABLED_VERSION`)。 */
  f8ThresholdVersion: string;
  recipeRegistryVersion: string;
  toleranceVersion: string;
  subjectRuleVersion: string;
  pathwayMappingVersion: string;
}

export class DivergenceVersionMismatchError extends Error {}

export interface BuildPairwiseDecompositionV2Options {
  recordA: ValuationRecord;
  recordB: ValuationRecord;
  /** 両レコードの比較対象。個別に異なる対象を渡す場合は subjectA / subjectB を使う。 */
  subject: ComparisonSubject;
  subjectA?: ComparisonSubject;
  subjectB?: ComparisonSubject;
  registry: RecipeRegistry;
  versions: DivergenceDecompositionVersionsV2;
}

interface PairContext {
  recordA: ValuationRecord;
  recordB: ValuationRecord;
  traceA?: MethodEvaluationTrace;
  traceB?: MethodEvaluationTrace;
  subjectId: string;
  recipe?: MethodComparisonRecipe;
  normalizationApplied: string[];
}

function valueOfRecord(record: ValuationRecord, trace?: MethodEvaluationTrace): number {
  return trace ? trace.finalValue.value : (record.centralValue as number);
}

function implicationForStop(reason: StopReasonCode, detail: string): DecisionImplication {
  if (NOT_COMPARABLE_REASONS.includes(reason)) {
    return { kind: "not_comparable", summary: `このペアは比較できません(${reason})。代表値の候補として並べません。${detail}` };
  }
  return {
    kind: "additional_investigation",
    summary: `追加調査が必要です(${reason})。不足しているデータを取得すれば再計算できるかを次アクションで示します。${detail}`,
  };
}

function buildStopped(context: PairContext, stop: { reason: StopReasonCode; detail: string; missingData: DataAcquisitionAction[] }, extra?: {
  qualitativeDifferences?: KnownDifference[];
  subjectIdentity?: StoppedPair["subjectIdentity"];
}): StoppedPair {
  const valueA = valueOfRecord(context.recordA, context.traceA);
  const valueB = valueOfRecord(context.recordB, context.traceB);
  const qualitativeDifferences = extra?.qualitativeDifferences ?? context.recipe?.fixedDifferences ?? [];
  const implication = implicationForStop(stop.reason, stop.detail);
  return {
    status: "stopped",
    analysisUnit: "cross_method",
    methodIdA: context.recordA.methodId,
    methodIdB: context.recordB.methodId,
    parentMethodIdA: parentMethodIdOf(context.recordA.methodId),
    parentMethodIdB: parentMethodIdOf(context.recordB.methodId),
    subjectId: context.subjectId,
    valueConcept: context.recordA.valueConcept,
    valueA,
    valueB,
    normalizationApplied: context.normalizationApplied,
    zeroMeaningA: context.traceA?.zeroMeaning,
    zeroMeaningB: context.traceB?.zeroMeaning,
    qualitativeDifferences,
    diagnostics: buildPairDiagnostics(valueA, valueB),
    implication,
    reason: stop.reason,
    detail: stop.detail,
    missingData: stop.missingData,
    nextActions: stop.missingData,
    recipe: context.recipe
      ? { id: context.recipe.id, version: context.recipe.version, hash: context.recipe.hash, reviewStatus: context.recipe.review.status }
      : undefined,
    subjectIdentity: extra?.subjectIdentity,
    narrative: buildNarrativeV2({
      kind: "stopped",
      methodIdA: context.recordA.methodId,
      methodIdB: context.recordB.methodId,
      reason: stop.reason,
      detail: stop.detail,
      missingData: stop.missingData,
      implication,
      qualitativeDifferences,
    }),
  };
}

/** グループ内の親手法数上限を超えたペアを、例外ではなく停止結果として残す(T-02-11)。 */
export function buildGroupLimitStoppedPair(options: {
  recordA: ValuationRecord;
  recordB: ValuationRecord;
  subjectId: string;
  maxParentMethods: number;
}): StoppedPair {
  const context: PairContext = {
    recordA: options.recordA,
    recordB: options.recordB,
    traceA: options.recordA.trace,
    traceB: options.recordB.trace,
    subjectId: options.subjectId,
    normalizationApplied: [],
  };
  return buildStopped(context, {
    reason: "group_limit_exceeded",
    detail: `価値概念グループ内の親手法数が上限(${options.maxParentMethods})を超えたため、このペアは分解対象から外しました。例外にせず結果として残します。`,
    missingData: [],
  });
}

function toNumericContributions(options: {
  mode: DecompositionModeV2;
  values: { factorId: string; value: number }[];
  recipe: MethodComparisonRecipe;
  evaluations: { subset: string[]; swapped: DecomposedPair["subsets"][number]["swapped"] }[];
  totalDifference: number;
  shareRatioAvailable: boolean;
  zeroScale: number;
}): NumericContribution[] {
  const spec = options.mode === "multiplicative" ? TOLERANCE_POLICY.log : TOLERANCE_POLICY.money;
  /**
   * 負ゼロ(-0)を +0 に正規化する。0 の寄与を負の全体差で割ると -0 になり、JSON(jsonb)を経由すると
   * +0 に変わって保存前後で `Object.is` 比較が食い違う(lib/db/persistence.db.test.ts)。
   * 数値の意味は同じであり、正規化は表示・保存の一貫性のためだけに行う。
   */
  const canonicalZero = (x: number): number => (x === 0 ? 0 : x);
  return options.values.map(({ factorId, value: rawValue }) => {
    const value = canonicalZero(rawValue);
    const factor = options.recipe.factors.find((candidate) => candidate.id === factorId);
    const singleton = options.evaluations.find((evaluation) => evaluation.subset.length === 1 && evaluation.subset[0] === factorId);
    return {
      factorId,
      category: factor?.category ?? "unclassified",
      label: factor?.label ?? factorId,
      shapley: value,
      displayAmount: options.mode === "additive" ? value : null,
      displayMultiplier: options.mode === "multiplicative" ? Math.exp(value) : null,
      shareRatio: options.shareRatioAvailable ? canonicalZero(value / options.totalDifference) : null,
      isZero: isZeroWithinTolerance(value, options.zeroScale, spec),
      swapped: singleton?.swapped ?? [],
      evidence: factor?.evidence ?? [],
    };
  });
}

/**
 * 逆方向(A基準)の分解。`reverseCompatible` なレシピでのみ実行し、各要因の寄与が
 * 順方向の符号反転になっていることを許容誤差で確認する。確認できなければ未定義として返す
 * (無理な平均化や符号反転による逆方向の捏造をしない、§6.2)。
 */
function buildReverse(options: {
  recipe: MethodComparisonRecipe;
  traceA: MethodEvaluationTrace;
  traceB: MethodEvaluationTrace;
  mode: DecompositionModeV2;
  forward: NumericContribution[];
  factorIds: string[];
  valueA: number;
  valueB: number;
  excludedFactors: ExcludedFactor[];
}): ReverseDecomposition {
  const { recipe, traceA, traceB, mode, forward, factorIds, valueA, valueB } = options;
  if (!recipe.reverseCompatible) {
    return {
      defined: false,
      reason: `比較レシピ ${recipe.id}@${recipe.version} は逆方向互換条件(v_reverse(S) = v_forward(F∖S))を満たしません。基準側は ${recipe.baseline} 固定で、逆方向の結果は作りません。`,
    };
  }

  const reverse = evaluateSubsets({ recipe, traceA, traceB, factorIds, direction: "A_to_B" });
  if (!reverse.ok) {
    return { defined: false, reason: `逆方向の反実仮想を評価できません(${reverse.reason}): ${reverse.detail}` };
  }

  const shapley = computeShapleyValues({
    factorIds: reverse.factorIds,
    valueOf: reverse.valueOf,
    space: mode === "multiplicative" ? "log" : "additive",
    budget: recipe.budget,
  });
  if (shapley.kind !== "ok") {
    return { defined: false, reason: `逆方向のShapley寄与を確定できません(${shapley.kind})。` };
  }

  const spec = mode === "multiplicative" ? TOLERANCE_POLICY.log : TOLERANCE_POLICY.money;
  const scale = toleranceScale([...forward.map((contribution) => contribution.shapley), ...shapley.values.map((value) => value.value)]);
  for (const value of shapley.values) {
    const forwardValue = forward.find((contribution) => contribution.factorId === value.factorId)?.shapley;
    if (forwardValue === undefined) {
      return { defined: false, reason: `逆方向で要因 ${value.factorId} に対応する順方向の寄与がありません。` };
    }
    if (!isZeroWithinTolerance(value.value + forwardValue, scale, spec)) {
      return {
        defined: false,
        reason: `要因 ${value.factorId} の寄与が符号反転になりません(順方向 ${forwardValue} / 逆方向 ${value.value}、許容誤差 ${TOLERANCE_POLICY.version})。`,
      };
    }
  }

  const residual = buildResidual({
    mode,
    valueA: valueB,
    valueB: valueA,
    vStar: reverse.fullValue,
    contributions: shapley.values.map((value) => value.value),
    recipe,
    excludedFactors: reverse.excludedFactors,
  });
  if (!residual.ok) {
    return { defined: false, reason: `逆方向の残差を確定できません(${residual.reason}): ${residual.detail}` };
  }

  const totalDifference = mode === "multiplicative" ? Math.log(valueB) - Math.log(valueA) : valueB - valueA;
  const zeroScale = toleranceScale([...shapley.values.map((value) => value.value), residual.residual.value, totalDifference]);
  return {
    defined: true,
    vStar: reverse.fullValue,
    residual: residual.residual,
    contributions: toNumericContributions({
      mode,
      values: shapley.values,
      recipe,
      evaluations: reverse.evaluations,
      totalDifference,
      shareRatioAvailable: residual.residual.ratio !== null,
      zeroScale,
    }),
  };
}

function assertVersions(versions: DivergenceDecompositionVersionsV2, registry: RecipeRegistry): void {
  if (versions.toleranceVersion !== TOLERANCE_POLICY.version) {
    throw new DivergenceVersionMismatchError(
      `宣言された許容誤差版(${versions.toleranceVersion})が実際に使う版(${TOLERANCE_POLICY.version})と一致しません。再計算ハッシュへ誤った版を記録しません。`
    );
  }
  if (versions.recipeRegistryVersion !== registry.version) {
    throw new DivergenceVersionMismatchError(
      `宣言されたレシピレジストリ版(${versions.recipeRegistryVersion})が実際のレジストリ版(${registry.version})と一致しません。`
    );
  }
}

export function buildPairwiseDecompositionV2(options: BuildPairwiseDecompositionV2Options): PairwiseDecompositionV2 {
  const { registry, versions } = options;
  assertVersions(versions, registry);

  const subjectA = options.subjectA ?? options.subject;
  const subjectB = options.subjectB ?? options.subject;

  // A/Bの向きをレシピへ揃える(基準側Bを捏造しない)。
  let recordA = options.recordA;
  let recordB = options.recordB;
  let orientedSubjectA = subjectA;
  let orientedSubjectB = subjectB;
  const rawTraceA = recordA.trace;
  const rawTraceB = recordB.trace;
  const match = rawTraceA && rawTraceB ? registry.find(rawTraceA, rawTraceB) : null;
  if (match?.swappedOrientation) {
    [recordA, recordB] = [recordB, recordA];
    [orientedSubjectA, orientedSubjectB] = [subjectB, subjectA];
  }
  const traceA = recordA.trace;
  const traceB = recordB.trace;
  const recipe = match?.recipe;

  const context: PairContext = {
    recordA,
    recordB,
    traceA,
    traceB,
    subjectId: options.subject.id,
    recipe,
    normalizationApplied: [],
  };

  const comparability = checkComparability({
    recordA,
    recordB,
    traceA,
    traceB,
    subjectA: orientedSubjectA,
    subjectB: orientedSubjectB,
    recipe,
    allowTestOnly: registry.allowTestOnly,
  });
  if (!comparability.ok) {
    return buildStopped(context, comparability, { subjectIdentity: comparability.subjectIdentity });
  }
  context.normalizationApplied = comparability.normalizationApplied;

  // ここまで来ればレシピとトレースは確定している。
  if (!recipe || !traceA || !traceB) {
    return buildStopped(context, {
      reason: "trace_insufficient",
      detail: "比較可能性判定を通過しましたが、レシピまたはトレースが確定していません(内部整合エラー)。",
      missingData: [],
    });
  }

  const counterfactual = evaluateSubsets({ recipe, traceA, traceB });
  if (!counterfactual.ok) {
    return buildStopped(
      context,
      { reason: counterfactual.reason, detail: counterfactual.detail, missingData: counterfactual.missingData },
      { qualitativeDifferences: [...recipe.fixedDifferences, ...excludedFactorsAsKnownDifferences(counterfactual.excludedFactors)] }
    );
  }

  const valueA = traceA.finalValue.value;
  const valueB = counterfactual.baseValue;
  const vStar = counterfactual.fullValue;
  const excludedDifferences = excludedFactorsAsKnownDifferences(counterfactual.excludedFactors);

  const modeSelection = selectDecompositionMode({
    valueA,
    valueB,
    subsetValues: counterfactual.evaluations.map((evaluation) => evaluation.value),
    factorCount: counterfactual.factorIds.length,
    recipe,
  });
  if (modeSelection.kind === "stop") {
    return buildStopped(
      context,
      { reason: modeSelection.reason, detail: modeSelection.detail, missingData: counterfactual.excludedFactors.flatMap((f) => f.missingData) },
      { qualitativeDifferences: [...recipe.fixedDifferences, ...excludedDifferences] }
    );
  }
  const mode = modeSelection.mode;

  const shapley = computeShapleyValues({
    factorIds: counterfactual.factorIds,
    valueOf: counterfactual.valueOf,
    space: mode === "multiplicative" ? "log" : "additive",
    budget: recipe.budget,
  });
  if (shapley.kind !== "ok") {
    const reason: StopReasonCode =
      shapley.kind === "budget_exceeded" ? "budget_exceeded" : shapley.kind === "efficiency_violation" ? "efficiency_violation" : "non_finite";
    return buildStopped(
      context,
      { reason, detail: shapley.detail, missingData: [] },
      { qualitativeDifferences: [...recipe.fixedDifferences, ...excludedDifferences] }
    );
  }

  const residual = buildResidual({
    mode,
    valueA,
    valueB,
    vStar,
    contributions: shapley.values.map((value) => value.value),
    recipe,
    excludedFactors: counterfactual.excludedFactors,
  });
  if (!residual.ok) {
    return buildStopped(
      context,
      { reason: residual.reason, detail: residual.detail, missingData: [] },
      { qualitativeDifferences: [...recipe.fixedDifferences, ...excludedDifferences] }
    );
  }

  const totalDifference = mode === "multiplicative" ? Math.log(valueA) - Math.log(valueB) : valueA - valueB;
  const explainedSum = shapley.values.reduce((total, value) => total + value.value, 0);
  const zeroScale = toleranceScale([...shapley.values.map((value) => value.value), residual.residual.value, totalDifference]);

  const contributions = toNumericContributions({
    mode,
    values: shapley.values,
    recipe,
    evaluations: counterfactual.evaluations,
    totalDifference,
    shareRatioAvailable: residual.residual.ratio !== null,
    zeroScale,
  });

  const spec = mode === "multiplicative" ? TOLERANCE_POLICY.log : TOLERANCE_POLICY.money;
  const residualIsZero = isZeroWithinTolerance(residual.residual.value, zeroScale, spec);
  const residualDominates =
    residual.residual.unclassified ||
    (residual.residual.ratio !== null && Math.abs(residual.residual.ratio) > RESIDUAL_DOMINANCE_RATIO) ||
    (residual.residual.ratio === null && !residualIsZero);

  const implication: DecisionImplication = residualDominates
    ? {
        kind: "additional_investigation",
        summary: `残差が全体差に対して支配的です(残差 ${residual.residual.value}${residual.residual.ratio === null ? "、比率は表示不能" : `、比率 ${residual.residual.ratio}`})。代表値の選択より先に、次アクションのデータ取得で残差の由来を特定してください。`,
      }
    : {
        kind: "representative_choice",
        summary: `数値化できた要因が全体差の大半を説明しています。価値概念・用途・利用条件を満たす手法から代表値を選べます(選択理由の記録は利用者が行います)。`,
      };

  const qualitativeDifferences = [...recipe.fixedDifferences, ...excludedDifferences];

  const decomposed: DecomposedPair = {
    status: "decomposed",
    analysisUnit: "cross_method",
    methodIdA: recordA.methodId,
    methodIdB: recordB.methodId,
    parentMethodIdA: parentMethodIdOf(recordA.methodId),
    parentMethodIdB: parentMethodIdOf(recordB.methodId),
    subjectId: options.subject.id,
    valueConcept: recordA.valueConcept,
    valueA,
    valueB,
    normalizationApplied: comparability.normalizationApplied,
    zeroMeaningA: traceA.zeroMeaning,
    zeroMeaningB: traceB.zeroMeaning,
    qualitativeDifferences,
    diagnostics: modeSelection.diagnostics,
    implication,
    mode,
    kind: recipe.decompositionKind,
    baseline: "B",
    direction: "B_to_A",
    vStar,
    totalDifference,
    explainedSum,
    contributions,
    residual: residual.residual,
    subsets: counterfactual.evaluations,
    recipe: { id: recipe.id, version: recipe.version, hash: recipe.hash, reviewStatus: recipe.review.status },
    tolerance: { version: TOLERANCE_POLICY.version },
    reverse: buildReverse({
      recipe,
      traceA,
      traceB,
      mode,
      forward: contributions,
      factorIds: counterfactual.factorIds,
      valueA,
      valueB,
      excludedFactors: counterfactual.excludedFactors,
    }),
    /** 実行したトレース再評価の回数(部分集合 2^k + 順序非依存の検証)。 */
    evaluationCount: counterfactual.evaluationCount + counterfactual.orderCheckCount,
    // 読み下し文は確定した数値から組み立てるため、この直後に差し替える。
    narrative: "",
  };

  return {
    ...decomposed,
    narrative: buildNarrativeV2({
      kind: "decomposed",
      methodIdA: decomposed.methodIdA,
      methodIdB: decomposed.methodIdB,
      mode,
      decompositionKind: decomposed.kind,
      valueA,
      valueB,
      vStar,
      totalDifference,
      explainedSum,
      contributions,
      residual: residual.residual,
      implication,
      normalizationApplied: decomposed.normalizationApplied,
      qualitativeDifferences,
    }),
  };
}
