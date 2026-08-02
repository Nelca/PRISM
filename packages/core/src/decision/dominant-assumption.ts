/**
 * M6 D-3:深掘り推奨(dominantAssumption)の特定。
 * 参照元: docs/requirements/m6-decision-record.md §3
 *
 * M3のトルネード図を流用する設計だったが、M3実装時にはトルネード図を作らなかった
 * (plan file参照)。代わりに、layer i(parameterUncertainty.sigma)とlayer ii
 * (transferFitness.tierから導かれるsigma、uncertainty.ts/fitness.tsの既存関数を再利用)
 * を同じ尺度で比較し、どちらがレンジを支配しているかを機械的に判定する。
 */

import { cvToLognormalSigma } from "../monetization/uncertainty";
import { errorBandCvForTier } from "../monetization/fitness";
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

function layerIISigma(record: ExchangeValuationRecord): number {
  return record.transferFitness.tier === "not_applicable"
    ? 0
    : cvToLognormalSigma(errorBandCvForTier(record.transferFitness.tier));
}

/**
 * 関与する全ValuationRecordのうち、相対レンジ幅((p95-p5)/p50)が最大のものを
 * 「支配的レコード」とし、そのレコード内でlayer i / layer iiのどちらのsigmaが
 * 大きいかを比較して文言を組み立てる。
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

  const sigmaI = dominantRecord.parameterUncertainty.sigma;
  const sigmaII = layerIISigma(dominantRecord);

  const dominantAssumption =
    sigmaI >= sigmaII
      ? `${dominantRecord.methodId}のパラメータ不確実性(層i、sigma≈${sigmaI.toFixed(3)})が、レンジを支配する主要な前提です。`
      : `${dominantRecord.methodId}の適合度ティア${dominantRecord.transferFitness.tier}由来の移転誤差(層ii、sigma≈${sigmaII.toFixed(3)})が、レンジを支配する主要な前提です。`;

  return { dominantAssumption, sourceValuationRecordId: dominantRecord.id };
}
