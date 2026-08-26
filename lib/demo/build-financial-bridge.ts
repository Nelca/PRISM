import { convertNgfsPriceToJpy, lookupNgfsCarbonPrice } from "@core/financial-bridge/carbon-price-trajectory";
import { runFinancialBridgePipeline } from "@core/pipeline/financial-bridge-pipeline";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeAmount } from "@core/types/common";
import type { CarbonPriceScenario } from "@core/types/financial-bridge";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "@core/types/valuation";
import type { DecisionInputs } from "./build-decision-inputs";
import { CLIMATE_DEEP_DIVE_INPUT } from "./company";

export function buildFinancialBridge(input: {
  representative: ExchangeValuationRecord;
  welfareRecord?: WelfareValuationRecord;
  baselineNpv: DecisionInputs["baselineNpv"];
  companyFinancials: DecisionInputs["companyFinancials"];
  isClimateShowcaseSite: boolean;
}) {
  const uninternalizedCostByScenario: Partial<Record<CarbonPriceScenario, ExchangeAmount>> | undefined =
    input.isClimateShowcaseSite
      ? (() => {
          const physicalQuantityTco2 = CLIMATE_DEEP_DIVE_INPUT.physicalQuantity;
          const year = 2030;
          const costFor = (scenario: "net_zero_2050" | "current_policies", model: "gcam" | "remind") =>
            exchangeAmount(
              physicalQuantityTco2 * convertNgfsPriceToJpy(lookupNgfsCarbonPrice(scenario, model, "japan", year)) -
                (input.companyFinancials.currentlyInternalizedCost as number),
            );
          return {
            ngfs_net_zero_2050_gcam: costFor("net_zero_2050", "gcam"),
            ngfs_net_zero_2050_remind: costFor("net_zero_2050", "remind"),
            ngfs_current_policies_gcam: costFor("current_policies", "gcam"),
            ngfs_current_policies_remind: costFor("current_policies", "remind"),
          };
        })()
      : undefined;

  const result = runFinancialBridgePipeline({
    exchangeRecord: input.representative,
    ...(input.welfareRecord ? { welfareRecord: input.welfareRecord } : {}),
    reportedOperatingProfit: input.companyFinancials.reportedOperatingProfit,
    currentlyInternalizedCost: input.companyFinancials.currentlyInternalizedCost,
    existingImpairmentThreshold: input.companyFinancials.existingImpairmentThreshold,
    financials: input.companyFinancials.creditMetrics,
    internalizationProbabilities: [
      { scenario: "ngfs_net_zero_2050_gcam", probability: 1 / 5, period: 5 },
      { scenario: "ngfs_net_zero_2050_remind", probability: 1 / 5, period: 5 },
      { scenario: "ngfs_current_policies_gcam", probability: 1 / 5, period: 5 },
      { scenario: "ngfs_current_policies_remind", probability: 1 / 5, period: 5 },
      { scenario: "gx_ets_official", probability: 1 / 5, period: 5 },
    ],
    discountRate: input.baselineNpv.discountRate,
    socialCostInternalizationRate: 0.15,
    ...(uninternalizedCostByScenario ? { uninternalizedCostByScenario } : {}),
  });

  return {
    financialBridge: {
      bridge1: result.bridge1,
      bridge2: result.bridge2,
      internalizationStatus: result.internalizationStatus,
      natureDebt: result.natureDebt,
    },
    comparisonTargets: result.comparisonTargets,
  };
}
