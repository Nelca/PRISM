/**
 * M6 D-3:深掘り推奨(dominantAssumption)の特定。
 * 参照元: docs/requirements/m6-decision-record.md §3
 *
 * M3のトルネード図を流用する設計だったが、当初M3の実装にはトルネード図がなかった。
 * レビューにより「本来M3が持つべき機能をM6側で穴埋めしない」方針とし、1レコード分の
 * 要因ランキング(層i vs 層ii)自体は`monetization/tornado.ts`にM3の機能として実装した。
 * このモジュールが担うのは、M6固有の関心事——複数のCountermeasureが参照する複数の
 * ValuationRecordのうち、どれが自然調整後NPVのレンジを最も支配しているかの選定——のみ。
 * 選ばれたレコードの要因ランキングはM3のcomputeTornadoChart()にそのまま委譲する。
 */

import { computeTornadoChart } from "../monetization/tornado";
import type { Countermeasure } from "../types/decision";
import type { ExchangeValuationRecord } from "../types/valuation";

export class NoContributingRecordError extends Error {}

export interface DominantAssumptionResult {
  dominantAssumption: string;
  sourceValuationRecordId: string;
}

function relativeRangeWidth(record: ExchangeValuationRecord): number {
  return (record.quantileRange.p95 - record.quantileRange.p5) / record.quantileRange.p50;
}

/**
 * 関与する全ValuationRecordのうち、相対レンジ幅((p95-p5)/p50)が最大のものを
 * 「支配的レコード」とする(M6固有の選定)。そのレコード内でどの層が支配的かは、
 * M3のトルネード図(computeTornadoChart)にそのまま委譲する。
 */
export function identifyDominantAssumption(
  countermeasures: Countermeasure[],
  valuationRecordsById: Record<string, ExchangeValuationRecord>
): DominantAssumptionResult {
  const recordIds = new Set<string>();
  for (const countermeasure of countermeasures) {
    for (const entry of countermeasure.avoidedNatureCost) {
      recordIds.add(entry.sourceValuationRecordId);
    }
  }

  let dominantRecord: ExchangeValuationRecord | undefined;
  let maxWidth = -Infinity;
  for (const id of recordIds) {
    const record = valuationRecordsById[id];
    if (!record) continue;
    const width = relativeRangeWidth(record);
    if (width > maxWidth) {
      maxWidth = width;
      dominantRecord = record;
    }
  }

  if (!dominantRecord) {
    throw new NoContributingRecordError(
      "M6 D-3: 深掘り推奨を算出できるValuationRecordがありません(countermeasuresが空か、sourceValuationRecordIdが解決できません)。"
    );
  }

  const [topFactor] = computeTornadoChart(dominantRecord);

  return {
    dominantAssumption: `${dominantRecord.methodId}の${topFactor.label}が、レンジを支配する主要な前提です。`,
    sourceValuationRecordId: dominantRecord.id,
  };
}
