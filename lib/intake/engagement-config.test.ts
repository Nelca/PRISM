import { describe, expect, it } from "vitest";
import { parseEngagementConfig } from "./engagement-config";

function validConfigJson(overrides: Record<string, unknown> = {}): string {
  const base = {
    physicalQuantityId: "pq-site001-water-2027",
    deepDive: {
      category: "water",
      physicalQuantity: 45000,
      unit: "m3",
      siteId: "site-001",
      sourceRegion: "JP",
      targetRegion: "JP",
    },
    methodConfig: { depth: "deep_dive", unitReplacementCost: 620 },
    calibration: {
      pppSource: "test",
      pppValue: 1,
      incomeElasticity: 0.7,
      sourceIncomeLevel: 100,
      targetIncomeLevel: 100,
      deflator: 1,
      relativePriceEscalationRate: 1,
      elapsedYears: 0,
      areaScaling: 1,
    },
    baselineNpv: { value: 1_000_000_000, discountRate: 0.06, horizon: 10, source: "manual_entry" },
    approvalThreshold: "pending",
    bindingMechanism: { kind: "weak_reference" },
    countermeasures: [
      {
        type: "reduction",
        targetSiteId: "site-001",
        investmentCost: { initial: 1000, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: 1000, sourceValuationMethodId: "replacement-cost" }],
      },
    ],
    disclosureClaims: [],
    ...overrides,
  };
  return JSON.stringify(base);
}

describe("parseEngagementConfig", () => {
  it("正しい設定を検証済みのEngagementConfigとして返す", () => {
    const { config, errors } = parseEngagementConfig(validConfigJson());
    expect(errors).toHaveLength(0);
    expect(config?.approvalThreshold).toBe("pending");
    expect(config?.countermeasures).toHaveLength(1);
  });

  it("approvalThresholdがpendingでなくても、正しい形なら受け付ける", () => {
    const { config, errors } = parseEngagementConfig(
      validConfigJson({ approvalThreshold: { value: 1_200_000_000, source: "manual_entry" } })
    );
    expect(errors).toHaveLength(0);
    expect(config?.approvalThreshold).toEqual({ value: 1_200_000_000, source: "manual_entry" });
  });

  it("JSON構文が不正な場合はエラーを返す", () => {
    const { config, errors } = parseEngagementConfig("{ invalid json");
    expect(config).toBeNull();
    expect(errors[0]).toContain("構文");
  });

  it("deepDive.categoryが不正な場合はエラーを返す", () => {
    const { errors } = parseEngagementConfig(validConfigJson({ deepDive: { category: "invalid" } }));
    expect(errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("bindingMechanism.kindが不正な場合はエラーを返す", () => {
    const { errors } = parseEngagementConfig(validConfigJson({ bindingMechanism: { kind: "invalid_kind" } }));
    expect(errors.some((e) => e.includes("bindingMechanism"))).toBe(true);
  });

  it("countermeasuresが空配列の場合はエラーを返す", () => {
    const { errors } = parseEngagementConfig(validConfigJson({ countermeasures: [] }));
    expect(errors.some((e) => e.includes("countermeasures"))).toBe(true);
  });

  it("disclosureClaimsのclaimTypeが不正な場合はエラーを返す", () => {
    const { errors } = parseEngagementConfig(
      validConfigJson({
        disclosureClaims: [
          {
            id: "claim-1",
            sourceDocument: "doc",
            sourcePageOrSection: "p.1",
            rawText: "test",
            claimType: "invalid_type",
            category: "water",
            extractionConfidence: "high",
          },
        ],
      })
    );
    expect(errors.some((e) => e.includes("claimType"))).toBe(true);
  });
});
