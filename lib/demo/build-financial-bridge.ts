import { convertNgfsPriceToJpy, lookupNgfsCarbonPrice } from "@core/financial-bridge/carbon-price-trajectory";
import { runFinancialBridgePipeline } from "@core/pipeline/financial-bridge-pipeline";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeAmount } from "@core/types/common";
import type { CarbonPriceScenario } from "@core/types/financial-bridge";
import type { FinancialBridgeExchangeContribution } from "@core/pipeline/financial-bridge-pipeline";
import type { ImpactCategory } from "@core/types/common";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "@core/types/valuation";
import type { DecisionInputs } from "./build-decision-inputs";
import { CLIMATE_DEEP_DIVE_INPUT } from "./company";

export function buildFinancialBridge(input: {
  representative: ExchangeValuationRecord;
  representativeMaterialIssueId: string;
  representativeCategory: ImpactCategory;
  additionalExchangeRecords?: Array<{
    record: ExchangeValuationRecord;
    materialIssueId: string;
    category: ImpactCategory;
  }>;
  welfareRecord?: WelfareValuationRecord;
  baselineNpv: DecisionInputs["baselineNpv"];
  companyFinancials: DecisionInputs["companyFinancials"];
  isClimateShowcaseSite: boolean;
}) {
  const corporateContribution = (
    record: ExchangeValuationRecord,
    materialIssueId: string,
    category: ImpactCategory
  ): FinancialBridgeExchangeContribution => {
    const effect = record.financialEffectSnapshot;
    if (!effect) throw new Error(`${record.id} に企業交換価値の入力スナップショットがありません。`);
    return {
      record,
      materialIssueId,
      category,
      alreadyInternalizedCost: exchangeAmount(effect.alreadyInternalizedCost),
      verifiedIncrementalBenefit: exchangeAmount(effect.verifiedIncrementalBenefit),
      amountBasis: effect.amountBasis,
      doubleCountKey: effect.doubleCountKey,
      internalizationProbabilities: effect.internalizationScenarios,
      sourceHash: effect.sourceHash,
      dataVersion: effect.dataVersion,
    };
  };
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
    exchangeContributions: [
      ...(input.representative.methodId === "company-exchange-value"
        ? [corporateContribution(input.representative, input.representativeMaterialIssueId, input.representativeCategory)]
        : [{
            record: input.representative,
            materialIssueId: input.representativeMaterialIssueId,
            category: input.representativeCategory,
            alreadyInternalizedCost: input.companyFinancials.currentlyInternalizedCost,
            verifiedIncrementalBenefit: exchangeAmount(0),
            amountBasis: "annual" as const,
            doubleCountKey: `representative:${input.representative.id}`,
            internalizationProbabilities: [
              { scenario: "ngfs_net_zero_2050_gcam" as const, probability: 1 / 5, period: 5 },
              { scenario: "ngfs_net_zero_2050_remind" as const, probability: 1 / 5, period: 5 },
              { scenario: "ngfs_current_policies_gcam" as const, probability: 1 / 5, period: 5 },
              { scenario: "ngfs_current_policies_remind" as const, probability: 1 / 5, period: 5 },
              { scenario: "gx_ets_official" as const, probability: 1 / 5, period: 5 },
            ],
            ...(uninternalizedCostByScenario ? { uninternalizedCostByScenario } : {}),
          } satisfies FinancialBridgeExchangeContribution]),
      ...(input.additionalExchangeRecords ?? []).map(({ record, materialIssueId, category }) =>
        corporateContribution(record, materialIssueId, category)
      ),
    ],
  });

  return {
    financialBridge: {
      bridge1: result.bridge1,
      bridge2: result.bridge2,
      internalizationStatus: result.internalizationStatus,
      natureDebt: result.natureDebt,
      contributionBreakdown: result.contributionBreakdown,
    },
    comparisonTargets: result.comparisonTargets,
  };
}
