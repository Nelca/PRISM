import { describe, expect, it } from "vitest";
import { computeNatureAdjustedNpv, HorizonExceededError, UnknownValuationRecordError } from "./nature-adjusted-npv";
import { makeValuationRecord } from "../divergence/test-helpers";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { Countermeasure } from "../types/decision";
import { exchangeAmount } from "../types/common";

const baselineNpv: BaselineNpvInput = {
  value: 500_000_000,
  discountRate: 0.05,
  horizon: 10,
  source: "manual_entry",
};

describe("computeNatureAdjustedNpv", () => {
  it("単一countermeasure・単年の場合、通常NPVに割引後の回避コストを加算する", () => {
    const record = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 10_000_000, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: exchangeAmount(1_000_000), sourceValuationRecordId: record.id }],
      },
    ];

    const result = computeNatureAdjustedNpv(baselineNpv, countermeasures, { [record.id]: record });

    // year=0のため割引係数は1
    expect(result.central).toBe(500_000_000 + 1_000_000);
  });

  it("複数年・複数countermeasureを正しく割引・合算する", () => {
    const record = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 10_000_000, recurring: 0 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(1_000_000), sourceValuationRecordId: record.id },
          { year: 1, amount: exchangeAmount(1_000_000), sourceValuationRecordId: record.id },
        ],
      },
      {
        type: "transfer",
        targetSiteId: "site-042",
        investmentCost: { initial: 5_000_000, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: exchangeAmount(500_000), sourceValuationRecordId: record.id }],
      },
    ];

    const result = computeNatureAdjustedNpv(baselineNpv, countermeasures, { [record.id]: record });

    const expectedPv = 1_000_000 + 1_000_000 / 1.05 + 500_000;
    expect(result.central).toBeCloseTo(500_000_000 + expectedPv, 6);
  });

  it("レンジは出典ValuationRecordのp5/p95比率を割引後金額に適用して合成する", () => {
    const record = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000, // quantileRange: p5=800, p50=1000, p95=1200 (test-helpersのデフォルト比率)
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 0, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: exchangeAmount(1_000_000), sourceValuationRecordId: record.id }],
      },
    ];

    const result = computeNatureAdjustedNpv(baselineNpv, countermeasures, { [record.id]: record });

    expect(result.quantileRange.p5).toBeCloseTo(500_000_000 + 800_000, 6);
    expect(result.quantileRange.p50).toBeCloseTo(500_000_000 + 1_000_000, 6);
    expect(result.quantileRange.p95).toBeCloseTo(500_000_000 + 1_200_000, 6);
  });

  it("countermeasureがない場合、通常NPVをそのまま返す(レンジも一点)", () => {
    const result = computeNatureAdjustedNpv(baselineNpv, [], {});
    expect(result.central).toBe(500_000_000);
    expect(result.quantileRange).toEqual({ p5: 500_000_000, p50: 500_000_000, p95: 500_000_000 });
  });

  it("yearがhorizonを超える場合はエラーを投げる", () => {
    const record = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 0, recurring: 0 },
        avoidedNatureCost: [{ year: 20, amount: exchangeAmount(1_000_000), sourceValuationRecordId: record.id }],
      },
    ];

    expect(() => computeNatureAdjustedNpv(baselineNpv, countermeasures, { [record.id]: record })).toThrow(
      HorizonExceededError
    );
  });

  it("sourceValuationRecordIdが見つからない場合はエラーを投げる", () => {
    const countermeasures: Countermeasure[] = [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 0, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: exchangeAmount(1_000_000), sourceValuationRecordId: "unknown" }],
      },
    ];

    expect(() => computeNatureAdjustedNpv(baselineNpv, countermeasures, {})).toThrow(UnknownValuationRecordError);
  });
});
