/**
 * M5統合テスト(実装計画フェーズ7)。
 * M3が生成する交換価値・厚生価値ValuationRecordから、ブリッジ1・ブリッジ2・未内部化コスト・
 * 自然債務・比較先までを通しで検証する。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { getPluginsForCategory } from "../monetization/registry";
import { buildBridge1NatureAdjustedProfit, buildWaterfallSteps } from "./bridge1";
import { buildBridge2SocialCostView } from "./bridge2";
import { computeInternalizationStatus } from "./internalization-status";
import { computeNatureDebt } from "./nature-debt";
import { computeComparisonTargets } from "./comparison-targets";
import { exchangeAmount } from "../types/common";
import { TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";
import type {
  ExchangeValuationRecord,
  GeographicCalibrationRecord,
  MethodConfig,
  PhysicalQuantityInput,
  WelfareValuationRecord,
} from "../types/valuation";

describe("M5統合テスト:M3のValuationRecordから2ブリッジ・自然債務・比較先まで通しで検証する", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
    pppSource: "test",
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

  function buildRecords() {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: getPluginsForCategory("water"),
      versions: TEST_VALUATION_VERSIONS,
    });
    const records = groups.flatMap((g) => g.records);
    return {
      exchange: records.find((r) => r.methodId === "replacement-cost") as ExchangeValuationRecord,
      welfare: records.find((r) => r.methodId === "lime3-water") as WelfareValuationRecord,
    };
  }

  it("交換価値ValuationRecordからブリッジ1・未内部化コスト・自然債務・比較先までを通しで組み立てる", () => {
    const { exchange } = buildRecords();

    const totalExternalCost = exchange.centralValue; // 5,000,000円(500円×10,000m3)
    const internalizationStatus = computeInternalizationStatus(totalExternalCost, exchangeAmount(1_000_000));

    const natureDebt = computeNatureDebt(
      internalizationStatus.uninternalizedCost,
      [
        { scenario: "ngfs_net_zero_2050", probability: 1 / 3, period: 5 },
        { scenario: "ngfs_current_policies", probability: 1 / 3, period: 5 },
        { scenario: "gx_ets_official", probability: 1 / 3, period: 5 },
      ],
      0.05
    );

    const bridge1 = buildBridge1NatureAdjustedProfit(
      exchangeAmount(1_000_000_000),
      natureDebt.totalDebt,
      exchangeAmount(0)
    );

    expect(bridge1.natureAdjustedOperatingProfit).toBeLessThan(bridge1.reportedOperatingProfit as number);
    expect(buildWaterfallSteps(bridge1)).toHaveLength(4);

    const comparisonTargets = computeComparisonTargets({
      reportedOperatingProfit: exchangeAmount(1_000_000_000),
      natureAdjustedOperatingProfit: bridge1.natureAdjustedOperatingProfit,
      natureDebt,
      existingImpairmentThreshold: exchangeAmount(10_000_000),
      financials: { netDebt: 2_100_000_000, ebitda: 1_000_000_000, interestExpense: 120_000_000 },
    });

    expect(comparisonTargets.operatingProfitRatio).toBeGreaterThan(0);
    expect(comparisonTargets.nonGaapLabel.label).toBe("非GAAP指標");

    // 比率の「変化後」はPRISMが算出する(企業入力の転記ではない、D-5.2 / GAP-10)
    const [leverage, coverage] = comparisonTargets.ratingCostOfCapitalImpact.ratios;
    expect(leverage.after!).toBeGreaterThan(leverage.before!); // 自然債務を上乗せするため悪化する
    expect(coverage.after!).toBeLessThan(coverage.before!); // 自然調整後利益は報告利益より小さい
  });

  it("厚生価値ValuationRecordからブリッジ2(社会的費用ビュー)を組み立て、開示専用ラベルが常時付く", () => {
    const { welfare } = buildRecords();

    const bridge2 = buildBridge2SocialCostView(welfare.centralValue, 0.1);

    expect(bridge2.socialCost).toBe(welfare.centralValue);
    expect(bridge2.disclosureOnlyLabel).toBe(true);
    expect(bridge2.nonGaapLabel.label).toBe("非GAAP指標");
  });
});
