/**
 * M4完成 §6.2:真正な反実仮想評価(全部分集合 v(S))。T-06 / T-07。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.2・§6.3-6
 *
 * 各部分集合 S について、手法B(基準側)のトレースに S の要因だけを手法Aへ差し替えたトレースを
 * **同じ評価器(trace/evaluate-trace.ts)で再実行**して v(S) を得る。固定倍率の合成で代用しない。
 *
 * 設計上の判断:
 *   - **予算超過は停止する。** `recipe.budget` を超える場合、要因を優先度で削って部分分解へ
 *     縮退する経路は取らない。どの要因を落とすかで寄与の意味が変わり、削り方が恣意的になるため、
 *     `budget_exceeded` を返して上位に判断を返す(§6.2「超過する場合は要因を減らして部分分解と
 *     するか、停止理由を返す」の後者を採用)。要因を減らすのはレシピ側の宣言でのみ行う。
 *   - **F の縮小は swap の失敗理由だけで起きる。** 見栄え(残差を小さくする等)で F を変えない。
 *     除外した要因と理由は `excludedFactors` として必ず返し、部分分解として扱う(§6.3-6)。
 *   - **順序非依存を検証する。** |S| ≥ 2 の各 S について、要因を逆順に適用した値が tol-v1 内で
 *     一致しない場合、その組合せは意味を失っている(§6.2「個別には交換可能でも組合せで意味を
 *     失う場合、その集合を実行しない」)。この場合は S のうち **レシピの factors 配列で最後に
 *     現れる要因**(= 宣言された優先順位が最も低い要因)を除外して再試行する。除外規則を
 *     決定論的にするための規約であり、値の見栄えでは選ばない。
 */

import type { SubsetEvaluation, StopReasonCode } from "../types/divergence";
import type { CounterfactualFactor, DataAcquisitionAction, MethodComparisonRecipe, SwappedSetting } from "../types/recipe";
import type { EvidenceRef } from "../types/comparison";
import type { MethodEvaluationTrace } from "../types/trace";
import { TOLERANCE_POLICY, toleranceScale, withinTolerance } from "./tolerance";

/** 数値化から除外した要因と、その理由(§6.3-6)。金額を割り当てない。 */
export interface ExcludedFactor {
  factorId: string;
  category: CounterfactualFactor["category"];
  label: string;
  /** 除外理由。swap の失敗理由または組合せの順序依存のみ。 */
  reason: string;
  reasonKind: "swap_failed" | "order_dependent_combination";
  missingData: DataAcquisitionAction[];
  evidence: EvidenceRef[];
}

export type CounterfactualDirection = "B_to_A" | "A_to_B";

export interface EvaluateSubsetsOptions {
  recipe: MethodComparisonRecipe;
  traceA: MethodEvaluationTrace;
  traceB: MethodEvaluationTrace;
  /** 対象要因を明示する場合(省略時は `recipe.factors` の全件)。 */
  factorIds?: string[];
  /** "B_to_A"(既定)は基準側B。逆方向の検証では "A_to_B" を使う。 */
  direction?: CounterfactualDirection;
}

export type EvaluateSubsetsResult =
  | {
      ok: true;
      direction: CounterfactualDirection;
      /** 縮小後の要因集合 F(レシピの宣言順)。 */
      factorIds: string[];
      evaluations: SubsetEvaluation[];
      /** v(S)。`computeShapleyValues` の `valueOf` にそのまま渡せる。 */
      valueOf: (subset: readonly string[]) => number;
      /** v(∅) = 基準側の値。 */
      baseValue: number;
      /** v(F) = V*(到達値)。 */
      fullValue: number;
      excludedFactors: ExcludedFactor[];
      /** メモ化後に評価した部分集合の数(= 2^k)。 */
      evaluationCount: number;
      /** 順序非依存の検証で追加実行したトレース評価の回数。 */
      orderCheckCount: number;
    }
  | {
      ok: false;
      reason: Extract<StopReasonCode, "budget_exceeded" | "no_numerizable_factors">;
      detail: string;
      missingData: DataAcquisitionAction[];
      excludedFactors: ExcludedFactor[];
    };

interface ApplyOk {
  ok: true;
  trace: MethodEvaluationTrace;
  swapped: SwappedSetting[];
}
interface ApplyFailure {
  ok: false;
  factor: CounterfactualFactor;
  reason: string;
  missingData: DataAcquisitionAction[];
}

