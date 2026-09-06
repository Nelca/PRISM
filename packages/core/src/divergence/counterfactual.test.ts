import { describe, expect, it } from "vitest";
import { evaluateSubsets } from "./counterfactual";
import { createTestRegistry } from "./recipes/registry";
import {
  makeSyntheticTrace,
  SYNTHETIC_BUDGET_EXCEEDED,
  SYNTHETIC_EXCLUDED_FACTOR,
  SYNTHETIC_MAX_PARTIAL,
  SYNTHETIC_ORDER_DEPENDENT,
  SYNTHETIC_PRODUCT_FULL,
} from "./recipes/synthetic-interaction";

const registry = createTestRegistry();
const PRODUCT_FULL = registry.register(SYNTHETIC_PRODUCT_FULL);
const BUDGET = registry.register(SYNTHETIC_BUDGET_EXCEEDED);
const MAX_PARTIAL = registry.register(SYNTHETIC_MAX_PARTIAL);
const ORDER_DEPENDENT = registry.register(SYNTHETIC_ORDER_DEPENDENT);
const EXCLUDED = registry.register(SYNTHETIC_EXCLUDED_FACTOR);

/** V_A = 1×3×2×1 = 6、V_B = 1×1×1×1 = 1。v({alpha}) = 3、v({beta}) = 2。 */
const productA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
const productB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });

