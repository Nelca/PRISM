/**
 * M4:トップレベル関数。ValuationRecord[] → DivergenceDecomposition。
 * §3(段階1の分割)→ 各ValueConceptGroup内で全ペアのShapley分解(§4)を組み立てる。
 */

import { buildCrossGroupComparison, partitionByValueConcept } from "./partition";
import { buildPairwiseDecomposition } from "./pairwise-decomposition";
import type { DivergenceDecomposition, ValueConceptGroup } from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";
import type { ValueConcept } from "../types/common";
import { computeRecordHash } from "../ledger/recalculation-hash";

/** M4要件定義書§2.1:価値概念で分割した後の各グループ内での上限。 */
const MAX_RECORDS_PER_GROUP = 5;

const GROUP_USAGE: Record<ValueConcept, string> = {
  exchange: "SSBJ財務影響 / 投資判断",
  welfare: "社会的費用ビュー / 開示",
};

export class TooManyRecordsInGroupError extends Error {}

function buildValueConceptGroup(valueConcept: ValueConcept, records: ValuationRecord[]): ValueConceptGroup {
  if (records.length > MAX_RECORDS_PER_GROUP) {
    throw new TooManyRecordsInGroupError(
      `M4 §2.1: ${valueConcept}グループのValuationRecord数が上限(${MAX_RECORDS_PER_GROUP})を超えています(実際: ${records.length}件)。`
    );
  }

  const pairwiseDecompositions = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      pairwiseDecompositions.push(buildPairwiseDecomposition(records[i], records[j]));
    }
  }

  return {
    valueConcept,
    methodIds: records.map((r) => r.methodId),
    usage: GROUP_USAGE[valueConcept],
    pairwiseDecompositions,
  };
}

/**
 * この分解の結果を左右するパラメータ版(GAP-06)。M4 §9が「再計算ハッシュの入力に含める」と
 * 定めている項目そのもの。Optionalにしない。
 */
export interface DivergenceDecompositionVersions {
  algorithmVersion: string;
  cicesMatchLevel: string;
  aopMappingVersion: string;
  /** F-3の桁差閾値の版(暫定10^-6)。 */
  f3ThresholdVersion: string;
  /** F-8の有意乖離閾値の版(暫定5%)。 */
  f8ThresholdVersion: string;
}

export interface BuildDivergenceDecompositionOptions {
  id: string;
  targetPhysicalQuantityId: string;
  siteId: string;
  records: ValuationRecord[];
  versions: DivergenceDecompositionVersions;
}

/**
 * representativeValueSelection はユーザーの選択が入るため、ここでは組み立てない
 * (T-05で別途実装する)。assumptionEntryIds はパイプライン層が実配線する。
 */
/**
 * @deprecated 旧経路。グループ内レコード数の超過で例外を投げ、同一手法の内訳と手法間比較を
 *   区別しない。新runは `build-divergence-decomposition-v2.ts` の
 *   `buildDivergenceDecompositionV2`(`schemaVersion: 2`)を使う。
 */
export function buildDivergenceDecomposition(options: BuildDivergenceDecompositionOptions): DivergenceDecomposition {
  const { exchange, welfare } = partitionByValueConcept(options.records);
  const crossGroupComparison = buildCrossGroupComparison(exchange, welfare);

  const groups: ValueConceptGroup[] = [];
  if (exchange.length > 0) {
    groups.push(buildValueConceptGroup("exchange", exchange));
  }
  if (welfare.length > 0) {
    groups.push(buildValueConceptGroup("welfare", welfare));
  }

  return {
    id: options.id,
    targetPhysicalQuantityId: options.targetPhysicalQuantityId,
    siteId: options.siteId,
    valuationRecordIds: options.records.map((r) => r.id),
    groups,
    crossGroupComparison,
    assumptionEntryIds: [],
    /**
     * 入力レコードのハッシュを含めることで、上流のValuationRecordが変われば
     * この分解のハッシュも変わる(GAP-06)。分解結果だけ古いまま残る事故を検出できる。
     */
    recalculationHash: computeRecordHash("dd", {
      targetPhysicalQuantityId: options.targetPhysicalQuantityId,
      siteId: options.siteId,
      sourceRecordHashes: options.records.map((record) => record.recalculationHash),
      versions: options.versions,
    }),
  };
}
