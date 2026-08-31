/**
 * M5 D-1:ブリッジ1(自然調整後利益)。
 * 参照元: docs/requirements/m5-financial-bridge.md §1
 *
 * 入力は交換価値のみ(ExchangeAmount)。構想書8.2の規律をM3・M4・M6と同じ
 * branded typeパターンでM5にも適用する(厚生価値を渡すとコンパイルエラーになる)。
 */

import { exchangeAmount } from "../types/common";
import type { ExchangeAmount } from "../types/common";
import type { Bridge1NatureAdjustedProfit } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

export function buildBridge1NatureAdjustedProfit(
  reportedOperatingProfit: ExchangeAmount,
  dependencyRiskNormalization: ExchangeAmount,
  futureInternalizationCost: ExchangeAmount,
  verifiedIncrementalBenefit: ExchangeAmount = exchangeAmount(0)
): Bridge1NatureAdjustedProfit {
  const natureAdjustedOperatingProfit = exchangeAmount(
    (reportedOperatingProfit as number) -
      (dependencyRiskNormalization as number) -
      (futureInternalizationCost as number) +
      (verifiedIncrementalBenefit as number)
  );

  return {
    reportedOperatingProfit,
    dependencyRiskNormalization,
    futureInternalizationCost,
    verifiedIncrementalBenefit,
    natureAdjustedOperatingProfit,
    nonGaapLabel: buildNonGaapLabel(["natureAdjustedOperatingProfit"]),
  };
}

export interface WaterfallStep {
  label: string;
  value: ExchangeAmount;
  isTotal: boolean;
}

/**
 * ウォーターフォール図の手順を、ブリッジ1の既存フィールドから組み替えるだけで導出する
 * (新しい算出は行わない、plan file論点3)。
 */
export function buildWaterfallSteps(bridge1: Bridge1NatureAdjustedProfit): WaterfallStep[] {
  return [
    { label: "報告営業利益", value: bridge1.reportedOperatingProfit, isTotal: true },
    { label: "依存リスク正常化調整", value: exchangeAmount(-(bridge1.dependencyRiskNormalization as number)), isTotal: false },
    { label: "将来内部化見込みコスト", value: exchangeAmount(-(bridge1.futureInternalizationCost as number)), isTotal: false },
    { label: "確認済み増分便益", value: bridge1.verifiedIncrementalBenefit, isTotal: false },
    { label: "自然調整後営業利益", value: bridge1.natureAdjustedOperatingProfit, isTotal: true },
  ];
}
