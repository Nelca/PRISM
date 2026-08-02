import { describe, expect, it } from "vitest";
import { buildDecisionRecord } from "./build-decision-record";
import { makeValuationRecord } from "../divergence/test-helpers";
import { exchangeAmount } from "../types/common";
import type { Countermeasure } from "../types/decision";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { ExchangeValuationRecord } from "../types/valuation";

const baselineNpv: BaselineNpvInput = {
  value: 500_000_000,
  discountRate: 0.05,
  horizon: 10,
  source: "manual_entry",
};

function buildCountermeasures(record: ExchangeValuationRecord): Countermeasure[] {
  return [
    {
      type: "reduction",
      targetSiteId: "site-042",
      investmentCost: { initial: 10_000_000, recurring: 0 },
      avoidedNatureCost: [{ year: 0, amount: exchangeAmount(100_000_000), sourceValuationRecordId: record.id }],
    },
  ];
}

describe("buildDecisionRecord", () => {
  const record = makeValuationRecord({
    methodId: "replacement-cost",
    centralValue: 100_000_000,
    valueConcept: "exchange",
    aopCode: "not_applicable",
  });

  it("承認閾値がpendingの場合、verdictもpendingでdeepDiveRecommendationはない", () => {
    const result = buildDecisionRecord({
      id: "dr-1",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: "pending",
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures: buildCountermeasures(record),
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "weak_reference" },
    });

    expect(result.verdict).toBe("pending");
    expect(result.deepDiveRecommendation).toBeUndefined();
    // natureAdjustedNpvはpendingでも通常通り算出される(D-10)
    expect(result.natureAdjustedNpv.central).toBe(600_000_000);
  });

  it("承認閾値がレンジ内の場合、verdict=crossesでdeepDiveRecommendationが設定される", () => {
    const result = buildDecisionRecord({
      id: "dr-2",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: { value: exchangeAmount(600_000_000), source: "manual_entry" },
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures: buildCountermeasures(record),
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "weak_reference" },
    });

    expect(result.verdict).toBe("crosses");
    expect(result.deepDiveRecommendation).toBeDefined();
    expect(result.deepDiveRecommendation?.sourceValuationRecordId).toBe(record.id);
  });

  it("承認閾値がレンジ外(下回る)の場合、verdict=does_not_crossでdeepDiveRecommendationはない", () => {
    const result = buildDecisionRecord({
      id: "dr-3",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: { value: exchangeAmount(1), source: "manual_entry" },
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures: buildCountermeasures(record),
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "weak_reference" },
    });

    expect(result.verdict).toBe("does_not_cross");
    expect(result.deepDiveRecommendation).toBeUndefined();
  });

  it("relatedValuationRecordIdsがbuildDecisionRecordValuationRefs経由で正しく構築される", () => {
    const result = buildDecisionRecord({
      id: "dr-4",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: "pending",
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures: buildCountermeasures(record),
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "weak_reference" },
    });

    expect(result.relatedValuationRecordIds).toEqual([record.id]);
  });
});
