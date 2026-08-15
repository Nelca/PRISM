/**
 * M5 D-4:自然債務。
 * 参照元: docs/requirements/m5-financial-bridge.md §4
 *
 * 算出式: 自然債務 = Σ[未内部化コスト × 内部化確率(シナリオ,時期) × 割引係数]
 *
 * 炭素価格の実際の軌道(¥/t-CO2の数値)は要件定義書が「未確認、推定値のまま実装しない」と
 * 明記しているため使わない(plan file論点2)。シナリオは`InternalizationProbability.scenario`の
 * ラベルとしてのみ登場し、算出は「未内部化コスト×内部化確率×割引係数」の合算に忠実に従う。
 *
 * **2026-08-15追記(GAP-11・D-127):** NGFS炭素価格軌道の取得後、シナリオ別に異なる
 * 未内部化コストを使えるよう`uninternalizedCostByScenario`を追加した(省略時は従来どおり
 * 全シナリオに同一の`uninternalizedCost`を適用する、後方互換)。ただし現時点では
 * USD(NGFSの価格軌道)→円の換算に必要な為替レート(実勢レート・実質→名目換算)が
 * 未確定のため、呼び出し側(`lib/demo/run-demo-pipeline.ts`)ではまだこの引数を渡していない
 * (docs/data/carbon-price-scenarios.md §3、推定値で埋めない、D-15)。
 */

import { exchangeAmount } from "../types/common";
import type { ExchangeAmount } from "../types/common";
import type { CarbonPriceScenario, InternalizationProbability, NatureDebt } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

function discountFactor(discountRate: number, period: number): number {
  return 1 / (1 + discountRate) ** period;
}

export function computeNatureDebt(
  uninternalizedCost: ExchangeAmount,
  probabilities: InternalizationProbability[],
  discountRate: number,
  uninternalizedCostByScenario?: Partial<Record<CarbonPriceScenario, ExchangeAmount>>
): NatureDebt {
  const defaultCost = uninternalizedCost as number;

  const breakdown = probabilities.map((entry) => {
    const scenarioCost = uninternalizedCostByScenario?.[entry.scenario];
    const cost = scenarioCost !== undefined ? (scenarioCost as number) : defaultCost;
    return {
      scenario: entry.scenario,
      period: entry.period,
      probability: entry.probability,
      discountedAmount: exchangeAmount(cost * entry.probability * discountFactor(discountRate, entry.period)),
    };
  });

  const totalDebt = exchangeAmount(breakdown.reduce((sum, entry) => sum + (entry.discountedAmount as number), 0));

  return {
    totalDebt,
    breakdown,
    nonGaapLabel: buildNonGaapLabel(["totalDebt"]),
  };
}