describe("evaluateSubsets(§6.2 真正な反実仮想)", () => {
  it("v(∅) = V_B、v(F) = V* を実式の再実行から得る", () => {
    const result = evaluateSubsets({ recipe: PRODUCT_FULL, traceA: productA, traceB: productB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseValue).toBe(productB.finalValue.value);
    expect(result.baseValue).toBe(1);
    expect(result.fullValue).toBe(6);
    expect(result.valueOf(["alpha"])).toBe(3);
    expect(result.valueOf(["beta"])).toBe(2);
    expect(result.evaluationCount).toBe(4);
    expect(result.excludedFactors).toEqual([]);
  });

  it("各部分集合について差し替え内容・固定した要因・トレースハッシュを保存する", () => {
    const result = evaluateSubsets({ recipe: PRODUCT_FULL, traceA: productA, traceB: productB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const empty = result.evaluations.find((evaluation) => evaluation.subset.length === 0)!;
    expect(empty.fixed).toEqual(["alpha", "beta"]);
    expect(empty.swapped).toEqual([]);
    expect(empty.traceHash).toBe(productB.hash);

    const alphaOnly = result.evaluations.find((evaluation) => evaluation.subset.join() === "alpha")!;
    expect(alphaOnly.fixed).toEqual(["beta"]);
    expect(alphaOnly.swapped).toHaveLength(1);
    expect(alphaOnly.swapped[0]).toMatchObject({ stepId: "alpha", settingKey: "alpha" });
    expect(alphaOnly.swapped[0].from.value).toBe(1);
    expect(alphaOnly.swapped[0].to.value).toBe(3);
    expect(new Set(result.evaluations.map((evaluation) => evaluation.traceHash)).size).toBe(4);
  });

  it("逆方向は v_reverse(S) = v_forward(F∖S) になる(共通の固定モデルを持つレシピ)", () => {
    const forward = evaluateSubsets({ recipe: PRODUCT_FULL, traceA: productA, traceB: productB });
    const reverse = evaluateSubsets({ recipe: PRODUCT_FULL, traceA: productA, traceB: productB, direction: "A_to_B" });
    expect(forward.ok && reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(reverse.valueOf([])).toBe(forward.valueOf(["alpha", "beta"]));
    expect(reverse.valueOf(["alpha", "beta"])).toBe(forward.valueOf([]));
    expect(reverse.valueOf(["alpha"])).toBe(forward.valueOf(["beta"]));
  });

  it("MAX集計でも相互作用を保ったまま全部分集合を再実行する(V* は V_A と一致しない部分分解)", () => {
    // v(S) = q × max(α_S, β_S) × γ_B。A: α=10,β=2,γ=2 / B: α=1,β=5,γ=1、q=1。γ は基準側に固定。
    const maxA = makeSyntheticTrace({ methodId: "synthetic-max-a", shape: "max", quantity: 1, alpha: 10, beta: 2, gamma: 2 });
    const maxB = makeSyntheticTrace({ methodId: "synthetic-max-b", shape: "max", quantity: 1, alpha: 1, beta: 5, gamma: 1 });
    const result = evaluateSubsets({ recipe: MAX_PARTIAL, traceA: maxA, traceB: maxB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseValue).toBe(5); // max(1,5) × 1
    expect(result.valueOf(["alpha"])).toBe(10); // max(10,5) × 1
    expect(result.valueOf(["beta"])).toBe(2); // max(1,2) × 1
    expect(result.fullValue).toBe(10); // max(10,2) × 1
    // 到達値 V*(10)は V_A(1 × max(10,2) × 2 = 20)と一致しない。部分分解として扱う。
    expect(maxA.finalValue.value).toBe(20);
    // 順序非依存の検証は |S| ≥ 2 の1件だけ実行される
    expect(result.orderCheckCount).toBe(1);
  });

  it("MAX集計でも要因の適用順で値が変わらない(順序非依存)", () => {
    const maxA = makeSyntheticTrace({ methodId: "synthetic-max-a", shape: "max", quantity: 1, alpha: 10, beta: 2, gamma: 2 });
    const maxB = makeSyntheticTrace({ methodId: "synthetic-max-b", shape: "max", quantity: 1, alpha: 1, beta: 5, gamma: 1 });
    const forward = evaluateSubsets({ recipe: MAX_PARTIAL, traceA: maxA, traceB: maxB });
    const reordered = evaluateSubsets({
      recipe: { ...MAX_PARTIAL, factors: [...MAX_PARTIAL.factors].reverse() },
      traceA: maxA,
      traceB: maxB,
    });
    expect(forward.ok && reordered.ok).toBe(true);
    if (!forward.ok || !reordered.ok) return;
    for (const subset of [[], ["alpha"], ["beta"], ["alpha", "beta"]]) {
      expect(reordered.valueOf(subset)).toBe(forward.valueOf(subset));
    }
  });

  it("swap が定義できない要因は F から外し、理由と不足データを残す(部分分解へ縮退)", () => {
    const exclA = makeSyntheticTrace({ methodId: "synthetic-excl-a", shape: "product", quantity: 1, alpha: 2, beta: 3, gamma: 1 });
    const exclB = makeSyntheticTrace({ methodId: "synthetic-excl-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const result = evaluateSubsets({ recipe: EXCLUDED, traceA: exclA, traceB: exclB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factorIds).toEqual(["alpha"]);
    expect(result.excludedFactors).toHaveLength(1);
    expect(result.excludedFactors[0]).toMatchObject({ factorId: "epsilon", reasonKind: "swap_failed" });
    expect(result.excludedFactors[0].missingData.length).toBeGreaterThan(0);
    // V* = v({alpha}) = 1×2×1×1 = 2(β=3 は基準側に固定されたまま)
    expect(result.fullValue).toBe(2);
  });

  it("全要因が縮小されたら no_numerizable_factors で停止する(数値分解成功としない)", () => {
    const exclA = makeSyntheticTrace({ methodId: "synthetic-excl-a", shape: "product", quantity: 1, alpha: 2, beta: 3, gamma: 1 });
    const exclB = makeSyntheticTrace({ methodId: "synthetic-excl-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const onlyFailing = { ...EXCLUDED, factors: EXCLUDED.factors.filter((factor) => factor.id === "epsilon") };
    const result = evaluateSubsets({ recipe: onlyFailing, traceA: exclA, traceB: exclB });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_numerizable_factors");
    expect(result.excludedFactors.map((factor) => factor.factorId)).toEqual(["epsilon"]);
  });

  it("同じ設定キーを奪い合う要因は順序依存として検出し、宣言順の末尾を除外する", () => {
    const orderA = makeSyntheticTrace({ methodId: "synthetic-order-a", shape: "product", quantity: 1, alpha: 3, beta: 1, gamma: 1 });
    const orderB = makeSyntheticTrace({ methodId: "synthetic-order-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    const result = evaluateSubsets({ recipe: ORDER_DEPENDENT, traceA: orderA, traceB: orderB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factorIds).toEqual(["alpha_direct"]);
    expect(result.excludedFactors[0]).toMatchObject({ factorId: "alpha_scaled", reasonKind: "order_dependent_combination" });
    expect(result.excludedFactors[0].reason).toContain("組合せで意味を失います");
  });

  it("評価回数の予算を超えたら例外ではなく budget_exceeded を返す(要因を勝手に削らない)", () => {
    const budgetA = makeSyntheticTrace({ methodId: "synthetic-budget-a", shape: "product", quantity: 1, alpha: 2, beta: 3, delta: 5, gamma: 1 });
    const budgetB = makeSyntheticTrace({ methodId: "synthetic-budget-b", shape: "product", quantity: 1, alpha: 1, beta: 1, delta: 1, gamma: 1 });
    const result = evaluateSubsets({ recipe: BUDGET, traceA: budgetA, traceB: budgetB });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("budget_exceeded");
    expect(result.detail).toContain("8");
    expect(result.excludedFactors).toEqual([]);
  });

  it("評価済み以外の部分集合を参照したら例外にする(未定義の v(S) を作らない)", () => {
    const result = evaluateSubsets({ recipe: PRODUCT_FULL, traceA: productA, traceB: productB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => result.valueOf(["gamma"])).toThrow(/未評価/);
  });
});
