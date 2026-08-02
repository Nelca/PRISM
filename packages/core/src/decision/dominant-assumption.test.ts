import { describe, expect, it } from "vitest";
import { identifyDominantAssumption, NoContributingRecordError } from "./dominant-assumption";
import { makeValuationRecord } from "../divergence/test-helpers";
import type { Countermeasure } from "../types/decision";
import { exchangeAmount } from "../types/common";

function countermeasureFor(recordId: string): Countermeasure {
  return {
    type: "reduction",
    targetSiteId: "site-042",
    investmentCost: { initial: 0, recurring: 0 },
    avoidedNatureCost: [{ year: 0, amount: exchangeAmount(1_000_000), sourceValuationRecordId: recordId }],
  };
}

describe("identifyDominantAssumption", () => {
  it("layer i(パラメータ不確実性)のsigmaが大きい場合、層iを支配的要因とする", () => {
    const record = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.5 },
      transferFitness: { tier: "not_applicable" },
    });

    const result = identifyDominantAssumption([countermeasureFor(record.id)], { [record.id]: record });

    expect(result.sourceValuationRecordId).toBe(record.id);
    expect(result.dominantAssumption).toContain("層i");
  });

  it("layer ii(移転誤差)のsigmaが大きい場合、層iiを支配的要因とする", () => {
    const record = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFes",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.05 },
      transferFitness: { tier: "C" },
    });

    const result = identifyDominantAssumption([countermeasureFor(record.id)], { [record.id]: record });

    expect(result.dominantAssumption).toContain("層ii");
    expect(result.dominantAssumption).toContain("ティアC");
  });

  it("複数レコードのうち、相対レンジ幅が最大のものを支配的レコードとして選ぶ", () => {
    const narrowRecord = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      quantileRange: { p5: 800, p50: 1000, p95: 1200 }, // 相対幅0.4
    });
    const wideRecord = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFaccess",
      centralValue: 1000,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      quantileRange: { p5: 500, p50: 1000, p95: 2000 }, // 相対幅1.5
    });

    const countermeasures = [countermeasureFor(narrowRecord.id), countermeasureFor(wideRecord.id)];
    const result = identifyDominantAssumption(countermeasures, {
      [narrowRecord.id]: narrowRecord,
      [wideRecord.id]: wideRecord,
    });

    expect(result.sourceValuationRecordId).toBe(wideRecord.id);
  });

  it("寄与するValuationRecordがない場合はエラーを投げる", () => {
    expect(() => identifyDominantAssumption([], {})).toThrow(NoContributingRecordError);
  });
});
