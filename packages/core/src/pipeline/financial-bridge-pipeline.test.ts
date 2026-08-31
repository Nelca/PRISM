/**
 * M5パイプライン(GAP-10)。
 * 2ブリッジ・未内部化コスト・自然債務・比較先が1本の呼び出しで組み上がることと、
 * 構造制約(合算不能・厚生価値は開示専用)が保たれていることを確認する。
 */

import { describe, expect, it } from "vitest";
import { runFinancialBridgePipeline } from "./financial-bridge-pipeline";
import { exchangeAmount } from "../types/common";
import { makeValuationRecord } from "../divergence/test-helpers";
import type { InternalizationProbability } from "../types/financial-bridge";

const exchangeRecord = makeValuationRecord({
  methodId: "replacement-cost",
  centralValue: 12_000_000,
  valueConcept: "exchange",
});
const welfareRecord = makeValuationRecord({ methodId: "lime3-water", centralValue: 40_000_000, valueConcept: "welfare" });

const probabilities: InternalizationProbability[] = [
  { scenario: "ngfs_net_zero_2050_gcam", probability: 1 / 5, period: 5 },
  { scenario: "ngfs_net_zero_2050_remind", probability: 1 / 5, period: 5 },
  { scenario: "ngfs_current_policies_gcam", probability: 1 / 5, period: 5 },
  { scenario: "ngfs_current_policies_remind", probability: 1 / 5, period: 5 },
  { scenario: "gx_ets_official", probability: 1 / 5, period: 5 },
];

function run(overrides: Partial<Parameters<typeof runFinancialBridgePipeline>[0]> = {}) {
  return runFinancialBridgePipeline({
    exchangeRecord,
    welfareRecord,
    reportedOperatingProfit: exchangeAmount(1_200_000_000),
    currentlyInternalizedCost: exchangeAmount(2_000_000),
    existingImpairmentThreshold: exchangeAmount(50_000_000),
    financials: { netDebt: 2_400_000_000, ebitda: 1_500_000_000, interestExpense: 130_000_000 },
    internalizationProbabilities: probabilities,
    discountRate: 0.05,
    socialCostInternalizationRate: 0.15,
    ...overrides,
  });
}

