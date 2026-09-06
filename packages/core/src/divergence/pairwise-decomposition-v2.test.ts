import { describe, expect, it } from "vitest";
import { buildPairwiseDecompositionV2, DivergenceVersionMismatchError, RESIDUAL_DOMINANCE_RATIO } from "./pairwise-decomposition-v2";
import { createTestRegistry } from "./recipes/registry";
import { makeSyntheticTrace, SYNTHETIC_EVIDENCE, SYNTHETIC_RECIPES } from "./recipes/synthetic-interaction";
import { makeComparisonSubject, makeValuationRecord, TEST_DECOMPOSITION_VERSIONS_V2, type ValuationRecordFixtureOptions } from "./test-helpers";
import type { MethodEvaluationTrace } from "../types/trace";
import type { ZeroMeaning } from "../types/comparison";
import type { ValuationRecord } from "../types/valuation";

const registry = createTestRegistry();
for (const recipe of SYNTHETIC_RECIPES) registry.register(recipe);

const subject = makeComparisonSubject();
const versions = TEST_DECOMPOSITION_VERSIONS_V2;

const COMPUTED_ZERO: ZeroMeaning = {
  code: "computed_zero",
  candidates: ["computed_zero"],
  evidence: SYNTHETIC_EVIDENCE,
  rationale: "規則4:自社の計算で入力0から0になった。",
  assignedBy: "method_adapter",
};

function record(trace: MethodEvaluationTrace, overrides: Partial<ValuationRecordFixtureOptions> = {}): ValuationRecord {
  const options: ValuationRecordFixtureOptions = {
    methodId: trace.methodId,
    centralValue: trace.finalValue.value,
    trace,
    id: `vr-${trace.methodId}-${trace.hash.slice(-6)}`,
    ...overrides,
  };
  return options.valueConcept === "exchange"
    ? makeValuationRecord({ ...options, valueConcept: "exchange" })
    : makeValuationRecord({ ...options, valueConcept: "welfare" });
}

function build(recordA: ValuationRecord, recordB: ValuationRecord, overrides: Partial<Parameters<typeof buildPairwiseDecompositionV2>[0]> = {}) {
  return buildPairwiseDecompositionV2({ recordA, recordB, subject, registry, versions, ...overrides });
}

