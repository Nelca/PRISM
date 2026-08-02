import { describe, expect, it } from "vitest";
import { computeTornadoChart } from "./tornado";
import { exchangeAmount } from "../types/common";
import type { Distribution } from "../types/common";
import type { GeographicCalibrationRecord, TransferFitness, ValuationRecord } from "../types/valuation";

const IDENTITY_CALIBRATION: GeographicCalibrationRecord = {
  pppSource: "test",
  pppValue: 1,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  sourceRegion: "JP",
  targetRegion: "JP",
  deflator: 1,
  relativePriceEscalationRate: 1,
  elapsedYears: 0,
  areaScaling: 1,
};

function makeRecord(parameterUncertainty: Distribution, transferFitness: TransferFitness): ValuationRecord {
  return {
    id: "vr-test",
    methodId: "replacement-cost",
    methodVersion: "1.0.0",
    physicalQuantityId: "pq-1",
    siteId: "site-042",
    aopCode: "not_applicable",
    aopSourceLabel: "test",
    aopMappingConfidence: "high",
    quantileRange: { p5: 800, p50: 1000, p95: 1200 },
    parameterUncertainty,
    transferFitness,
    discountRate: null,
    discountRateStatus: "no_time_dimension",
    geographicCalibration: IDENTITY_CALIBRATION,
    scopeExclusions: [],
    recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
    assumptionEntryIds: [],
    recalculationHash: "placeholder:test",
    valueConcept: "exchange",
    centralValue: exchangeAmount(1000),
  };
}

describe("computeTornadoChart", () => {
  it("layer i(パラメータ不確実性)のsigmaが大きい場合、先頭に来る", () => {
    const record = makeRecord({ kind: "lognormal", mu: 0, sigma: 0.5 }, { tier: "not_applicable" });

    const chart = computeTornadoChart(record);
    expect(chart[0].factor).toBe("parameterUncertainty");
    expect(chart[0].sigma).toBeCloseTo(0.5, 9);
  });

  it("layer ii(移転誤差)のsigmaが大きい場合、先頭に来る", () => {
    const record = makeRecord({ kind: "lognormal", mu: 0, sigma: 0.05 }, { tier: "C" });

    const chart = computeTornadoChart(record);
    expect(chart[0].factor).toBe("transferFitness");
    expect(chart[0].label).toContain("ティアC");
  });

  it("tierがnot_applicableの場合、層iiの寄与はゼロとして扱われる", () => {
    const record = makeRecord({ kind: "lognormal", mu: 0, sigma: 0.1 }, { tier: "not_applicable" });

    const chart = computeTornadoChart(record);
    const layerII = chart.find((e) => e.factor === "transferFitness")!;
    expect(layerII.sigma).toBe(0);
  });

  it("常に2要因(層i・層ii)を降順で返す", () => {
    const record = makeRecord({ kind: "lognormal", mu: 0, sigma: 0.3 }, { tier: "B" });

    const chart = computeTornadoChart(record);
    expect(chart).toHaveLength(2);
    expect(chart[0].sigma).toBeGreaterThanOrEqual(chart[1].sigma);
  });
});
