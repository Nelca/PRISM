/**
 * M5 D-3:未内部化コスト・内部化率。
 * 参照元: docs/requirements/m5-financial-bridge.md §3
 *
 * 新しい評価ロジックは追加せず、M3の交換価値ValuationRecordの中心値(totalExternalCost)と
 * 企業提供の実費(currentlyInternalizedCost)の差分として構成する。
 */

import { exchangeAmount } from "../types/common";
import type { ExchangeAmount } from "../types/common";
import type { InternalizationStatus } from "../types/financial-bridge";

export function computeInternalizationStatus(
  totalExternalCost: ExchangeAmount,
  currentlyInternalizedCost: ExchangeAmount
): InternalizationStatus {
  const total = totalExternalCost as number;
  const internalized = currentlyInternalizedCost as number;

  // totalExternalCostが0の場合、比率は定義できないため0%として扱う(0除算を避ける構造的な既定値であり、
  // ドメイン上の推定ではない)。
  const internalizationRate = total === 0 ? 0 : internalized / total;

  return {
    totalExternalCost,
    currentlyInternalizedCost,
    internalizationRate,
    uninternalizedCost: exchangeAmount(total - internalized),
  };
}
