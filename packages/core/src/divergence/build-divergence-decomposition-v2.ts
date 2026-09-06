/**
 * M4完成:トップレベル関数(新経路)。ValuationRecord[] → `DivergenceDecompositionV2`。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §4-8・§6.1〜§6.5、T-02-11
 *
 * 段階1(価値概念での分割)は既存の `partition.ts` を再利用する。各グループ内では
 *   - **親手法が異なるレコード同士**だけを `crossMethodPairs`(手法間比較)
 *   - 同一親手法の内訳同士は `breakdownAnalyses`(同一手法の内訳分析。加法Shapleyの対象ではない)
 * に分ける(§4-8)。IFVIの4内訳間比較と、IFVI集計対LIME3の手法間比較は別の分析単位である。
 *
 * グループ内の親手法数が上限を超えても**例外を投げない**(T-02-11)。上限外のペアは
 * `groupLimit.excluded Pairs` に記録し、同じペアを `group_limit_exceeded` の停止結果としても残す。
 */

import type { ComparisonSubject } from "../types/comparison";
import type { ValueConcept } from "../types/common";
import type {
  DivergenceDecompositionV2,
  IntraMethodBreakdownAnalysis,
  PairwiseDecompositionV2,
  ValueConceptGroupV2,
} from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";
import { computeRecordHash } from "../ledger/recalculation-hash";
import { parentMethodIdOf } from "./comparability";
import { buildCrossGroupComparison, partitionByValueConcept } from "./partition";
import { buildGroupLimitStoppedPair, buildPairwiseDecompositionV2, type DivergenceDecompositionVersionsV2 } from "./pairwise-decomposition-v2";
import type { RecipeRegistry } from "./recipes/registry";

export type { DivergenceDecompositionVersionsV2 } from "./pairwise-decomposition-v2";

/** グループ内の親手法数の上限(T-02-11)。超過は例外ではなく `group_limit_exceeded` として残す。 */
export const MAX_PARENT_METHODS_PER_GROUP = 5;

const GROUP_USAGE: Record<ValueConcept, string> = {
  exchange: "SSBJ財務影響 / 投資判断",
  welfare: "社会的費用ビュー / 開示",
};

/**
 * 同一親手法の内訳集計の宣言。呼び出し側(手法アダプター側の知識を持つ層)が渡す。
 * エンジンは集計式を推測しない。宣言が無い親手法は内訳の並置(components)だけを出し、
 * `aggregate` は null にする。
 */
export interface IntraMethodBreakdownSpec {
  parentMethodId: string;
  /** 例 "VFaccess + MAX(VFnutrition, VFdisease, VFes)"。 */
  aggregationFormula: string;
  /** 内訳IDごとの値から公式集計値を再構成する。 */
  reconstruct: (values: Record<string, number>) => number;
  /** 集計が価値概念を跨ぐか(跨ぐ場合はグループ比較に使えない)。 */
  mixesValueConcepts: boolean;
  /** 集計式で採用された内訳ID(MAXで選ばれた等)。宣言が無ければ採用を主張しない。 */
  selected?: (values: Record<string, number>) => string[];
}

export interface BuildDivergenceDecompositionV2Options {
  id: string;
  targetPhysicalQuantityId: string;
  siteId: string;
  subject: ComparisonSubject;
  records: ValuationRecord[];
  registry: RecipeRegistry;
  versions: DivergenceDecompositionVersionsV2;
  breakdownSpecs?: IntraMethodBreakdownSpec[];
}

function subFactorIdOf(record: ValuationRecord): string {
  const dot = record.methodId.indexOf(".");
  return dot === -1 ? record.methodId : record.methodId.slice(dot + 1);
}

function buildBreakdownAnalysis(options: {
  parentMethodId: string;
  subjectId: string;
  records: ValuationRecord[];
  spec?: IntraMethodBreakdownSpec;
}): IntraMethodBreakdownAnalysis {
  const { parentMethodId, subjectId, records, spec } = options;
  const values: Record<string, number> = {};
  for (const record of records) values[subFactorIdOf(record)] = record.centralValue as number;

  const selectedIds = spec?.selected ? spec.selected(values) : [];
  const components = records.map((record) => ({
    recordMethodId: record.methodId,
    subFactorId: subFactorIdOf(record),
    valueConcept: record.valueConcept,
    value: record.centralValue as number,
    zeroMeaning: record.trace?.zeroMeaning,
    selectedByAggregation: selectedIds.includes(subFactorIdOf(record)),
  }));

  let aggregate: IntraMethodBreakdownAnalysis["aggregate"] = null;
  if (spec) {
    try {
      aggregate = {
        value: spec.reconstruct(values),
        mixesValueConcepts: spec.mixesValueConcepts,
        note: spec.mixesValueConcepts
          ? `公式集計値は価値概念を跨いで合成されているため、価値概念グループ間の比較には使えません(集計式: ${spec.aggregationFormula})。`
          : `集計式: ${spec.aggregationFormula}。このグループに存在する内訳(${Object.keys(values).sort().join(", ")})から再構成しました。`,
      };
    } catch (error) {
      aggregate = null;
      void error;
    }
  }

  const aggregationFormula = spec?.aggregationFormula ?? "(集計式の宣言なし)";
  const narrative = [
    `${parentMethodId} の内訳分析(同一手法の内訳同士。手法間比較とは別の分析単位です)。`,
    `内訳: ${components.map((component) => `${component.subFactorId}=${component.value}${component.zeroMeaning ? `(ゼロ意味 ${component.zeroMeaning.code})` : ""}`).join("、")}。`,
    `集計式: ${aggregationFormula}。`,
    aggregate === null
      ? "公式集計値は再構成していません(集計式の宣言が無いか、このグループに必要な内訳が揃っていません)。"
      : `公式集計値: ${aggregate.value}。${aggregate.note}`,
    "内訳間の差は加法Shapleyの対象にしません(§4-8)。",
  ].join(" ");

  return {
    analysisUnit: "intra_method_breakdown",
    parentMethodId,
    subjectId,
    aggregationFormula,
    components,
    aggregate,
    narrative,
  };
}