describe("buildPairwiseDecompositionV2:完全分解(乗法)", () => {
  // V_A = 1×3×2×1 = 6、V_B = 1×1×1×1 = 1。v({α})=3、v({β})=2、v(F)=6=V_A。
  const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
  const traceB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
  const pair = build(record(traceA), record(traceB));

  it("v(∅)=V_B・v(F)=V*=V_A を満たし、完全分解として返す", () => {
    expect(pair.status).toBe("decomposed");
    if (pair.status !== "decomposed") return;
    expect(pair.mode).toBe("multiplicative");
    expect(pair.kind).toBe("full");
    expect(pair.baseline).toBe("B");
    expect(pair.direction).toBe("B_to_A");
    expect(pair.valueB).toBe(1);
    expect(pair.vStar).toBe(6);
    expect(pair.valueA).toBe(6);
    expect(pair.subsets).toHaveLength(4);
    expect(pair.subsets.find((subset) => subset.subset.length === 0)?.value).toBe(1);
  });

  it("寄与は手計算どおりで、効率性 Σc_i = ln V* − ln V_B が成り立つ", () => {
    if (pair.status !== "decomposed") return;
    const byId = Object.fromEntries(pair.contributions.map((contribution) => [contribution.factorId, contribution]));
    expect(byId.alpha.shapley).toBeCloseTo(Math.log(3), 12);
    expect(byId.beta.shapley).toBeCloseTo(Math.log(2), 12);
    expect(byId.alpha.displayMultiplier).toBeCloseTo(3, 12);
    expect(byId.alpha.displayAmount).toBeNull();
    expect(pair.explainedSum).toBeCloseTo(Math.log(6), 12);
    expect(pair.explainedSum).toBeCloseTo(Math.log(pair.vStar) - Math.log(pair.valueB), 12);
    expect(pair.totalDifference).toBeCloseTo(Math.log(6), 12);
  });

  it("完全分解では残差がゼロになり、代表値選択を含意する", () => {
    if (pair.status !== "decomposed") return;
    expect(pair.residual.value).toBeCloseTo(0, 12);
    expect(pair.residual.unclassified).toBe(false);
    expect(pair.implication.kind).toBe("representative_choice");
    expect(pair.narrative).toContain("結論:");
    expect(pair.narrative).toContain("意思決定への含意:");
  });

  it("逆方向互換レシピでは寄与が符号反転する", () => {
    if (pair.status !== "decomposed") return;
    expect(pair.reverse.defined).toBe(true);
    if (!pair.reverse.defined) return;
    const forward = Object.fromEntries(pair.contributions.map((contribution) => [contribution.factorId, contribution.shapley]));
    for (const contribution of pair.reverse.contributions) {
      expect(contribution.shapley).toBeCloseTo(-forward[contribution.factorId], 12);
    }
    expect(pair.reverse.vStar).toBe(1);
  });

  it("A/Bを入れ替えて渡してもレシピの向きへ揃え、基準側Bを捏造しない", () => {
    const swapped = build(record(traceB), record(traceA));
    expect(swapped.status).toBe("decomposed");
    if (swapped.status !== "decomposed") return;
    expect(swapped.methodIdA).toBe("synthetic-product-a");
    expect(swapped.methodIdB).toBe("synthetic-product-b");
    expect(swapped.valueB).toBe(1);
  });

  it("版の宣言が実際に使う版と食い違えば構成エラーとして拒否する", () => {
    expect(() => build(record(traceA), record(traceB), { versions: { ...versions, toleranceVersion: "tol-v0" } })).toThrow(
      DivergenceVersionMismatchError
    );
    expect(() => build(record(traceA), record(traceB), { versions: { ...versions, recipeRegistryVersion: "other" } })).toThrow(
      DivergenceVersionMismatchError
    );
  });
});

