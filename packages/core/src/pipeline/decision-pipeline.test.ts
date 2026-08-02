import { describe, expect, it } from "vitest";
import { runDecisionPipeline } from "./decision-pipeline";
import { createIdSequence } from "./ids";
import { makeValuationRecord } from "../divergence/test-helpers";
import { exchangeAmount } from "../types/common";
import type { Countermeasure } from "../types/decision";
import type { BaselineNpvInput } from "../types/financial-bridge";

const NOW = "2026-08-02T00:00:00Z";

describe("runDecisionPipeline", () => {
  const record = makeValuationRecord({
    methodId: "replacement-cost",
    centralValue: 100_000_000,
    valueConcept: "exchange",
    aopCode: "not_applicable",
  });

  const baselineNpv: BaselineNpvInput = { value: 500_000_000, discountRate: 0.05, horizon: 10, source: "manual_entry" };

  const countermeasures: Countermeasure[] = [
    {
      type: "reduction",
      targetSiteId: "site-042",
      investmentCost: { initial: 10_000_000, recurring: 0 },
      avoidedNatureCost: [{ year: 0, amount: exchangeAmount(100_000_000), sourceValuationRecordId: record.id }],
    },
  ];

  it("bindingMechanismChangeを指定しない場合、AssumptionEntryは生成されない", () => {
    const result = runDecisionPipeline({
      id: "dr-1",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: "pending",
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures,
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "weak_reference" },
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.assumptionEntries).toHaveLength(0);
    expect(result.decisionRecord.bindingMechanismHistory).toHaveLength(0);
  });

  it("bindingMechanismChangeを指定した場合、M6のAssumptionEntryが生成され、DecisionRecordに反映される", () => {
    const result = runDecisionPipeline({
      id: "dr-2",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: "pending",
      relatedValuationRecords: [record],
      baselineNpv,
      countermeasures,
      valuationRecordsById: { [record.id]: record },
      bindingMechanism: { kind: "npv_formula_replacement" },
      bindingMechanismChange: {
        previousMechanism: { kind: "weak_reference" },
        reason: "投資判断予算が確保されたため拘束方式を強化",
        changedAt: NOW,
      },
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.assumptionEntries).toHaveLength(1);
    expect(result.assumptionEntries[0].sourceModule).toBe("M6");
    expect(result.decisionRecord.bindingMechanismHistory).toHaveLength(1);
    expect(result.decisionRecord.assumptionEntryIds).toEqual([result.assumptionEntries[0].id]);
  });
});
