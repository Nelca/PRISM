import { describe, expect, it } from "vitest";
import { computeShapleyContributions, computeShapleyValues, permutationAverageShapley } from "./shapley";
import { createSeededRng } from "../monetization/rng";
import type { DecompositionFactor } from "../types/divergence";

describe("computeShapleyContributions", () => {
  it("要因が0個ならから配列を返す", () => {
    expect(computeShapleyContributions([], () => 1)).toEqual([]);
  });

  it("要因が1個(k=1)の場合、寄与は単純に ln(v(F)/v(∅))", () => {
    const v = (subset: Set<DecompositionFactor>) => (subset.has("geographicCalibration") ? 3.3 : 3.0);
    const result = computeShapleyContributions(["geographicCalibration"], v);
    expect(result).toHaveLength(1);
    expect(result[0].logContribution).toBeCloseTo(Math.log(3.3 / 3.0), 12);
  });

  it("§4.2.1の数値例(要因間の相互作用なし)を再現する", () => {
    // V_B=3.00億円、エンドポイント被覆×2.10・割引率×1.15・地理較正×1.10、相互作用なし
    const ratios: Record<DecompositionFactor, number> = {
      endpointCoverage: 2.1,
      discountRate: 1.15,
      geographicCalibration: 1.1,
    };
    const factors: DecompositionFactor[] = ["endpointCoverage", "discountRate", "geographicCalibration"];
    const v = (subset: Set<DecompositionFactor>) => {
      let value = 3.0;
      for (const factor of subset) value *= ratios[factor];
      return value;
    };

    const result = computeShapleyContributions(factors, v);
    const byFactor = Object.fromEntries(result.map((r) => [r.factor, r.logContribution]));

    expect(byFactor.endpointCoverage).toBeCloseTo(Math.log(2.1), 9);
    expect(byFactor.discountRate).toBeCloseTo(Math.log(1.15), 9);
    expect(byFactor.geographicCalibration).toBeCloseTo(Math.log(1.1), 9);

    // v(F) = 3.00 * 2.10 * 1.15 * 1.10 ≈ 7.97億円 ≈ V_A(8.00億円)
    expect(v(new Set(factors))).toBeCloseTo(7.9695, 4);
  });

  it("要因間に相互作用がある場合も、6順列(k=2なら2順列)の平均が正しく効く", () => {
    // v(∅)=1, v({X})=2, v({Y})=3, v({X,Y})=8 (独立なら6のはずが8=相互作用あり)
    const factors: DecompositionFactor[] = ["endpointCoverage", "geographicCalibration"];
    const v = (subset: Set<DecompositionFactor>) => {
      const hasX = subset.has("endpointCoverage");
      const hasY = subset.has("geographicCalibration");
      if (hasX && hasY) return 8;
      if (hasX) return 2;
      if (hasY) return 3;
      return 1;
    };

    const result = computeShapleyContributions(factors, v);
    const byFactor = Object.fromEntries(result.map((r) => [r.factor, r.logContribution]));

    // 手計算: c_X = (ln2 + ln(8/3))/2, c_Y = (ln3 + ln4)/2
    expect(byFactor.endpointCoverage).toBeCloseTo((Math.log(2) + Math.log(8 / 3)) / 2, 9);
    expect(byFactor.geographicCalibration).toBeCloseTo((Math.log(3) + Math.log(4)) / 2, 9);

    // 効率性公理: 合計は ln(v(F)/v(∅)) = ln(8) と厳密に一致する
    const sum = result.reduce((total, c) => total + c.logContribution, 0);
    expect(sum).toBeCloseTo(Math.log(8), 9);
  });

  it("v(S)が矛盾している(効率性公理に反する)場合はエラーを投げる", () => {
    // 意図的に非乗法的なv(S)を与え、telescoping結果が矛盾するケースを作る。
    // v({X,Y}) を、X→Yの順とY→Xの順で異なる中間値を経由しても最終的にv(∅)からv(F)への
    // 合計自体はtelescopingにより常に一致するため、公理違反を起こすには
    // 実装のバグを模して直接壊れたcomputeShapleyContributionsの呼び出し経路を作る必要がある。
    // ここではv自体が有効な関数である限りShapleyの数学的性質上必ず一致するため、
    // 代わりに「v(new Set())が呼び出しごとに違う値を返す」壊れた実装を与えて検知できることを確認する。
    let callCount = 0;
    const brokenV = (subset: Set<DecompositionFactor>) => {
      callCount++;
      if (subset.size === 0) return callCount === 1 ? 1 : 999; // 呼び出しごとに違う値を返す壊れた実装
      return 2;
    };

    expect(() => computeShapleyContributions(["endpointCoverage"], brokenV)).toThrow(/F-7/);
  });
});

// ---------------------------------------------------------------------------
// 完成実装 T-07.7:部分集合の重み付き和による Shapley 値
// ---------------------------------------------------------------------------

/** MAX集計の反実仮想。A: x=10,y=2 / B: x=1,y=5。S に入った要因だけAの値を使う。 */
function maxValueOf(subset: readonly string[]): number {
  return Math.max(subset.includes("x") ? 10 : 1, subset.includes("y") ? 2 : 5);
}