describe("buildPairwiseDecompositionV2:部分分解(MAX相互作用)", () => {
  // v(∅)=max(1,5)×1=5、v({α})=10、v({β})=2、V*=10。V_A = max(10,2)×3 = 30(γ は基準側に固定)。
  const traceA = makeSyntheticTrace({ methodId: "synthetic-max-a", shape: "max", quantity: 1, alpha: 10, beta: 2, gamma: 3 });
  const traceB = makeSyntheticTrace({ methodId: "synthetic-max-b", shape: "max", quantity: 1, alpha: 1, beta: 5, gamma: 1 });
  const pair = build(record(traceA), record(traceB));

  it("V* は V_A と一致せず、寄与+残差が全体差を復元する", () => {
    expect(pair.status).toBe("decomposed");
    if (pair.status !== "decomposed") return;
    expect(pair.kind).toBe("partial");
    expect(pair.valueA).toBe(30);
    expect(pair.vStar).toBe(10);
    // c_α = (ln(10/5) + ln(10/2))/2 = ln10/2、c_β = (ln(2/5) + ln(10/10))/2 = ln(2/5)/2
    const byId = Object.fromEntries(pair.contributions.map((contribution) => [contribution.factorId, contribution.shapley]));
    expect(byId.alpha).toBeCloseTo(Math.log(10) / 2, 12);
    expect(byId.beta).toBeCloseTo(Math.log(0.4) / 2, 12);
    expect(pair.explainedSum).toBeCloseTo(Math.log(2), 12);
    expect(pair.residual.value).toBeCloseTo(Math.log(3), 12);
    expect(pair.explainedSum + pair.residual.value).toBeCloseTo(pair.totalDifference, 12);
  });

  it("固定したモデル差を既知の定性差異として並置し、金額を割り当てない", () => {
    if (pair.status !== "decomposed") return;
    expect(pair.residual.knownUnquantified).toHaveLength(1);
    expect(pair.residual.unclassified).toBe(false);
    expect(pair.residual.nextActions.map((action) => action.item)).toEqual(["損害関数γの公開式"]);
    expect(pair.narrative).toContain("金額は割り当てていません");
  });

  it("寄与と残差の符号が混在すれば残差比率を表示せず、追加調査を含意する", () => {
    if (pair.status !== "decomposed") return;
    // c_α = +ln10/2、c_β = −ln(2.5)/2、残差 = +ln3 で非ゼロ項の符号が混在する
    expect(pair.residual.ratio).toBeNull();
    expect(pair.residual.ratioUnavailableReason).toBe("mixed_signs");
    expect(pair.contributions.every((contribution) => contribution.shareRatio === null)).toBe(true);
    expect(pair.implication.kind).toBe("additional_investigation");
  });

  it("残差比率が表示できる場合は支配的かどうかで含意を分ける", () => {
    // 同符号にするため β も A 側を大きくする。v(∅)=5、v({α})=10、v({β})=8、V*=10、V_A=30。
    const sameSignA = makeSyntheticTrace({ methodId: "synthetic-max-a", shape: "max", quantity: 1, alpha: 10, beta: 8, gamma: 3 });
    const sameSignPair = build(record(sameSignA), record(traceB));
    expect(sameSignPair.status).toBe("decomposed");
    if (sameSignPair.status !== "decomposed") return;
    expect(sameSignPair.residual.ratio).not.toBeNull();
    // r = ln3、全体差 = ln6 → 比率 ≈ 0.613 > 0.5
    expect(sameSignPair.residual.ratio).toBeCloseTo(Math.log(3) / Math.log(6), 12);
    expect(Math.abs(sameSignPair.residual.ratio ?? 0)).toBeGreaterThan(RESIDUAL_DOMINANCE_RATIO);
    expect(sameSignPair.implication.kind).toBe("additional_investigation");
  });

  it("逆方向互換でないレシピでは逆方向を作らず、理由を出す", () => {
    if (pair.status !== "decomposed") return;
    expect(pair.reverse.defined).toBe(false);
    if (pair.reverse.defined) return;
    expect(pair.reverse.reason).toContain("逆方向互換条件");
  });
});