function applySequence(base: MethodEvaluationTrace, target: MethodEvaluationTrace, factors: CounterfactualFactor[]): ApplyOk | ApplyFailure {
  let current = base;
  const swapped: SwappedSetting[] = [];
  for (const factor of factors) {
    let result;
    try {
      result = factor.swap(current, target);
    } catch (error) {
      return {
        ok: false,
        factor,
        reason: `差し替えの再評価が失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        missingData: [],
      };
    }
    if (!result.ok) {
      return { ok: false, factor, reason: result.reason, missingData: result.missingData };
    }
    current = result.trace;
    swapped.push(...result.swapped);
  }
  return { ok: true, trace: current, swapped };
}

function bitsOf(mask: number): number {
  let count = 0;
  let rest = mask;
  while (rest !== 0) {
    rest &= rest - 1;
    count++;
  }
  return count;
}

interface AttemptSuccess {
  ok: true;
  evaluations: Map<number, SubsetEvaluation>;
  evaluationCount: number;
  orderCheckCount: number;
}
interface AttemptExclusion {
  ok: false;
  excluded: ExcludedFactor;
}

function attempt(
  factors: CounterfactualFactor[],
  base: MethodEvaluationTrace,
  target: MethodEvaluationTrace
): AttemptSuccess | AttemptExclusion {
  const k = factors.length;
  const evaluations = new Map<number, SubsetEvaluation>();
  let evaluationCount = 0;
  let orderCheckCount = 0;

  for (let mask = 0; mask < 2 ** k; mask++) {
    const selected = factors.filter((_, index) => (mask & (1 << index)) !== 0);
    const forward = applySequence(base, target, selected);
    evaluationCount++;
    if (!forward.ok) {
      return {
        ok: false,
        excluded: {
          factorId: forward.factor.id,
          category: forward.factor.category,
          label: forward.factor.label,
          reason: forward.reason,
          reasonKind: "swap_failed",
          missingData: forward.missingData,
          evidence: forward.factor.evidence,
        },
      };
    }

    if (selected.length >= 2) {
      const reverse = applySequence(base, target, [...selected].reverse());
      orderCheckCount++;
      const lowestPriority = selected[selected.length - 1];
      if (!reverse.ok) {
        return {
          ok: false,
          excluded: {
            factorId: reverse.factor.id,
            category: reverse.factor.category,
            label: reverse.factor.label,
            reason: reverse.reason,
            reasonKind: "swap_failed",
            missingData: reverse.missingData,
            evidence: reverse.factor.evidence,
          },
        };
      }
      const forwardValue = forward.trace.finalValue.value;
      const reverseValue = reverse.trace.finalValue.value;
      const scale = toleranceScale([forwardValue, reverseValue]);
      if (!withinTolerance(forwardValue, reverseValue, scale, TOLERANCE_POLICY.money)) {
        return {
          ok: false,
          excluded: {
            factorId: lowestPriority.id,
            category: lowestPriority.category,
            label: lowestPriority.label,
            reason: `要因 {${selected.map((f) => f.id).join(", ")}} は適用順で値が変わり(順方向 ${forwardValue} / 逆順 ${reverseValue}、許容誤差 ${TOLERANCE_POLICY.version})、組合せで意味を失います。レシピの宣言順で最も優先度の低い要因を除外しました。`,
            reasonKind: "order_dependent_combination",
            missingData: [],
            evidence: lowestPriority.evidence,
          },
        };
      }
    }

    const subsetIds = selected.map((factor) => factor.id).sort();
    const fixedIds = factors
      .filter((factor) => !selected.includes(factor))
      .map((factor) => factor.id)
      .sort();
    evaluations.set(mask, {
      subset: subsetIds,
      fixed: fixedIds,
      value: forward.trace.finalValue.value,
      traceHash: forward.trace.hash,
      swapped: forward.swapped,
    });
  }

  return { ok: true, evaluations, evaluationCount, orderCheckCount };
}

/**
 * 全部分集合 S ⊆ F を評価する。swap が失敗した要因は F から外し、
 * 縮小後の F の全部分集合が成立するまで繰り返す(§6.3-6)。F が空になれば停止する。
 */
export function evaluateSubsets(options: EvaluateSubsetsOptions): EvaluateSubsetsResult {
  const { recipe, traceA, traceB } = options;
  const direction: CounterfactualDirection = options.direction ?? "B_to_A";
  const base = direction === "B_to_A" ? traceB : traceA;
  const target = direction === "B_to_A" ? traceA : traceB;

  let factors = recipe.factors.filter((factor) => options.factorIds === undefined || options.factorIds.includes(factor.id));
  const excludedFactors: ExcludedFactor[] = [];

  for (;;) {
    if (factors.length === 0) {
      return {
        ok: false,
        reason: "no_numerizable_factors",
        detail:
          excludedFactors.length > 0
            ? `反実仮想を定義できる要因が残りませんでした(除外: ${excludedFactors.map((f) => f.factorId).join(", ")})。数値分解成功とせず、定性差異と停止理由を返します。`
            : "レシピが数値化要因を1つも定義していません。数値分解成功としません。",
        missingData: excludedFactors.flatMap((factor) => factor.missingData),
        excludedFactors,
      };
    }

    const required = 2 ** factors.length;
    if (factors.length > recipe.budget.maxFactors || required > recipe.budget.maxEvaluations) {
      return {
        ok: false,
        reason: "budget_exceeded",
        detail: `要因数 ${factors.length}(上限 ${recipe.budget.maxFactors})、必要な v(S) 評価回数 ${required}(上限 ${recipe.budget.maxEvaluations})。要因の削り方が恣意的になるため停止します。`,
        missingData: [],
        excludedFactors,
      };
    }

    const result = attempt(factors, base, target);
    if (result.ok) {
      const factorIds = factors.map((factor) => factor.id);
      const byKey = new Map<string, number>();
      for (const evaluation of result.evaluations.values()) {
        byKey.set(evaluation.subset.join("|"), evaluation.value);
      }
      const valueOf = (subset: readonly string[]): number => {
        const key = [...subset].sort().join("|");
        const value = byKey.get(key);
        if (value === undefined) {
          throw new Error(`v(S) が未評価です(S = {${[...subset].join(", ")}})。評価済みの部分集合以外を参照しています。`);
        }
        return value;
      };
      const evaluations = [...result.evaluations.entries()]
        .sort((a, b) => bitsOf(a[0]) - bitsOf(b[0]) || a[0] - b[0])
        .map(([, evaluation]) => evaluation);
      return {
        ok: true,
        direction,
        factorIds,
        evaluations,
        valueOf,
        baseValue: valueOf([]),
        fullValue: valueOf(factorIds),
        excludedFactors,
        evaluationCount: result.evaluationCount,
        orderCheckCount: result.orderCheckCount,
      };
    }

    excludedFactors.push(result.excluded);
    factors = factors.filter((factor) => factor.id !== result.excluded.factorId);
  }
}
