import { describe, expect, it } from "vitest";
import { computeFitnessTier } from "./fitness";

describe("computeFitnessTier", () => {
  it("M3要件定義書§5.2の数値例を再現する(5次元→ティアB)", () => {
    const result = computeFitnessTier({
      ecologicalFit: 0.9,
      socioeconomicFit: 0.6,
      serviceDefinitionFit: 0.8,
      temporalDistance: 0.7,
      spatialScaleFit: 0.75,
    });

    // 要件定義書は「≈0.75」と近似で書いているが、正確な幾何平均は0.7432。
    // 0.5〜0.8の範囲(ティアB)に入ることに変わりはない。
    expect(result.compositeScore).toBeCloseTo(0.7432, 3);
    expect(result.tier).toBe("B");
    expect(result.errorBandCv).toBeCloseTo(0.4, 6);
  });

  it("全次元が1.0ならティアA、誤差幅±20%", () => {
    const result = computeFitnessTier({
      ecologicalFit: 1,
      socioeconomicFit: 1,
      serviceDefinitionFit: 1,
      temporalDistance: 1,
      spatialScaleFit: 1,
    });

    expect(result.compositeScore).toBeCloseTo(1, 6);
    expect(result.tier).toBe("A");
    expect(result.errorBandCv).toBeCloseTo(0.2, 6);
  });

  it("低い次元スコアはティアC、誤差幅±75%になる", () => {
    const result = computeFitnessTier({
      ecologicalFit: 0.3,
      socioeconomicFit: 0.2,
      serviceDefinitionFit: 0.4,
      temporalDistance: 0.3,
      spatialScaleFit: 0.2,
    });

    expect(result.tier).toBe("C");
    expect(result.errorBandCv).toBeCloseTo(0.75, 6);
  });

  it("境界値0.8ちょうどはティアA(閾値は以上)", () => {
    // 5つとも0.8にすると幾何平均も0.8になる
    const result = computeFitnessTier({
      ecologicalFit: 0.8,
      socioeconomicFit: 0.8,
      serviceDefinitionFit: 0.8,
      temporalDistance: 0.8,
      spatialScaleFit: 0.8,
    });

    expect(result.tier).toBe("A");
  });
});
