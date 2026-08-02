import { describe, expect, it } from "vitest";
import {
  classifyDiscountRate,
  classifyEndpointCoverage,
  classifyGeographicCalibration,
  InconsistentDiscountRateStatusError,
} from "./factor-recalculation";
import { IDENTITY_CALIBRATION, makeValuationRecord } from "./test-helpers";

describe("classifyGeographicCalibration", () => {
  it("較正パラメータが同一ならゼロ寄与", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100 });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300 });
    expect(classifyGeographicCalibration(a, b)).toEqual({ factor: "geographicCalibration", kind: "zero" });
  });

  it("較正パラメータが異なれば再計算可能(実際の倍率比を返す)", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      geographicCalibration: { ...IDENTITY_CALIBRATION, pppValue: 1.1 },
    });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300 });

    const result = classifyGeographicCalibration(a, b);
    expect(result.kind).toBe("recalculable");
    if (result.kind === "recalculable") {
      expect(result.ratio).toBeCloseTo(1.1, 9);
    }
  });
});

describe("classifyDiscountRate", () => {
  it("両方no_time_dimensionならF-5a(ゼロ寄与)", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100, discountRateStatus: "no_time_dimension" });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300, discountRateStatus: "no_time_dimension" });
    expect(classifyDiscountRate(a, b)).toEqual({ factor: "discountRate", kind: "zero" });
  });

  it("片方のみno_time_dimensionならF-5c(再計算不能)", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      discountRateStatus: "explicit",
      discountRate: 0.02,
    });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300, discountRateStatus: "no_time_dimension" });

    const result = classifyDiscountRate(a, b);
    expect(result.kind).toBe("not_recalculable");
    if (result.kind === "not_recalculable") {
      expect(result.fallback).toBe("F-5c");
    }
  });

  it("両方explicitで値が同じならゼロ寄与", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      discountRateStatus: "explicit",
      discountRate: 0.02,
    });
    const b = makeValuationRecord({
      methodId: "b",
      centralValue: 300,
      discountRateStatus: "explicit",
      discountRate: 0.02,
    });
    expect(classifyDiscountRate(a, b)).toEqual({ factor: "discountRate", kind: "zero" });
  });

  it("両方explicitで値が異なる場合は再計算式がないためnot_recalculable", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      discountRateStatus: "explicit",
      discountRate: 0.02,
    });
    const b = makeValuationRecord({
      methodId: "b",
      centralValue: 300,
      discountRateStatus: "explicit",
      discountRate: 0.03,
    });

    const result = classifyDiscountRate(a, b);
    expect(result.kind).toBe("not_recalculable");
  });

  it("discountRateStatusがexplicitなのにdiscountRateがnullの矛盾したデータはエラーを投げる", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      discountRateStatus: "explicit",
      discountRate: null,
    });
    const b = makeValuationRecord({
      methodId: "b",
      centralValue: 300,
      discountRateStatus: "explicit",
      discountRate: 0.03,
    });

    expect(() => classifyDiscountRate(a, b)).toThrow(InconsistentDiscountRateStatusError);
  });
});

describe("classifyEndpointCoverage", () => {
  it("aopCodeが一致すればゼロ寄与", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100, aopCode: "human_health" });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300, aopCode: "human_health" });
    expect(classifyEndpointCoverage(a, b)).toEqual({ factor: "endpointCoverage", kind: "zero" });
  });

  it("not_applicable同士も一致とみなしゼロ寄与(§3.2)", () => {
    const a = makeValuationRecord({
      methodId: "a",
      centralValue: 100,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const b = makeValuationRecord({
      methodId: "b",
      centralValue: 300,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    expect(classifyEndpointCoverage(a, b)).toEqual({ factor: "endpointCoverage", kind: "zero" });
  });

  it("aopCodeが不一致ならnot_recalculable(F-4)", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100, aopCode: "resource_availability" });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300, aopCode: "human_health" });

    const result = classifyEndpointCoverage(a, b);
    expect(result.kind).toBe("not_recalculable");
    if (result.kind === "not_recalculable") {
      expect(result.fallback).toBe("F-4");
    }
  });
});
