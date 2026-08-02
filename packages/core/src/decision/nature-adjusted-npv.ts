/**
 * M6 D-4:自然調整後NPV = 通常NPV + Σ回避される自然関連コスト(割引後)。
 * 参照元: docs/requirements/m6-decision-record.md §4
 *
 * レンジ(quantileRange)の合成式は要件定義書に明記がなく、実装検討で以下の設計とした
 * (plan file参照):各avoidedNatureCostエントリの出典ValuationRecordが持つ
 * quantileRange(p5/p50/p95)の「p50に対する比率」を割引後金額にそのまま適用し、
 * 全エントリで単純合算する。M3のモンテカルロを再実行する正式な合成ではなく、
 * 按分ベースの近似であることを明記する(design-rationale-log M6 D-11相当)。
 *
 * yearは0起点(当年=0、割引係数1)とする。baselineNpv.horizonを超えるyearが
 * 含まれる場合は、黙って切り捨てず例外を投げる(推定で埋めない原則)。
 */

import { exchangeAmount } from "../types/common";
import type { ExchangeAmount, QuantileRange } from "../types/common";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { Countermeasure } from "../types/decision";
import type { ExchangeValuationRecord } from "../types/valuation";

export class HorizonExceededError extends Error {}
export class UnknownValuationRecordError extends Error {}

function discountFactor(discountRate: number, year: number): number {
  return 1 / (1 + discountRate) ** year;
}

export function computeNatureAdjustedNpv(
  baselineNpv: BaselineNpvInput,
  countermeasures: Countermeasure[],
  valuationRecordsById: Record<string, ExchangeValuationRecord>
): { central: ExchangeAmount; quantileRange: QuantileRange } {
  let pvP5 = 0;
  let pvP50 = 0;
  let pvP95 = 0;

  for (const countermeasure of countermeasures) {
    for (const entry of countermeasure.avoidedNatureCost) {
      if (entry.year > baselineNpv.horizon) {
        throw new HorizonExceededError(
          `M6 D-4: avoidedNatureCostのyear(${entry.year})がbaselineNpv.horizon(${baselineNpv.horizon})を超えています。horizonと矛盾する入力です。`
        );
      }

      const record = valuationRecordsById[entry.sourceValuationRecordId];
      if (!record) {
        throw new UnknownValuationRecordError(
          `M6 D-4: sourceValuationRecordId "${entry.sourceValuationRecordId}" に対応するValuationRecordが見つかりません。`
        );
      }

      const factor = discountFactor(baselineNpv.discountRate, entry.year);
      const pv = (entry.amount as number) * factor;

      const ratioP5 = record.quantileRange.p5 / record.quantileRange.p50;
      const ratioP95 = record.quantileRange.p95 / record.quantileRange.p50;

      pvP50 += pv;
      pvP5 += pv * ratioP5;
      pvP95 += pv * ratioP95;
    }
  }

  return {
    central: exchangeAmount(baselineNpv.value + pvP50),
    quantileRange: {
      p5: baselineNpv.value + pvP5,
      p50: baselineNpv.value + pvP50,
      p95: baselineNpv.value + pvP95,
    },
  };
}
