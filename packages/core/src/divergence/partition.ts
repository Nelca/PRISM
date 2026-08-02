/**
 * M4 §3.1:段階1(価値概念での分割)。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §3
 *
 * 交換価値と厚生価値は加算・比較できない(design-rationale-log D-11)ため、
 * Shapley分解の対象ペアはこの分割後の同一グループ内でのみ生成される。
 */

import type { ExchangeValuationRecord, ValuationRecord, WelfareValuationRecord } from "../types/valuation";
import type { DivergenceDecomposition } from "../types/divergence";

export function partitionByValueConcept(records: ValuationRecord[]): {
  exchange: ExchangeValuationRecord[];
  welfare: WelfareValuationRecord[];
} {
  const exchange: ExchangeValuationRecord[] = [];
  const welfare: WelfareValuationRecord[] = [];

  for (const record of records) {
    if (record.valueConcept === "exchange") {
      exchange.push(record);
    } else {
      welfare.push(record);
    }
  }

  return { exchange, welfare };
}

/**
 * 交換価値グループ・厚生価値グループの両方が非空の場合のみ、比較不能である旨を記録する。
 * どちらかが空の場合は「比較対象がそもそも存在しない」ため null を返す。
 */
export function buildCrossGroupComparison(
  exchange: ExchangeValuationRecord[],
  welfare: WelfareValuationRecord[]
): DivergenceDecomposition["crossGroupComparison"] {
  if (exchange.length === 0 || welfare.length === 0) {
    return null;
  }

  const exchangeAopCodes = [...new Set(exchange.map((r) => r.aopCode))].join(", ");
  const welfareAopCodes = [...new Set(welfare.map((r) => r.aopCode))].join(", ");

  return {
    incommensurable: true,
    metadataDifferences: [
      `価値概念: 交換価値(${exchange.map((r) => r.methodId).join(", ")}) vs 厚生価値(${welfare
        .map((r) => r.methodId)
        .join(", ")})`,
      `AoP: ${exchangeAopCodes} vs ${welfareAopCodes}`,
    ],
  };
}