const WIDE_BUDGET = { maxFactors: 8, maxEvaluations: 256 };

describe("computeShapleyValues:部分集合の重み付き和", () => {
  it("MAX(相互作用あり)で手計算どおりの寄与を返し、効率性が成り立つ", () => {
    // v(∅)=max(1,5)=5、v({x})=max(10,5)=10、v({y})=max(1,2)=2、v({x,y})=max(10,2)=10
    // φ_x = ((10−5) + (10−2))/2 = 6.5、φ_y = ((2−5) + (10−10))/2 = −1.5、Σ = 5 = v(F)−v(∅)
    const result = computeShapleyValues({
      factorIds: ["x", "y"],
      valueOf: maxValueOf,
      space: "additive",
      budget: WIDE_BUDGET,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.values).toEqual([
      { factorId: "x", value: 6.5 },
      { factorId: "y", value: -1.5 },
    ]);
    expect(result.baseValue).toBe(5);
    expect(result.fullValue).toBe(10);
    // 2^2 = 4 個の部分集合だけを評価する(メモ化により同じSを再評価しない)
    expect(result.evaluationCount).toBe(4);
  });

  it("対数空間で相互作用のある積の寄与を手計算どおりに返す", () => {
    // v(∅)=1, v({x})=2, v({y})=3, v({x,y})=8
    const valueOf = (subset: readonly string[]) => {
      const x = subset.includes("x");
      const y = subset.includes("y");
      if (x && y) return 8;
      if (x) return 2;
      if (y) return 3;
      return 1;
    };
    const result = computeShapleyValues({ factorIds: ["x", "y"], valueOf, space: "log", budget: WIDE_BUDGET });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.values[0].value).toBeCloseTo((Math.log(2) + Math.log(8 / 3)) / 2, 12);
    expect(result.values[1].value).toBeCloseTo((Math.log(3) + Math.log(4)) / 2, 12);
  });

  it("要因の並び順を変えても各要因の寄与は変わらない(順序非依存)", () => {
    const forward = computeShapleyValues({ factorIds: ["x", "y"], valueOf: maxValueOf, space: "additive", budget: WIDE_BUDGET });
    const reversed = computeShapleyValues({ factorIds: ["y", "x"], valueOf: maxValueOf, space: "additive", budget: WIDE_BUDGET });
    expect(forward.kind).toBe("ok");
    expect(reversed.kind).toBe("ok");
    if (forward.kind !== "ok" || reversed.kind !== "ok") return;
    const byId = (values: typeof forward.values) => Object.fromEntries(values.map((v) => [v.factorId, v.value]));
    expect(byId(reversed.values)).toEqual(byId(forward.values));
  });

  it("対称な要因は等しい寄与、v を変えない要因はゼロ寄与になる", () => {
    // v(S) = 2 × 3^|{x,y} ∩ S|。z は v を変えないダミー要因。
    const valueOf = (subset: readonly string[]) =>
      2 * 3 ** [...subset].filter((id) => id === "x" || id === "y").length;
    const result = computeShapleyValues({ factorIds: ["x", "y", "z"], valueOf, space: "log", budget: WIDE_BUDGET });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const byId = Object.fromEntries(result.values.map((v) => [v.factorId, v.value]));
    expect(byId.x).toBeCloseTo(Math.log(3), 12);
    expect(byId.y).toBeCloseTo(Math.log(3), 12);
    expect(byId.z).toBe(0);
    expect(result.evaluationCount).toBe(8);
  });

  it("要因数・評価回数の予算を超えたら例外ではなく budget_exceeded を返す", () => {
    const tight = computeShapleyValues({
      factorIds: ["x", "y", "z"],
      valueOf: () => 1,
      space: "additive",
      budget: { maxFactors: 3, maxEvaluations: 4 },
    });
    expect(tight.kind).toBe("budget_exceeded");
    if (tight.kind !== "budget_exceeded") return;
    expect(tight.requiredEvaluations).toBe(8);

    const tooManyFactors = computeShapleyValues({
      factorIds: ["a", "b", "c", "d", "e"],
      valueOf: () => 1,
      space: "additive",
      budget: { maxFactors: 4, maxEvaluations: 1024 },
    });
    expect(tooManyFactors.kind).toBe("budget_exceeded");
  });

  it("対数空間で非正の v(S)、加法空間で非有限の v(S) は invalid_value を返す(0へ置換しない)", () => {
    const nonPositive = computeShapleyValues({
      factorIds: ["x"],
      valueOf: (subset) => (subset.includes("x") ? 2 : 0),
      space: "log",
      budget: WIDE_BUDGET,
    });
    expect(nonPositive.kind).toBe("invalid_value");

    const nonFinite = computeShapleyValues({
      factorIds: ["x"],
      valueOf: (subset) => (subset.includes("x") ? Number.NaN : 1),
      space: "additive",
      budget: WIDE_BUDGET,
    });
    expect(nonFinite.kind).toBe("invalid_value");
    if (nonFinite.kind !== "invalid_value") return;
    expect(nonFinite.subset).toEqual(["x"]);
  });

  it("効率性が許容誤差内で成立しない場合は例外ではなく efficiency_violation を返す", () => {
    // v(∅)=0.1, v({x})=0.3, v({y})=0.7, v({x,y})=1.1。tol-v1 では通るが、
    // atol=rtol=0 の仮想ポリシーでは倍精度の丸め(約4.4e-16)を吸収できない。
    const valueOf = (subset: readonly string[]) => {
      const x = subset.includes("x");
      const y = subset.includes("y");
      if (x && y) return 1.1;
      if (x) return 0.3;
      if (y) return 0.7;
      return 0.1;
    };
    const ok = computeShapleyValues({ factorIds: ["x", "y"], valueOf, space: "log", budget: WIDE_BUDGET });
    expect(ok.kind).toBe("ok");

    const zeroTolerance = {
      version: "test-zero-tolerance",
      money: { atol: 0, rtol: 0 },
      log: { atol: 0, rtol: 0 },
      ratio: { atol: 0, rtol: 0 },
    };
    const violated = computeShapleyValues({
      factorIds: ["x", "y"],
      valueOf,
      space: "log",
      budget: WIDE_BUDGET,
      tolerance: zeroTolerance,
    });
    expect(violated.kind).toBe("efficiency_violation");
  });

  it("要因が0個なら空配列と v(∅)=v(F) を返す", () => {
    const result = computeShapleyValues({ factorIds: [], valueOf: () => 42, space: "additive", budget: WIDE_BUDGET });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.values).toEqual([]);
    expect(result.baseValue).toBe(42);
    expect(result.fullValue).toBe(42);
  });
});

