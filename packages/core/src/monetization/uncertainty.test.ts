import { describe, expect, it } from "vitest";
import { combineUncertainty, cvToLognormalSigma } from "./uncertainty";
import type { Distribution } from "../types/common";
import type { TransferFitness } from "../types/valuation";
import { createSeededRng } from "./rng";

describe("cvToLognormalSigma", () => {
  it("CVが小さい場合はsigma≈CV(近似が成立する領域)", () => {
    expect(cvToLognormalSigma(0.2)).toBeCloseTo(0.198, 2);
  });
});

describe("combineUncertainty", () => {
  const noUncertainty: Distribution = { kind: "lognormal", mu: 0, sigma: 0 };
  const notApplicable: TransferFitness = { tier: "not_applicable" };

  it("層i・層iiともに幅がゼロなら中心値がそのまま返る", () => {
    const result = combineUncertainty(1000, noUncertainty, notApplicable, {
      iterations: 100,
      rng: createSeededRng(1),
    });

    expect(result.p5).toBeCloseTo(1000, 6);
    expect(result.p50).toBeCloseTo(1000, 6);
    expect(result.p95).toBeCloseTo(1000, 6);
  });

  it("層iのみ(σ=0.2、tier=not_applicable)の場合、中央値は中心値に近く、レンジは対称的に広がる", () => {
    const parameterUncertainty: Distribution = { kind: "lognormal", mu: 0, sigma: 0.2 };
    const result = combineUncertainty(1000, parameterUncertainty, notApplicable, {
      iterations: 10_000,
      rng: createSeededRng(42),
    });

    expect(result.p50).toBeGreaterThan(900);
    expect(result.p50).toBeLessThan(1100);
    expect(result.p5).toBeLessThan(result.p50);
    expect(result.p50).toBeLessThan(result.p95);
  });

  it("層ii(ティアB、CV=0.4)を追加すると、層iのみのケースよりレンジが広がる", () => {
    const parameterUncertainty: Distribution = { kind: "lognormal", mu: 0, sigma: 0.2 };
    const tierB: TransferFitness = { tier: "B" };

    const withLayerIOnly = combineUncertainty(1000, parameterUncertainty, notApplicable, {
      iterations: 10_000,
      rng: createSeededRng(7),
    });
    const withBothLayers = combineUncertainty(1000, parameterUncertainty, tierB, {
      iterations: 10_000,
      rng: createSeededRng(7),
    });

    const widthLayerIOnly = withLayerIOnly.p95 - withLayerIOnly.p5;
    const widthBothLayers = withBothLayers.p95 - withBothLayers.p5;

    expect(widthBothLayers).toBeGreaterThan(widthLayerIOnly);
  });

  it("同じシードなら同じ結果を返す(再現可能性)", () => {
    const parameterUncertainty: Distribution = { kind: "lognormal", mu: 0, sigma: 0.3 };
    const tierC: TransferFitness = { tier: "C" };

    const first = combineUncertainty(500, parameterUncertainty, tierC, {
      iterations: 1000,
      rng: createSeededRng(123),
    });
    const second = combineUncertainty(500, parameterUncertainty, tierC, {
      iterations: 1000,
      rng: createSeededRng(123),
    });

    expect(first).toEqual(second);
  });
});
