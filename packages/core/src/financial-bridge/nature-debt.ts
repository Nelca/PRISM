/**
 * M5 D-4:自然債務。
 * 参照元: docs/requirements/m5-financial-bridge.md §4
 *
 * 算出式: 自然債務 = Σ[未内部化コスト × 内部化確率(シナリオ,時期) × 割引係数]
 *
 * 炭素価格の実際の軌道(¥/t-CO2の数値)は要件定義書が「未確認、推定値のまま実装しない」と
 * 明記しているため使わない(plan file論点2)。シナリオは`InternalizationProbability.scenario`の
 * ラベルとしてのみ登場し、算出は「未内部化コスト×内部化確率×割引係数」の合算に忠実に従う。
 */

import { exchangeAmount } from "../types/common";
import type { ExchangeAmount } from "../types/common";
import type { InternalizationProbability, NatureDebt } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

function discountFactor(discountRate: number, period: number): number {
  return 1 / (1 + discountRate) ** period;
}

export function computeNatureDebt(
  uninternalizedCost: ExchangeAmount,
  probabilities: InternalizationProbability[],
  discountRate: number
): NatureDebt {
  const cost = uninternalizedCost as number;

  const breakdown = probabilities.map((entry) => ({
    scenario: entry.scenario,
    period: entry.period,
    probability: entry.probability,
    discountedAmount: exchangeAmount(cost * entry.probability * discountFactor(discountRate, entry.period)),
  }));

  const totalDebt = exchangeAmount(breakdown.reduce((sum, entry) => sum + (entry.discountedAmount as number), 0));

  return {
    totalDebt,
    breakdown,
    nonGaapLabel: buildNonGaapLabel(["totalDebt"]),
  };
}
