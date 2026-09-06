import { describe, expect, it } from "vitest";
import { summarizeCorpus, type CorpusEntry, type CorpusManifest } from "./metrics";
import { buildPairwiseDecompositionV2 } from "./pairwise-decomposition-v2";
import { createTestRegistry } from "./recipes/registry";
import { makeSyntheticTrace, SYNTHETIC_RECIPES } from "./recipes/synthetic-interaction";
import { makeComparisonSubject, makeValuationRecord, TEST_DECOMPOSITION_VERSIONS_V2 } from "./test-helpers";
import type { PairwiseDecompositionV2 } from "../types/divergence";
import type { MethodEvaluationTrace } from "../types/trace";

const registry = createTestRegistry();
for (const recipe of SYNTHETIC_RECIPES) registry.register(recipe);

const subject = makeComparisonSubject();
const versions = TEST_DECOMPOSITION_VERSIONS_V2;

function record(trace: MethodEvaluationTrace) {
  return makeValuationRecord({ methodId: trace.methodId, centralValue: trace.finalValue.value, trace, id: `vr-${trace.hash.slice(-8)}` });
}

function pair(traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace, overrides = {}): PairwiseDecompositionV2 {
  return buildPairwiseDecompositionV2({ recordA: record(traceA), recordB: record(traceB), subject, registry, versions, ...overrides });
}

const productA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
const productB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
const maxA = makeSyntheticTrace({ methodId: "synthetic-max-a", shape: "max", quantity: 1, alpha: 10, beta: 8, gamma: 3 });
const maxB = makeSyntheticTrace({ methodId: "synthetic-max-b", shape: "max", quantity: 1, alpha: 1, beta: 5, gamma: 1 });
const sumA = makeSyntheticTrace({ methodId: "synthetic-sum-a", shape: "sum", quantity: 1, alpha: -3, beta: -2, gamma: 0 });
const sumB = makeSyntheticTrace({ methodId: "synthetic-sum-b", shape: "sum", quantity: 1, alpha: -1, beta: -1, gamma: 0 });
const unknownA = makeSyntheticTrace({ methodId: "unregistered-method", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });

const fullPair = pair(productA, productB);
const partialPair = pair(maxA, maxB);
const additivePair = pair(sumA, sumB);
const recipeMissingPair = pair(unknownA, productB);
const differentSubjectPair = pair(productA, productB, {
  subjectA: makeComparisonSubject(),
  subjectB: makeComparisonSubject({ location: { siteId: "site-999", region: "JP" } }),
});

const MANIFEST: CorpusManifest = {
  candidatePairCount: 10,
  primaryEvidence: ["synthetic-product"],
  negativeExamples: ["unregistered-method"],
};

function entry(pairResult: PairwiseDecompositionV2, subjectId = "subject:1", currency?: string): CorpusEntry {
  return { subjectId, pair: pairResult, recipeVersion: pairResult.recipe?.version ?? "none", currency };
}