describe("buildPairwiseDecompositionV2:加法(ゼロ・負値・相殺)", () => {
  it("同符号の負値は絶対値へ変換せず符号付き金額で分解する", () => {
    // V_A = −3 + −2 = −5、V_B = −1 + −1 = −2。v({α}) = −4、v({β}) = −3。
    const traceA = makeSyntheticTrace({ methodId: "synthetic-sum-a", shape: "sum", quantity: 1, alpha: -3, beta: -2, gamma: 0 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-sum-b", shape: "sum", quantity: 1, alpha: -1, beta: -1, gamma: 0 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("decomposed");
    if (pair.status !== "decomposed") return;
    expect(pair.mode).toBe("additive");
    expect(pair.valueA).toBe(-5);
    expect(pair.valueB).toBe(-2);
    const byId = Object.fromEntries(pair.contributions.map((contribution) => [contribution.factorId, contribution]));
    expect(byId.alpha.shapley).toBeCloseTo(-2, 12);
    expect(byId.beta.shapley).toBeCloseTo(-1, 12);
    expect(byId.alpha.displayAmount).toBeCloseTo(-2, 12);
    expect(byId.alpha.displayMultiplier).toBeNull();
    expect(pair.residual.value).toBeCloseTo(0, 12);
  });

  it("両端が0でも有効なFがあれば加法分解し、相殺を保持したまま割合を表示しない", () => {
    // V_A = 1×10×0×1 = 0、V_B = 1×0×1×1 = 0。v({α}) = 10、v({β}) = 0。φ_α=+5、φ_β=−5。
    const traceA = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      shape: "product",
      quantity: 1,
      alpha: 10,
      beta: 0,
      gamma: 1,
      zeroMeaning: COMPUTED_ZERO,
    });
    const traceB = makeSyntheticTrace({
      methodId: "synthetic-product-b",
      shape: "product",
      quantity: 1,
      alpha: 0,
      beta: 1,
      gamma: 1,
      zeroMeaning: COMPUTED_ZERO,
    });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("decomposed");
    if (pair.status !== "decomposed") return;
    expect(pair.mode).toBe("additive");
    expect(pair.valueA).toBe(0);
    expect(pair.valueB).toBe(0);
    const byId = Object.fromEntries(pair.contributions.map((contribution) => [contribution.factorId, contribution]));
    expect(byId.alpha.shapley).toBeCloseTo(5, 12);
    expect(byId.beta.shapley).toBeCloseTo(-5, 12);
    expect(byId.alpha.isZero).toBe(false);
    expect(pair.explainedSum).toBeCloseTo(0, 12);
    expect(pair.residual.ratio).toBeNull();
    expect(pair.residual.ratioUnavailableReason).toBe("total_difference_within_tolerance");
    expect(pair.contributions.every((contribution) => contribution.shareRatio === null)).toBe(true);
    expect(pair.zeroMeaningA?.code).toBe("computed_zero");
    expect(pair.zeroMeaningB?.code).toBe("computed_zero");
    expect(pair.reverse.defined).toBe(true);
  });

  it("値が0でもゼロ意味が無ければ停止し、不足データとして出典を要求する", () => {
    const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 0, beta: 1, gamma: 1 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("trace_insufficient");
    expect(pair.missingData[0].item).toContain("ゼロ意味の出典");
    expect(pair.implication.kind).toBe("additional_investigation");
  });
});

