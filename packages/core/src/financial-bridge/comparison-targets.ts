/**
 * M5 D-5:比較先(格付・資本コストへの影響は定性的な扱いに留める)。
 * 参照元: docs/requirements/m5-financial-bridge.md §5
 *
 * 比率の数値は単純な算術で計算する(解釈の余地はない)。「格付機関が参照する指標です」
 * 「予測・断定しません」という注記文は全顧客・全ケースで共通の固定テンプレート文言とし、
 * この文章生成にAIは使わない(D-5.2、M4のnarrative.ts・M6のbinding-mechanism.tsと同じ原則)。
 */

import type { ExchangeAmount } from "../types/common";
import type { ComparisonTargets, NatureDebt } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

export interface ComparisonTargetsInput {
  reportedOperatingProfit: ExchangeAmount;
  natureDebt: NatureDebt;
  /** 企業提供の既存減損テスト前提(閾値)。PRISM側で推定しない(D-15)。 */
  existingImpairmentThreshold: ExchangeAmount;
  /** Net Debt / EBITDA。企業提供。 */
  leverage: { before: number; after: number };
  /** インタレストカバレッジ比率。企業提供。 */
  interestCoverage: { before: number; after: number };
}

function formatRatioChange(before: number, after: number): string {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `${before.toFixed(1)}倍 → ${after.toFixed(1)}倍(${sign}${delta.toFixed(1)}pt)`;
}

export function computeComparisonTargets(input: ComparisonTargetsInput): ComparisonTargets {
  const totalDebt = input.natureDebt.totalDebt as number;
  const threshold = input.existingImpairmentThreshold as number;

  const operatingProfitRatio = totalDebt / (input.reportedOperatingProfit as number);

  const changesAssumption = totalDebt > threshold;
  const details = changesAssumption
    ? `自然債務(${totalDebt.toLocaleString()}円)が、既存の減損テスト前提の閾値(${threshold.toLocaleString()}円)を上回るため、減損テストの前提を見直す必要があります。`
    : `自然債務(${totalDebt.toLocaleString()}円)は、既存の減損テスト前提の閾値(${threshold.toLocaleString()}円)の範囲内であり、前提を変える結果にはなっていません。`;

  const qualitativeNote = [
    "【比較先:格付・資本コストへの参考情報】",
    "",
    "自然債務を加味すると、以下の指標が変化します:",
    "",
    `  Net Debt / EBITDA(レバレッジ比率)    ${formatRatioChange(input.leverage.before, input.leverage.after)}`,
    `  インタレストカバレッジ比率            ${formatRatioChange(input.interestCoverage.before, input.interestCoverage.after)}`,
    "",
    "※これらは信用格付機関が一般的に参照する財務指標です。本システムは、",
    "  これらの変化が実際の格付・資本コストにどう影響するかを予測・断定",
    "  するものではありません。[非GAAP指標]",
  ].join("\n");

  return {
    operatingProfitRatio,
    impairmentTestImpact: { changesAssumption, details },
    ratingCostOfCapitalImpact: { qualitativeNote },
    nonGaapLabel: buildNonGaapLabel(["operatingProfitRatio", "impairmentTestImpact", "ratingCostOfCapitalImpact"]),
  };
}
