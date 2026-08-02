import { describe, expect, it } from "vitest";
import { computeShapleyContributions } from "./shapley";
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