describe("summarizeCorpus(§6.5)", () => {
  it("比較可能率と数値分解成立率を、全候補と比較可能の両方の分母で出す", () => {
    const summary = summarizeCorpus(
      [
        entry(fullPair, "subject:1"),
        entry(partialPair, "subject:2"),
        entry(additivePair, "subject:3"),
        entry(recipeMissingPair, "subject:4"),
        entry(differentSubjectPair, "subject:5"),
      ],
      MANIFEST
    );
    expect(summary.countedEntries).toBe(5);
    // different_subject だけが比較不能。レシピ未登録は比較可能だが分解停止として数える。
    expect(summary.comparablePairCount).toBe(4);
    expect(summary.comparableRate).toBeCloseTo(4 / 10, 12);
    expect(summary.decomposedCount).toBe(3);
    expect(summary.decompositionRateOverall).toBeCloseTo(3 / 10, 12);
    expect(summary.decompositionRateAmongComparable).toBeCloseTo(3 / 4, 12);
    expect(summary.stopReasonCounts).toEqual({ recipe_missing: 1, different_subject: 1 });
  });

  it("同じ対象×同じ手法ペア×同じレシピ版は方向を入れ替えても1件に数える", () => {
    const reversed = pair(productB, productA);
    const summary = summarizeCorpus([entry(fullPair), entry(reversed)], MANIFEST);
    expect(summary.countedEntries).toBe(1);
    expect(summary.duplicatesDropped).toBe(1);
    expect(summary.decomposedCount).toBe(1);
  });

  it("要因別の非ゼロ寄与件数と、寄与合計も非ゼロの件数を数える", () => {
    const summary = summarizeCorpus([entry(fullPair, "subject:1"), entry(partialPair, "subject:2")], MANIFEST);
    expect(summary.nonZeroContributionCountsByFactor).toEqual({ alpha: 2, beta: 2 });
    expect(summary.pairsWithNonZeroExplainedSum).toBe(2);
  });

  it("残差分布を加法は通貨ごと、乗法は対数値として分ける", () => {
    const summary = summarizeCorpus(
      [entry(fullPair, "subject:1"), entry(partialPair, "subject:2"), entry(additivePair, "subject:3", "JPY")],
      MANIFEST
    );
    expect(summary.additiveResidualDistributionByCurrency.JPY.count).toBe(1);
    expect(summary.multiplicativeResidualDistribution?.count).toBe(2);
    expect(summary.multiplicativeResidualDistribution?.max).toBeCloseTo(Math.log(3), 12);
  });

  it("残差比率が表示できない件数と、未分類残差ケース率を出す", () => {
    const summary = summarizeCorpus([entry(fullPair, "subject:1"), entry(partialPair, "subject:2")], MANIFEST);
    // 完全分解は全体差が非ゼロで残差0 → 比率0(nullではない)。部分分解は残差非ゼロで比率あり。
    expect(summary.residualRatioNullCount).toBe(0);
    expect(summary.nonZeroResidualCount).toBe(1);
    // 部分分解は固定差異(損害関数γ)を候補として持つため未分類ではない
    expect(summary.unclassifiedResidualCaseRate).toBe(0);
  });

  it("分母が0の指標は 0% ではなく not_applicable を返す", () => {
    const empty = summarizeCorpus([], { candidatePairCount: 0, primaryEvidence: [], negativeExamples: [] });
    expect(empty.comparableRate).toBe("not_applicable");
    expect(empty.decompositionRateOverall).toBe("not_applicable");
    expect(empty.decompositionRateAmongComparable).toBe("not_applicable");
    expect(empty.unclassifiedResidualCaseRate).toBe("not_applicable");
    expect(empty.multiplicativeResidualDistribution).toBeNull();
    expect(empty.additiveResidualDistributionByCurrency).toEqual({});
  });

  it("停止件数を0扱いにせず、理由別の欠測として残す", () => {
    const summary = summarizeCorpus([entry(recipeMissingPair, "subject:4"), entry(differentSubjectPair, "subject:5")], MANIFEST);
    expect(summary.decomposedCount).toBe(0);
    expect(summary.decompositionRateOverall).toBeCloseTo(0, 12);
    expect(summary.stopReasonCounts.recipe_missing).toBe(1);
    expect(summary.stopReasonCounts.different_subject).toBe(1);
    expect(summary.nonZeroResidualCount).toBe(0);
    expect(summary.unclassifiedResidualCaseRate).toBe("not_applicable");
  });

  it("manifest と許容誤差版をそのまま持ち回る(結果を見る前に固定した母集団を残す)", () => {
    const summary = summarizeCorpus([entry(fullPair)], MANIFEST);
    expect(summary.manifest).toEqual(MANIFEST);
    expect(summary.toleranceVersion).toBe("tol-v1");
  });
});
