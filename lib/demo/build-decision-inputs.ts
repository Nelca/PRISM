import { exchangeAmount } from "@core/types/common";
import type { ApprovalThreshold } from "@core/types/decision";
import type { BaselineNpvInput } from "@core/types/financial-bridge";
import type { CompanyFinancialsInput, DecisionParametersInput } from "./interaction-state";
import type { UserSiteDeepDiveParams } from "./site-entry";
import {
  BASELINE_NPV,
  CLIMATE_BASELINE_NPV,
  CLIMATE_FINANCIALS,
  FLAGSHIP_FINANCIALS,
} from "./company";
import { buildUserBaselineNpv, buildUserFinancials } from "./user-site-defaults";

export interface DecisionInputs {
  baselineNpv: BaselineNpvInput;
  approvalThreshold: ApprovalThreshold | "pending";
  companyFinancials: ReturnType<typeof buildUserFinancials>;
}

export function buildDecisionInputs(input: {
  siteKind: "flagship" | "climate" | "user";
  deepDiveParams: UserSiteDeepDiveParams;
  decisionParameters?: DecisionParametersInput;
  companyFinancials?: CompanyFinancialsInput;
}): DecisionInputs {
  const { siteKind, deepDiveParams, decisionParameters, companyFinancials } = input;
  const baselineNpv: BaselineNpvInput = decisionParameters
    ? {
        value: decisionParameters.baselineNpvValue,
        discountRate: decisionParameters.discountRate,
        horizon: decisionParameters.horizon,
        source: "manual_entry",
      }
    : siteKind === "flagship"
      ? BASELINE_NPV
      : siteKind === "climate"
        ? CLIMATE_BASELINE_NPV
        : buildUserBaselineNpv(deepDiveParams);

  const approvalThreshold: ApprovalThreshold | "pending" = decisionParameters
    ? decisionParameters.approvalThresholdValue === null
      ? "pending"
      : { value: exchangeAmount(decisionParameters.approvalThresholdValue), source: "manual_entry" }
    : {
        value: exchangeAmount(
          siteKind === "flagship"
            ? BASELINE_NPV.value + 25_000_000
            : siteKind === "climate"
              ? CLIMATE_BASELINE_NPV.value + 10_000_000
              : deepDiveParams.approvalThresholdValue
        ),
        source: "manual_entry",
      };

  const financials = companyFinancials
    ? {
        reportedOperatingProfit: exchangeAmount(companyFinancials.reportedOperatingProfit),
        currentlyInternalizedCost: exchangeAmount(companyFinancials.currentlyInternalizedCost),
        existingImpairmentThreshold: exchangeAmount(companyFinancials.existingImpairmentThreshold),
        creditMetrics: {
          netDebt: companyFinancials.netDebt,
          ebitda: companyFinancials.ebitda,
          interestExpense: companyFinancials.interestExpense,
        },
      }
    : siteKind === "flagship"
      ? FLAGSHIP_FINANCIALS
      : siteKind === "climate"
        ? CLIMATE_FINANCIALS
        : buildUserFinancials(deepDiveParams);

  return { baselineNpv, approvalThreshold, companyFinancials: financials };
}
