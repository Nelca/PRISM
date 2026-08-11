/**
 * M6統合テスト(実装計画フェーズ6)。
 * M3が実際に生成する交換価値ValuationRecord(代替費用法・VFaccess)を使い、
 * pending/crosses/does_not_crossの3ケースを一通り確認する。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { getPluginsForCategory } from "../monetization/registry";
import { buildDecisionRecord } from "./build-decision-record";
import { exchangeAmount } from "../types/common";
import type { Countermeasure } from "../types/decision";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { ExchangeValuationRecord, GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import { TEST_DECISION_VERSIONS, TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";

describe("M6統合テスト:M3が生成する交換価値ValuationRecordからDecisionRecordを組み立てる", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
    pppSource: "世界銀行ICP 2024年版",
    pppValue: 1.0,
    incomeElasticity: 0.7,
    sourceIncomeLevel: 100,
    targetIncomeLevel: 100,
    deflator: 1.0,
    relativePriceEscalationRate: 1.0,
    elapsedYears: 0,
    areaScaling: 1.0,
  };

  const config: MethodConfig = {
    depth: "screening",
    unitReplacementCost: 500,
    externalValueFactors: {
      "lime3-water": 30_000,
      "ifvi-vfnutrition": 1.2,
      "ifvi-vfdisease": 0.95,
      "ifvi-vfes": 1.5,
      "ifvi-vfaccess": 0.3,
    },
  };

  function buildExchangeRecords(): Record<string, ExchangeValuationRecord> {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: getPluginsForCategory("water"),
      versions: TEST_VALUATION_VERSIONS,
    });
    const records = groups.flatMap((g) => g.records).filter((r): r is ExchangeValuationRecord => r.valueConcept === "exchange");
    return Object.fromEntries(records.map((r) => [r.id, r]));
  }

  const baselineNpv: BaselineNpvInput = {
    value: 400_000_000,
    discountRate: 0.05,
    horizon: 10,
    source: "manual_entry",
  };

  function buildCountermeasures(replacementCostRecord: ExchangeValuationRecord): Countermeasure[] {
    return [
      {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 2_000_000, recurring: 0 },
        avoidedNatureCost: [
          { year: 0, amount: replacementCostRecord.centralValue, sourceValuationRecordId: replacementCostRecord.id },
        ],
      },
    ];
  }

  it("代替費用法・VFaccessの2本が交換価値グループとして取得できる", () => {
    const records = buildExchangeRecords();
    const methodIds = Object.values(records).map((r) => r.methodId);
    expect(methodIds.sort()).toEqual(["ifvi-water-consumption.VFaccess", "replacement-cost"].sort());
  });

  it("承認閾値がpendingの場合、verdictもpendingだがnatureAdjustedNpvは算出される(D-10)", () => {
    const records = buildExchangeRecords();
    const replacementCost = Object.values(records).find((r) => r.methodId === "replacement-cost")!;

    const decisionRecord = buildDecisionRecord({
      id: "dr-site042-2027",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: "pending",
      relatedValuationRecords: Object.values(records),
      baselineNpv,
      countermeasures: buildCountermeasures(replacementCost),
      valuationRecordsById: records,
      bindingMechanism: { kind: "weak_reference" },
      versions: TEST_DECISION_VERSIONS,
    });

    expect(decisionRecord.verdict).toBe("pending");
    expect(decisionRecord.natureAdjustedNpv.central).toBeGreaterThan(baselineNpv.value);
    expect(decisionRecord.deepDiveRecommendation).toBeUndefined();
  });

  it("承認閾値がレンジ内の場合、verdict=crossesでdeepDiveRecommendationが設定される", () => {
    const records = buildExchangeRecords();
    const replacementCost = Object.values(records).find((r) => r.methodId === "replacement-cost")!;

    const decisionRecord = buildDecisionRecord({
      id: "dr-site042-2027",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: { value: decisionRecordCentralOf(records, replacementCost, baselineNpv), source: "manual_entry" },
      relatedValuationRecords: Object.values(records),
      baselineNpv,
      countermeasures: buildCountermeasures(replacementCost),
      valuationRecordsById: records,
      bindingMechanism: { kind: "weak_reference" },
      versions: TEST_DECISION_VERSIONS,
    });

    expect(decisionRecord.verdict).toBe("crosses");
    expect(decisionRecord.deepDiveRecommendation).toBeDefined();
    expect(decisionRecord.deepDiveRecommendation?.sourceValuationRecordId).toBe(replacementCost.id);
  });

  it("承認閾値が極端に低い場合、verdict=does_not_crossでdeepDiveRecommendationはない", () => {
    const records = buildExchangeRecords();
    const replacementCost = Object.values(records).find((r) => r.methodId === "replacement-cost")!;

    const decisionRecord = buildDecisionRecord({
      id: "dr-site042-2027",
      decisionTarget: "investment_approval",
      decisionMaker: "test",
      decisionDate: "2026-08-02",
      approvalThreshold: { value: exchangeAmount(1), source: "manual_entry" },
      relatedValuationRecords: Object.values(records),
      baselineNpv,
      countermeasures: buildCountermeasures(replacementCost),
      valuationRecordsById: records,
      bindingMechanism: { kind: "weak_reference" },
      versions: TEST_DECISION_VERSIONS,
    });

    expect(decisionRecord.verdict).toBe("does_not_cross");
    expect(decisionRecord.deepDiveRecommendation).toBeUndefined();
  });
});

// natureAdjustedNpvの中心値をそのまま承認閾値に使うと、必ずP5〜P95レンジ内(crosses)になる。
function decisionRecordCentralOf(
  records: Record<string, ExchangeValuationRecord>,
  replacementCost: ExchangeValuationRecord,
  baselineNpv: BaselineNpvInput
) {
  const discountFactor = 1 / (1 + baselineNpv.discountRate) ** 0;
  const pv = (replacementCost.centralValue as unknown as number) * discountFactor;
  return exchangeAmount(baselineNpv.value + pv);
}