function buildGroup(options: {
  valueConcept: ValueConcept;
  records: ValuationRecord[];
  build: BuildDivergenceDecompositionV2Options;
}): ValueConceptGroupV2 {
  const { valueConcept, records, build } = options;
  const parentMethodIds = [...new Set(records.map((record) => parentMethodIdOf(record.methodId)))];
  const allowedParents = new Set(parentMethodIds.slice(0, MAX_PARENT_METHODS_PER_GROUP));
  const exceeded = parentMethodIds.length > MAX_PARENT_METHODS_PER_GROUP;

  const crossMethodPairs: PairwiseDecompositionV2[] = [];
  const excludedPairs: { methodIdA: string; methodIdB: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const recordA = records[i];
      const recordB = records[j];
      const parentA = parentMethodIdOf(recordA.methodId);
      const parentB = parentMethodIdOf(recordB.methodId);
      if (parentA === parentB) continue; // 内訳同士は breakdownAnalyses で扱う(§4-8)
      if (!allowedParents.has(parentA) || !allowedParents.has(parentB)) {
        excludedPairs.push({ methodIdA: recordA.methodId, methodIdB: recordB.methodId });
        crossMethodPairs.push(
          buildGroupLimitStoppedPair({
            recordA,
            recordB,
            subjectId: build.subject.id,
            maxParentMethods: MAX_PARENT_METHODS_PER_GROUP,
          })
        );
        continue;
      }
      crossMethodPairs.push(
        buildPairwiseDecompositionV2({
          recordA,
          recordB,
          subject: build.subject,
          registry: build.registry,
          versions: build.versions,
        })
      );
    }
  }

  const breakdownAnalyses: IntraMethodBreakdownAnalysis[] = [];
  for (const parentMethodId of parentMethodIds) {
    const componentRecords = records.filter((record) => parentMethodIdOf(record.methodId) === parentMethodId);
    if (componentRecords.length < 2) continue;
    breakdownAnalyses.push(
      buildBreakdownAnalysis({
        parentMethodId,
        subjectId: build.subject.id,
        records: componentRecords,
        spec: build.breakdownSpecs?.find((candidate) => candidate.parentMethodId === parentMethodId),
      })
    );
  }

  return {
    valueConcept,
    usage: GROUP_USAGE[valueConcept],
    parentMethodIds,
    recordMethodIds: records.map((record) => record.methodId),
    crossMethodPairs,
    breakdownAnalyses,
    groupLimit: { maxParentMethods: MAX_PARENT_METHODS_PER_GROUP, exceeded, excludedPairs },
  };
}

/**
 * `representativeValueSelection` は利用者の選択が入るため、ここでは組み立てない。
 * `assumptionEntryIds` はパイプライン層が実配線する。
 */
export function buildDivergenceDecompositionV2(options: BuildDivergenceDecompositionV2Options): DivergenceDecompositionV2 {
  const { exchange, welfare } = partitionByValueConcept(options.records);
  const crossGroupComparison = buildCrossGroupComparison(exchange, welfare);

  const groups: ValueConceptGroupV2[] = [];
  if (exchange.length > 0) groups.push(buildGroup({ valueConcept: "exchange", records: exchange, build: options }));
  if (welfare.length > 0) groups.push(buildGroup({ valueConcept: "welfare", records: welfare, build: options }));

  const recipeHashes = [
    ...new Set(
      groups
        .flatMap((group) => group.crossMethodPairs)
        .map((pair) => (pair.recipe ? `${pair.recipe.id}@${pair.recipe.version}:${pair.recipe.hash}` : null))
        .filter((value): value is string => value !== null)
    ),
  ].sort();

  return {
    schemaVersion: 2,
    id: options.id,
    targetPhysicalQuantityId: options.targetPhysicalQuantityId,
    siteId: options.siteId,
    subject: options.subject,
    valuationRecordIds: options.records.map((record) => record.id),
    groups,
    crossGroupComparison,
    assumptionEntryIds: [],
    versions: { ...options.versions },
    /**
     * 上流(レコード・トレース)と、結果を左右した宣言(レシピ・版)の両方を含める。
     * どれか1つでも変われば分解結果のハッシュも変わる(T-06.4・T-14.2)。
     */
    recalculationHash: computeRecordHash("dd2", {
      targetPhysicalQuantityId: options.targetPhysicalQuantityId,
      siteId: options.siteId,
      subject: {
        id: options.subject.id,
        identityRuleVersion: options.subject.identityRuleVersion,
        sourceHash: options.subject.sourceHash,
      },
      sourceRecordHashes: options.records.map((record) => record.recalculationHash),
      traceHashes: options.records.map((record) => record.trace?.hash ?? "no-trace"),
      recipeHashes,
      recipeRegistryVersion: options.registry.version,
      versions: options.versions,
    }),
  };
}