describe("buildPairwiseDecompositionV2:停止条件", () => {
  const okB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });

  it("比較対象が違えば different_subject で止まり、比較不能を含意する", () => {
    const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
    const pair = build(record(traceA), record(okB), {
      subjectA: makeComparisonSubject(),
      subjectB: makeComparisonSubject({ flow: { kind: "water", waterSource: "ground", waterUse: "consumption" } }),
    });
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("different_subject");
    expect(pair.implication.kind).toBe("not_comparable");
    expect(pair.subjectIdentity?.kind).toBe("different_subject");
  });

  it("価値概念が違えば value_concept_mismatch で止まる", () => {
    const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
    const pair = build(record(traceA, { valueConcept: "exchange" }), record(okB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("value_concept_mismatch");
    expect(pair.implication.kind).toBe("not_comparable");
  });

  it("両端の符号が違えば sign_mismatch で止まる", () => {
    const positive = makeSyntheticTrace({ methodId: "synthetic-sum-a", shape: "sum", quantity: 1, alpha: 1, beta: 1, gamma: 0 });
    const negative = makeSyntheticTrace({ methodId: "synthetic-sum-b", shape: "sum", quantity: 1, alpha: -1, beta: -1, gamma: 0 });
    const pair = build(record(positive), record(negative));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("sign_mismatch");
    expect(pair.implication.kind).toBe("not_comparable");
  });

  it("中間 v(S) に正負が混在すれば counterfactual_sign_mismatch で止まる", () => {
    // V_A = 5 + (−4) = 1、V_B = 1 + 1 = 2。v({α}) = 5+1 = 6、v({β}) = 1+(−4) = −3。
    const traceA = makeSyntheticTrace({ methodId: "synthetic-sum-a", shape: "sum", quantity: 1, alpha: 5, beta: -4, gamma: 0 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-sum-b", shape: "sum", quantity: 1, alpha: 1, beta: 1, gamma: 0 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("counterfactual_sign_mismatch");
    expect(pair.implication.kind).toBe("not_comparable");
  });

  it("非有限の最終値は non_finite で止まる(0へ置換しない)", () => {
    const base = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
    const tampered: MethodEvaluationTrace = { ...base, finalValue: { ...base.finalValue, value: Number.POSITIVE_INFINITY } };
    const pair = build(record(tampered), record(okB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("non_finite");
  });

  it("レシピ未登録・版レンジ外は recipe_missing で止まる(自動推定で比較しない)", () => {
    const unknownA = makeSyntheticTrace({ methodId: "unregistered-method", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
    const unknown = build(record(unknownA), record(okB));
    expect(unknown.status).toBe("stopped");
    if (unknown.status !== "stopped") return;
    expect(unknown.reason).toBe("recipe_missing");

    const newerA = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      methodVersion: "2.0.0",
      shape: "product",
      quantity: 1,
      alpha: 3,
      beta: 2,
      gamma: 1,
    });
    const outOfRange = build(record(newerA, { methodVersion: "2.0.0" }), record(okB));
    expect(outOfRange.status).toBe("stopped");
    if (outOfRange.status !== "stopped") return;
    expect(outOfRange.reason).toBe("recipe_missing");
  });

  it("レビュー状態が draft のレシピは recipe_not_registrable で止まる", () => {
    const traceA = makeSyntheticTrace({ methodId: "synthetic-draft-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-draft-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("recipe_not_registrable");
    expect(pair.recipe?.reviewStatus).toBe("draft");
  });

  it("トレースが無ければ trace_insufficient で止まる(旧runの読出し)", () => {
    const legacy = makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 6 });
    const pair = build(legacy, record(okB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("trace_insufficient");
    expect(pair.valueA).toBe(6);
  });

  it("評価回数の予算を超えれば budget_exceeded で止まる", () => {
    const traceA = makeSyntheticTrace({ methodId: "synthetic-budget-a", shape: "product", quantity: 1, alpha: 2, beta: 3, delta: 5, gamma: 1 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-budget-b", shape: "product", quantity: 1, alpha: 1, beta: 1, delta: 1, gamma: 1 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("budget_exceeded");
    expect(pair.implication.kind).toBe("additional_investigation");
  });

  it("完全分解を宣言したレシピで V* ≠ V_A なら停止する(部分分解へ自動変更しない)", () => {
    // sum レシピは完全分解を宣言している。γ が両側で違うと V*(5)は V_A(10)へ届かない。
    const traceA = makeSyntheticTrace({ methodId: "synthetic-sum-a", shape: "sum", quantity: 1, alpha: 3, beta: 2, gamma: 5 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-sum-b", shape: "sum", quantity: 1, alpha: 1, beta: 1, gamma: 0 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("stopped");
    if (pair.status !== "stopped") return;
    expect(pair.reason).toBe("full_decomposition_endpoint_mismatch");
  });
});

describe("buildPairwiseDecompositionV2:要因の縮小", () => {
  it("反実仮想を定義できない要因を除外して部分分解を返し、除外理由を残す", () => {
    // V_A = 1×2×3×1 = 6、V_B = 1。alpha だけ差し替え可能なので V* = 2。
    const traceA = makeSyntheticTrace({ methodId: "synthetic-excl-a", shape: "product", quantity: 1, alpha: 2, beta: 3, gamma: 1 });
    const traceB = makeSyntheticTrace({ methodId: "synthetic-excl-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const pair = build(record(traceA), record(traceB));
    expect(pair.status).toBe("decomposed");
    if (pair.status !== "decomposed") return;
    expect(pair.contributions.map((contribution) => contribution.factorId)).toEqual(["alpha"]);
    expect(pair.vStar).toBe(2);
    expect(pair.residual.value).toBeCloseTo(Math.log(3), 12);
    expect(pair.residual.knownUnquantified.map((difference) => difference.description).join(" ")).toContain("疫学モデルε");
    expect(pair.residual.unclassified).toBe(false);
    expect(pair.qualitativeDifferences).toHaveLength(1);
    expect(pair.evaluationCount).toBe(2);
  });
});