describe("runFinancialBridgePipeline", () => {
  it("未内部化コスト → 自然債務 → ブリッジ1 → 比較先 の順で組み上がる", () => {
    const result = run();

    // 未内部化コスト = 交換価値の中心値 − 既に支払っている額
    expect(result.internalizationStatus.uninternalizedCost as unknown as number).toBe(12_000_000 - 2_000_000);
    // 自然債務は未内部化コストの全額ではない(内部化確率と割引係数を介する。M5 D-4)
    expect(result.natureDebt.totalDebt as unknown as number).toBeLessThan(
      result.internalizationStatus.uninternalizedCost as unknown as number
    );
    // ブリッジ1の将来内部化見込みコストは自然債務そのもの
    expect(result.bridge1.futureInternalizationCost).toBe(result.natureDebt.totalDebt);
    expect(result.bridge1.natureAdjustedOperatingProfit as unknown as number).toBeLessThan(1_200_000_000);
  });

  it("比較先の変化後の比率をPRISMが算出する(企業入力の転記ではない)", () => {
    const [leverage, coverage] = run().comparisonTargets.ratingCostOfCapitalImpact.ratios;

    expect(leverage.before).toBeCloseTo(2_400_000_000 / 1_500_000_000, 9);
    expect(leverage.after).toBeGreaterThan(leverage.before!); // 自然債務の分だけ悪化する
    expect(coverage.after).toBeLessThan(coverage.before!);
  });

  it("全出力に非GAAPラベルが付く(M5 D-6)", () => {
    const result = run();

    expect(result.bridge1.nonGaapLabel.label).toBe("非GAAP指標");
    expect(result.bridge2!.nonGaapLabel.label).toBe("非GAAP指標");
    expect(result.natureDebt.nonGaapLabel.label).toBe("非GAAP指標");
    expect(result.comparisonTargets.nonGaapLabel.label).toBe("非GAAP指標");
  });

  it("厚生価値ビューは開示専用ラベルを常時持ち、ブリッジ1に混ざらない(X7)", () => {
    const result = run();

    expect(result.bridge2!.disclosureOnlyLabel).toBe(true);
    // ブリッジ1は交換価値のみで構成され、厚生価値(4,000万)が混入していない
    const adjusted = result.bridge1.natureAdjustedOperatingProfit as unknown as number;
    expect(adjusted).toBeGreaterThan(1_200_000_000 - 12_000_000);
  });

  it("厚生価値レコードがない場合、ブリッジ2はnullになる(空の値を作らない)", () => {
    const result = run({ welfareRecord: undefined });
    expect(result.bridge2).toBeNull();
  });

  it("AssumptionEntryを生成しない(M5はM8 D-1の記録要求の対象外)", () => {
    // 返り値にassumptionEntriesが存在しないこと自体が仕様(判断が発生しないため)
    expect("assumptionEntries" in run()).toBe(false);
  });

  it("複数カテゴリを1拠点の財務ブリッジへ1回だけ集約し、費用と便益を分離する", () => {
    const pollutionRecord = {
      ...makeValuationRecord({ methodId: "company-exchange-value", centralValue: 10_000_000, valueConcept: "exchange" }),
      id: "vr-pollution",
    };
    const wasteRecord = {
      ...makeValuationRecord({ methodId: "company-exchange-value", centralValue: 4_000_000, valueConcept: "exchange" }),
      id: "vr-waste",
    };
    const result = run({
      exchangeContributions: [
        {
          record: pollutionRecord,
          materialIssueId: "site-042-mi-pollution",
          category: "pollution",
          alreadyInternalizedCost: exchangeAmount(2_000_000),
          verifiedIncrementalBenefit: exchangeAmount(0),
          amountBasis: "annual",
          doubleCountKey: "site-042:pollution",
          internalizationProbabilities: [
            { scenario: "pollution_regulation_and_remediation", probability: 1, period: 0 },
          ],
        },
        {
          record: wasteRecord,
          materialIssueId: "site-042-mi-waste",
          category: "waste",
          alreadyInternalizedCost: exchangeAmount(1_000_000),
          verifiedIncrementalBenefit: exchangeAmount(500_000),
          amountBasis: "annual",
          doubleCountKey: "site-042:waste",
          internalizationProbabilities: [
            { scenario: "waste_epr_and_treatment", probability: 1, period: 0 },
          ],
        },
      ],
    });

    expect(result.contributionBreakdown).toHaveLength(2);
    expect(result.internalizationStatus).toMatchObject({
      totalExternalCost: 14_000_000,
      currentlyInternalizedCost: 3_000_000,
      uninternalizedCost: 11_000_000,
    });
    expect(result.natureDebt.totalDebt).toBe(11_000_000);
    expect(result.bridge1.futureInternalizationCost).toBe(11_000_000);
    expect(result.bridge1.verifiedIncrementalBenefit).toBe(500_000);
    expect(result.bridge1.natureAdjustedOperatingProfit).toBe(1_189_500_000);
  });

  it("同じ費用の二重計上防止キーが重複した場合は集約を拒否する", () => {
    const contribution = {
      record: exchangeRecord,
      materialIssueId: "site-042-mi-pollution",
      category: "pollution" as const,
      alreadyInternalizedCost: exchangeAmount(0),
      verifiedIncrementalBenefit: exchangeAmount(0),
      amountBasis: "annual" as const,
      doubleCountKey: "duplicate-key",
      internalizationProbabilities: [
        { scenario: "pollution_regulation_and_remediation" as const, probability: 1, period: 0 },
      ],
    };

    expect(() => run({ exchangeContributions: [contribution, contribution] })).toThrow("二重計上防止キー");
  });
});
