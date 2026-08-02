import { describe, expect, it } from "vitest";
import { computePriorityScores } from "./priority-score";
import type { PriorityScoreInput } from "./priority-score";
import { exchangeAmount } from "../types/common";
import type { ExchangeValuationRecord } from "../types/valuation";
import { IDENTITY_CALIBRATION } from "../divergence/test-helpers";

function makeExchangeRecord(centralValue: number, p5: number, p95: number): ExchangeValuationRecord {
  return {
    id: `vr-${centralValue}`,
    methodId: "test",
    methodVersion: "1.0.0",
    physicalQuantityId: "pq-1",
    siteId: "site-042",
    aopCode: "not_applicable",
    aopSourceLabel: "test",
    aopMappingConfidence: "high",
    quantileRange: { p5, p50: centralValue, p95 },
    parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
    transferFitness: { tier: "not_applicable" },
    discountRate: null,
    discountRateStatus: "no_time_dimension",
    geographicCalibration: IDENTITY_CALIBRATION,
    scopeExclusions: [],
    recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
    assumptionEntryIds: [],
    recalculationHash: "placeholder:test",
    valueConcept: "exchange",
    centralValue: exchangeAmount(centralValue),
  };
}

describe("computePriorityScores", () => {
  it("要件定義書§2.2の4件バッチ例(感応度・財務・不確実性)を再現し、正しくnormalizedScoreを合算する", () => {
    // uncertaintyMagnitude = ln(p95/p5) が doc記載の値になるようp5/p95を逆算する
    const inputs: PriorityScoreInput[] = [
      {
        materialIssueId: "A",
        sensitivityScore: 4,
        impactCategory: "climate", // disclosureRequirement=3(高)
        screeningValuationRecord: makeExchangeRecord(8000, 100, 100 * Math.exp(0.5)),
      },
      {
        materialIssueId: "B",
        sensitivityScore: 2,
        impactCategory: "water", // disclosureRequirement=2(中)
        screeningValuationRecord: makeExchangeRecord(5000, 100, 100 * Math.exp(1.8)),
      },
      {
        materialIssueId: "C",
        sensitivityScore: 5,
        impactCategory: "climate", // disclosureRequirement=3(高)
        screeningValuationRecord: makeExchangeRecord(1200, 100, 100 * Math.exp(0.3)),
      },
      {
        materialIssueId: "D",
        sensitivityScore: 1,
        impactCategory: "pollution", // disclosureRequirement=2(中)
        screeningValuationRecord: makeExchangeRecord(200, 100, 100 * Math.exp(2.5)),
      },
    ];

    const scores = computePriorityScores(inputs);
    const byId = Object.fromEntries(scores.map((s) => [s.materialIssueId, s]));

    // 生値がそのまま保持されていることを確認
    expect(byId.A.sensitivity).toBe(4);
    expect(byId.A.financialExposure).toBe(8000);
    expect(byId.A.uncertaintyMagnitude).toBeCloseTo(0.5, 9);
    expect(byId.A.disclosureRequirement).toBe(3);

    // 正規化後の合算値(標準的なパーセンタイル順位、タイは平均順位)
    expect(byId.A.normalizedScore).toBeCloseTo(3.125, 9);
    expect(byId.B.normalizedScore).toBeCloseTo(2.375, 9);
    expect(byId.C.normalizedScore).toBeCloseTo(2.625, 9);
    expect(byId.D.normalizedScore).toBeCloseTo(1.875, 9);

    // 要件定義書の結論通り、Aが最上位になる
    const maxScore = Math.max(...scores.map((s) => s.normalizedScore));
    expect(byId.A.normalizedScore).toBe(maxScore);
  });

  it("バッチが1件の場合、全項目が最大の正規化値(1.0)を取り、normalizedScoreは4.0になる", () => {
    const inputs: PriorityScoreInput[] = [
      {
        materialIssueId: "only",
        sensitivityScore: 3,
        impactCategory: "water",
        screeningValuationRecord: makeExchangeRecord(1000, 800, 1200),
      },
    ];

    const [score] = computePriorityScores(inputs);
    expect(score.normalizedScore).toBe(4.0);
  });
});
