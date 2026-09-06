/**
 * M4:1ペア分の PairwiseDecomposition を組み立てる。
 * preconditions.ts(F-0〜F-3/F-8)・factor-recalculation.ts(F-4/F-5)・shapley.ts(§4.2)・
 * narrative.ts(F-9・読み下し文)を束ねる。
 */

import { classifyPairPrecondition } from "./preconditions";
import { classifyAllFactors } from "./factor-recalculation";
import { computeShapleyContributions } from "./shapley";
import { applyF9DisplayRule, buildNarrative } from "./narrative";
import type { DecompositionFactor, FactorContribution, PairwiseDecomposition } from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";

/**
 * @deprecated 旧経路。v(S) を固定倍率の合成で作るため、§6.2 が求める「実式の再実行」を満たさない。
 *   新runは `pairwise-decomposition-v2.ts` の `buildPairwiseDecompositionV2` を使う。
 *   この関数は保存済みrun(resultSchemaVersion ≤ 10)の再現のためだけに残す。
 */
export function buildPairwiseDecomposition(recordA: ValuationRecord, recordB: ValuationRecord): PairwiseDecomposition {
  const valueA = recordA.centralValue;
  const valueB = recordB.centralValue;

  const precondition = classifyPairPrecondition(valueA, valueB);

  if (!precondition.proceed) {
    return {
      methodIdA: recordA.methodId,
      methodIdB: recordB.methodId,
      valueA,
      valueB,
      ratio: null,
      mode: precondition.mode,
      fallbackApplied: [precondition.fallback],
      contributions: [],
      residual: null,
      narrative: buildNarrative({
        methodIdA: recordA.methodId,
        methodIdB: recordB.methodId,
        mode: precondition.mode,
        shortCircuitReason: precondition.reason,
        ratio: null,
        contributions: [],
        residual: null,
      }),
    };
  }

  const classifications = classifyAllFactors(recordA, recordB);
  const recalculable = classifications.filter((c) => c.kind === "recalculable");
  const effectiveFactors: DecompositionFactor[] = recalculable.map((c) => c.factor);

  const ratioByFactor = new Map<DecompositionFactor, number>(
    recalculable.map((c) => [c.factor, c.kind === "recalculable" ? c.ratio : 1])
  );

  const v = (subset: Set<DecompositionFactor>): number => {
    let value = valueB as number;
    for (const factor of subset) {
      value *= ratioByFactor.get(factor)!;
    }
    return value;
  };

  const shapleyResults = computeShapleyContributions(effectiveFactors, v);
  const shapleyByFactor = new Map(shapleyResults.map((r) => [r.factor, r.logContribution]));

  const contributions: FactorContribution[] = classifications.map((classification) => {
    if (classification.kind === "zero") {
      return {
        factor: classification.factor,
        logContribution: 0,
        multiplier: 1,
        shareRatio: null,
        status: "decomposed",
      };
    }
    if (classification.kind === "recalculable") {
      const logContribution = shapleyByFactor.get(classification.factor)!;
      return {
        factor: classification.factor,
        logContribution,
        multiplier: Math.exp(logContribution),
        shareRatio: null,
        status: "decomposed",
      };
    }
    return {
      factor: classification.factor,
      logContribution: 0,
      multiplier: 1,
      shareRatio: null,
      status: "not_recalculable",
      exclusionReason: classification.reason,
    };
  });

  const contributionsWithF9 = applyF9DisplayRule(contributions);

  const explainedLogSum = contributionsWithF9
    .filter((c) => c.status === "decomposed")
    .reduce((sum, c) => sum + c.logContribution, 0);
  const totalLogDiff = Math.log((valueA as number) / (valueB as number));
  const residualLog = totalLogDiff - explainedLogSum;

  const fallbackApplied = [
    ...new Set(
      classifications
        .filter((c) => c.kind === "not_recalculable")
        .map((c) => c.fallback)
    ),
  ];
  if (contributionsWithF9.some((c) => c.status === "decomposed" && c.shareRatio === null && c.logContribution !== 0)) {
    fallbackApplied.push("F-9");
  }

  const ratio = (valueA as number) / (valueB as number);
  const residual = { logResidual: residualLog, multiplier: Math.exp(residualLog) };

  return {
    methodIdA: recordA.methodId,
    methodIdB: recordB.methodId,
    valueA,
    valueB,
    ratio,
    mode: "multiplicative",
    fallbackApplied,
    contributions: contributionsWithF9,
    residual,
    narrative: buildNarrative({
      methodIdA: recordA.methodId,
      methodIdB: recordB.methodId,
      mode: "multiplicative",
      ratio,
      contributions: contributionsWithF9,
      residual,
    }),
  };
}
