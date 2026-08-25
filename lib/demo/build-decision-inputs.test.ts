import { describe, expect, it } from "vitest";
import { buildDecisionInputs } from "./build-decision-inputs";
import { DEFAULT_DEEP_DIVE_PARAMS } from "./user-site-defaults";

describe("buildDecisionInputs", () => {
  it("keeps an omitted approval threshold pending", () => {
    const result = buildDecisionInputs({
      siteKind: "user",
      deepDiveParams: DEFAULT_DEEP_DIVE_PARAMS,
      decisionParameters: {
        baselineNpvValue: 123,
        discountRate: 0.05,
        horizon: 8,
        approvalThresholdValue: null,
      },
    });

    expect(result.baselineNpv).toMatchObject({ value: 123, discountRate: 0.05, horizon: 8 });
    expect(result.approvalThreshold).toBe("pending");
  });

  it("uses explicit decision and company financial inputs without changing their values", () => {
    const result = buildDecisionInputs({
      siteKind: "user",
      deepDiveParams: DEFAULT_DEEP_DIVE_PARAMS,
      decisionParameters: {
        baselineNpvValue: 900,
        discountRate: 0.04,
        horizon: 12,
        approvalThresholdValue: 950,
      },
      companyFinancials: {
        reportedOperatingProfit: 100,
        currentlyInternalizedCost: 20,
        existingImpairmentThreshold: 30,
        netDebt: 40,
        ebitda: 50,
        interestExpense: 5,
      },
    });

    expect(result.approvalThreshold).toMatchObject({ value: 950, source: "manual_entry" });
    expect(result.companyFinancials).toMatchObject({
      reportedOperatingProfit: 100,
      currentlyInternalizedCost: 20,
      existingImpairmentThreshold: 30,
      creditMetrics: { netDebt: 40, ebitda: 50, interestExpense: 5 },
    });
  });
});
