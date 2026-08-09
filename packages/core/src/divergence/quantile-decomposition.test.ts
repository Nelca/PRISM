/**
 * M4 U-3:分位点(レンジの幅)の要因別分解。
 *
 * 最も重要な性質:**中心値の3要因(エンドポイント被覆・割引率・地理較正)は幅を変えない。**
 * それらは対数空間で分布の位置をずらすだけなので、幅の説明には別の要因集合が要る。
 */

import { describe, expect, it } from "vitest";
import { decomposeQuantileRange } from "./quantile-decomposition";
import { IDENTITY_CALIBRATION, makeValuationRecord } from "./test-helpers";
import { cvToLognormalSigma } from "../monetization/uncertainty";
import { errorBandCvForTier } from "../monetization/fitness";

const FITNESS_DIMENSIONS = {
  ecologicalFit: 0.9,
  socioeconomicFit: 0.9,
  serviceDefinitionFit: 0.9,
  temporalDistance: 0.9,
  spatialScaleFit: 0.9,
};

function record(options: { methodId: string; sigma: number; tier: "A" | "B" | "C" | "not_applicable" }) {
  return makeValuationRecord({
    methodId: options.methodId,
    centralValue: 1_000,
    valueConcept: "welfare",
    parameterUncertainty: { kind: "lognormal", mu: 0, sigma: options.sigma },
    transferFitness:
      options.tier === "not_applicable"
        ? { tier: "not_applicable" }
        : { tier: options.tier, dimensions: FITNESS_DIMENSIONS },
  });
}

describe("decomposeQuantileRange", () => {
  it("層iだけが違う場合、幅の差は層iに全部帰属する(ゼロ寄与公理)", () => {
    const a = record({ methodId: "m-a", sigma: 0.4, tier: "not_applicable" });
    const b = record({ methodId: "m-b", sigma: 0.2, tier: "not_applicable" });

    const result = decomposeQuantileRange(a, b);

    expect(result.mode).toBe("multiplicative");
    expect(result.widthRatio).toBeCloseTo(2, 9); // 0.4 / 0.2
    const parameter = result.contributions.find((c) => c.factor === "parameterUncertainty")!;
    const transfer = result.contributions.find((c) => c.factor === "transferError")!;
    expect(parameter.multiplier).toBeCloseTo(2, 9);
    expect(transfer.logContribution).toBe(0); // 差がない要因の寄与は必ず0
  });

  it("層iiだけが違う場合、幅の差は層ii(適合度ティア)に帰属する", () => {
    const a = record({ methodId: "m-a", sigma: 0.2, tier: "C" });
    const b = record({ methodId: "m-b", sigma: 0.2, tier: "A" });

    const result = decomposeQuantileRange(a, b);
    const transfer = result.contributions.find((c) => c.factor === "transferError")!;
    const parameter = result.contributions.find((c) => c.factor === "parameterUncertainty")!;

    // ティアCの方が誤差幅が広い(M3 D-5:C=±75%、A=±20%)ため、幅は広がる方向
    expect(transfer.logContribution).toBeGreaterThan(0);
    expect(parameter.logContribution).toBe(0);
    expect(result.widthRatio!).toBeGreaterThan(1);
  });

  it("効率性公理:寄与の積が幅の比に一致する(残差ゼロ)", () => {
    const a = record({ methodId: "m-a", sigma: 0.5, tier: "C" });
    const b = record({ methodId: "m-b", sigma: 0.15, tier: "B" });

    const result = decomposeQuantileRange(a, b);
    const product = result.contributions.reduce((acc, c) => acc * c.multiplier, 1);

    expect(product).toBeCloseTo(result.widthRatio!, 9);
  });

  it("計算値が理論式(√(σi²+σii²)の比)と一致する", () => {
    const a = record({ methodId: "m-a", sigma: 0.3, tier: "B" });
    const b = record({ methodId: "m-b", sigma: 0.1, tier: "A" });

    const sigmaA = Math.sqrt(0.3 ** 2 + cvToLognormalSigma(errorBandCvForTier("B")) ** 2);
    const sigmaB = Math.sqrt(0.1 ** 2 + cvToLognormalSigma(errorBandCvForTier("A")) ** 2);

    expect(decomposeQuantileRange(a, b).widthRatio).toBeCloseTo(sigmaA / sigmaB, 9);
  });

  it("不確実性がゼロの手法が含まれる場合、分解せず理由を返す(微小値で埋めない)", () => {
    const a = record({ methodId: "m-a", sigma: 0.3, tier: "not_applicable" });
    const zero = record({ methodId: "m-zero", sigma: 0, tier: "not_applicable" });

    const result = decomposeQuantileRange(a, zero);

    expect(result.mode).toBe("not_decomposed");
    expect(result.widthRatio).toBeNull();
    expect(result.contributions).toEqual([]);
    expect(result.notDecomposedReason).toContain("幅がありません");
  });

  it("中心値の3要因(地理較正等)は幅に影響しない —— このモジュールが必要な理由", () => {
    // 較正パラメータだけが違う2レコード。中心値の分解では地理較正要因が立つが、
    // 幅の比は1.0(=違いなし)になる。
    const calibrated = makeValuationRecord({
      methodId: "m-calibrated",
      centralValue: 2_000,
      valueConcept: "welfare",
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.25 },
      transferFitness: { tier: "not_applicable" },
      geographicCalibration: { ...IDENTITY_CALIBRATION, pppValue: 2 },
    });
    const plain = record({ methodId: "m-plain", sigma: 0.25, tier: "not_applicable" });

    const result = decomposeQuantileRange(calibrated, plain);

    expect(result.widthRatio).toBeCloseTo(1, 9);
    for (const contribution of result.contributions) {
      expect(contribution.logContribution).toBe(0);
    }
  });
});