describe("permutationAverageShapley:全順序平均との一致", () => {
  it("k=2 のMAX(相互作用あり)で部分集合法と一致する", () => {
    const reference = permutationAverageShapley({ factorIds: ["x", "y"], valueOf: maxValueOf, space: "additive" });
    const subsetMethod = computeShapleyValues({ factorIds: ["x", "y"], valueOf: maxValueOf, space: "additive", budget: WIDE_BUDGET });
    expect(subsetMethod.kind).toBe("ok");
    if (subsetMethod.kind !== "ok") return;
    reference.forEach((entry, index) => {
      expect(subsetMethod.values[index].factorId).toBe(entry.factorId);
      expect(subsetMethod.values[index].value).toBeCloseTo(entry.value, 12);
    });
  });

  it("k=3 のMAX・非線形(べき)でも加法・対数の両空間で一致する", () => {
    const aValues: Record<string, number> = { p: 10, q: 2, r: 7 };
    const bValues: Record<string, number> = { p: 1, q: 5, r: 3 };
    const factorIds = ["p", "q", "r"];
    const maxOf = (subset: readonly string[]) =>
      Math.max(...factorIds.map((id) => (subset.includes(id) ? aValues[id] : bValues[id])));
    const nonLinear = (subset: readonly string[]) => maxOf(subset) ** 1.5 + 1;

    for (const [valueOf, space] of [
      [maxOf, "additive"],
      [nonLinear, "additive"],
      [nonLinear, "log"],
    ] as const) {
      const reference = permutationAverageShapley({ factorIds, valueOf, space });
      const subsetMethod = computeShapleyValues({ factorIds, valueOf, space, budget: WIDE_BUDGET });
      expect(subsetMethod.kind).toBe("ok");
      if (subsetMethod.kind !== "ok") return;
      reference.forEach((entry, index) => {
        expect(subsetMethod.values[index].value).toBeCloseTo(entry.value, 10);
      });
    }
  });

  it("seed固定の乱数 v(S) 100件で、全順序平均との一致と効率性が成り立つ(性質テスト)", () => {
    const rng = createSeededRng(20260906);
    const factorIds = ["f1", "f2", "f3"];
    for (let trial = 0; trial < 100; trial++) {
      const table = Array.from({ length: 8 }, () => rng() * 100 + 0.5);
      const valueOf = (subset: readonly string[]) => {
        const mask = factorIds.reduce((acc, id, index) => (subset.includes(id) ? acc | (1 << index) : acc), 0);
        return table[mask];
      };
      const reference = permutationAverageShapley({ factorIds, valueOf, space: "log" });
      const subsetMethod = computeShapleyValues({ factorIds, valueOf, space: "log", budget: WIDE_BUDGET });
      expect(subsetMethod.kind).toBe("ok");
      if (subsetMethod.kind !== "ok") return;
      reference.forEach((entry, index) => {
        expect(subsetMethod.values[index].value).toBeCloseTo(entry.value, 10);
      });
      const sum = subsetMethod.values.reduce((total, value) => total + value.value, 0);
      expect(sum).toBeCloseTo(Math.log(table[7]) - Math.log(table[0]), 10);
    }
  });

  it("要因数が参照実装の上限を超えたら例外にする(参照実装は小さなケース専用)", () => {
    expect(() =>
      permutationAverageShapley({ factorIds: ["a", "b", "c", "d", "e"], valueOf: () => 1, space: "additive" })
    ).toThrow(/参照実装/);
  });
});
