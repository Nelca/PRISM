import { describe, expect, it } from "vitest";
import {
  buildPairDiagnostics,
  F3_THRESHOLD_DISABLED_VERSION,
  F8_THRESHOLD_DISABLED_VERSION,
  selectDecompositionMode,
} from "./mode-selection";

const NO_POLICY = { modePolicy: {} };

function select(valueA: number, valueB: number, subsetValues: number[], overrides: { factorCount?: number; preferAdditive?: string } = {}) {
  return selectDecompositionMode({
    valueA,
    valueB,
    subsetValues,
    factorCount: overrides.factorCount ?? 2,
    recipe: overrides.preferAdditive ? { modePolicy: { preferAdditive: { reason: overrides.preferAdditive } } } : NO_POLICY,
  });
}

describe("selectDecompositionMode(§6.3 判定順)", () => {
  it("1. NaN・Infinity は non_finite で停止する(0へ置換しない)", () => {
    expect(select(Number.NaN, 1, [1, 1]).kind).toBe("stop");
    const infinite = select(1, Number.POSITIVE_INFINITY, [1, 1]);
    expect(infinite.kind).toBe("stop");
    if (infinite.kind !== "stop") return;
    expect(infinite.reason).toBe("non_finite");

    const subsetNaN = select(2, 1, [1, Number.NaN, 2]);
    expect(subsetNaN.kind).toBe("stop");
    if (subsetNaN.kind !== "stop") return;
    expect(subsetNaN.reason).toBe("non_finite");
  });

  it("2. 両端の非ゼロ符号が違えば sign_mismatch、中間 v(S) に正負が混在すれば counterfactual_sign_mismatch", () => {
    const ends = select(5, -3, [5, -3]);
    expect(ends.kind).toBe("stop");
    if (ends.kind !== "stop") return;
    expect(ends.reason).toBe("sign_mismatch");

    const middle = select(1, 2, [2, 6, -3, 1]);
    expect(middle.kind).toBe("stop");
    if (middle.kind !== "stop") return;
    expect(middle.reason).toBe("counterfactual_sign_mismatch");
  });

  it("3. 全て正なら乗法、レシピが preferAdditive を宣言していれば理由付きで加法", () => {
    const multiplicative = select(8, 3, [3, 5, 6, 8]);
    expect(multiplicative.kind).toBe("ok");
    if (multiplicative.kind !== "ok") return;
    expect(multiplicative.mode).toBe("multiplicative");

    const additive = select(8, 3, [3, 5, 6, 8], { preferAdditive: "共通の金額差だけが意味を持つ" });
    expect(additive.kind).toBe("ok");
    if (additive.kind !== "ok") return;
    expect(additive.mode).toBe("additive");
    expect(additive.reason).toContain("共通の金額差だけが意味を持つ");
  });

  it("4. ゼロを含む場合と、全て非正で符号の意味が一致する場合は加法(絶対値にしない)", () => {
    const withZero = select(0, 5, [5, 0, 3, 0]);
    expect(withZero.kind).toBe("ok");
    if (withZero.kind !== "ok") return;
    expect(withZero.mode).toBe("additive");

    const negative = select(-5, -2, [-2, -4, -3, -5]);
    expect(negative.kind).toBe("ok");
    if (negative.kind !== "ok") return;
    expect(negative.mode).toBe("additive");
  });

  it("5. 両端0でも有効な F があれば加法を実行し、F が空なら停止する", () => {
    const bothZero = select(0, 0, [0, 10, 0, 0]);
    expect(bothZero.kind).toBe("ok");
    if (bothZero.kind !== "ok") return;
    expect(bothZero.mode).toBe("additive");
    expect(bothZero.reason).toContain("両端が0");

    const noFactors = select(0, 0, [0], { factorCount: 0 });
    expect(noFactors.kind).toBe("stop");
    if (noFactors.kind !== "stop") return;
    expect(noFactors.reason).toBe("no_numerizable_factors");
  });

  it("F-3/F-8 の業務閾値は適用せず、診断値だけを記録する(H-06 未承認)", () => {
    // 桁差 10^-9(旧F-3なら分解中止)・乖離1%未満(旧F-8なら有意乖離なし)でも分解へ進む
    const hugeGap = select(1e9, 1, [1, 1e5, 1e9, 1e9]);
    expect(hugeGap.kind).toBe("ok");
    if (hugeGap.kind !== "ok") return;
    expect(hugeGap.diagnostics.f3ThresholdApplied).toBe(false);
    expect(hugeGap.diagnostics.magnitudeGapRatio).toBeCloseTo(1e-9, 15);

    const tinyDivergence = select(101, 100, [100, 100.5, 101, 101]);
    expect(tinyDivergence.kind).toBe("ok");
    if (tinyDivergence.kind !== "ok") return;
    expect(tinyDivergence.diagnostics.f8ThresholdApplied).toBe(false);
    expect(tinyDivergence.diagnostics.lnRatio).toBeCloseTo(Math.log(1.01), 12);
  });

  it("無効化した閾値の版を定数として公開する(旧runと再計算ハッシュを区別するため)", () => {
    expect(F3_THRESHOLD_DISABLED_VERSION).toBe("f3-disabled-pending-h06");
    expect(F8_THRESHOLD_DISABLED_VERSION).toBe("f8-disabled-pending-h06");
  });
});

describe("buildPairDiagnostics", () => {
  it("両方0なら桁差比は null、片方0なら0、対数比は正値同士のときだけ定義する", () => {
    expect(buildPairDiagnostics(0, 0)).toMatchObject({ magnitudeGapRatio: null, lnRatio: null, absoluteDifference: 0 });
    expect(buildPairDiagnostics(0, 5)).toMatchObject({ magnitudeGapRatio: 0, lnRatio: null, absoluteDifference: -5 });
    const positive = buildPairDiagnostics(8, 2);
    expect(positive.magnitudeGapRatio).toBe(0.25);
    expect(positive.lnRatio).toBeCloseTo(Math.log(4), 12);
    expect(positive.absoluteDifference).toBe(6);
  });

  it("非有限値では絶対差を null にする", () => {
    expect(buildPairDiagnostics(Number.NaN, 1).absoluteDifference).toBeNull();
  });
});
