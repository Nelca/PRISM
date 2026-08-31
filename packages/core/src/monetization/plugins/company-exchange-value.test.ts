import { describe, expect, it } from "vitest";
import type { CorporateFinancialEffectInput, PollutionReleaseInput } from "../../types/valuation";
import { companyExchangeValuePlugin } from "./company-exchange-value";

const input: PollutionReleaseInput = {
  category: "pollution",
  physicalQuantity: 10,
  unit: "kg",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
  reportingYear: 2023,
  prtrListVersion: "2023",
  facilityId: "facility-1",
  prtrSubstanceCode: "009",
  casRns: ["107-13-1"],
  releaseMedium: "air",
  sourceKind: "customer_prtr",
  sourceRecordId: "row-1",
  sourceRecordHash: "a".repeat(64),
};

const effect: CorporateFinancialEffectInput = {
  id: "effect-1",
  siteId: "site-042",
  category: "pollution",
  linkedPhysicalQuantityId: "physical-row-1",
  grossCost: 18_000_000,
  alreadyInternalizedCost: 3_000_000,
  verifiedIncrementalBenefit: 500_000,
  amountBasis: "annual",
  internalizationScenarios: [
    { scenario: "pollution_regulation_and_remediation", probability: 0.65, period: 3 },
  ],
  doubleCountKey: "site-042:pollution:air",
  sourceKind: "company_input",
  sourceLabel: "environment cost ledger",
  sourceHash: "b".repeat(64),
  dataVersion: "financial-effects-v1",
  uncertaintySigma: 0.15,
};

describe("companyExchangeValuePlugin", () => {
  it("企業提供の総費用を交換価値として出力し、厚生価値へ変換しない", () => {
    const [output] = companyExchangeValuePlugin.evaluate(input, {
      depth: "deep_dive",
      corporateFinancialEffect: effect,
    });

    expect(output.valueConcept).toBe("exchange");
    expect(output.centralValue).toBe(18_000_000);
    expect(output.skipGeographicCalibration).toBe(true);
    expect(output.scopeExclusions.join(" ")).toContain("LIME3の厚生価値");
  });

  it("費用・便益・出典ハッシュの不正な入力を拒否する", () => {
    expect(() => companyExchangeValuePlugin.evaluate(input, {
      depth: "deep_dive",
      corporateFinancialEffect: { ...effect, alreadyInternalizedCost: effect.grossCost + 1 },
    })).toThrow("内部化済み費用");
    expect(() => companyExchangeValuePlugin.evaluate(input, {
      depth: "deep_dive",
      corporateFinancialEffect: { ...effect, verifiedIncrementalBenefit: -1 },
    })).toThrow("増分便益");
    expect(() => companyExchangeValuePlugin.evaluate(input, {
      depth: "deep_dive",
      corporateFinancialEffect: { ...effect, sourceHash: "not-a-hash" },
    })).toThrow("SHA-256");
  });
});
