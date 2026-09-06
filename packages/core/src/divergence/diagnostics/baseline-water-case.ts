/**
 * T-01 / T-11:水既定ケースの診断サマリー(新エンジン V2)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §1.2・§6.5・T-11
 *
 * 比較対象数、比較可能・停止理由別の件数、要因別の非ゼロ寄与件数、残差、内訳分析、
 * 使用したデータ版・手法版・比較レシピ版を1つのオブジェクトにまとめる。
 *
 * **旧エンジンとの関係。** T-01 で記録した旧 `buildDivergenceDecomposition` の履歴値
 * (手法間4・内訳間3の計7ペア、F-1 が6件、乗法1件、非ゼロ寄与0件)は
 * `docs/roadmap/divergence-decomposition-work-log.md` §2 に残っている。ここでは新エンジンの
 * 意味論(内訳間は手法間ペアに数えない、停止は理由コードで残す)へ置き換えた値を出す。
 * **旧エンジンの件数に合わせて新エンジンを変えることはしない。**
 */

import type {
  DecomposedPair,
  DivergenceDecompositionV2,
  PairwiseDecompositionV2,
  StopReasonCode,
} from "../../types/divergence";
import type { ValuationRecord } from "../../types/valuation";
import { summarizeCorpus, type CorpusEntry, type CorpusManifest, type CorpusSummary } from "../metrics";
import { F3_THRESHOLD_DISABLED_VERSION, F8_THRESHOLD_DISABLED_VERSION } from "../mode-selection";
import { RECIPE_REGISTRY_VERSION } from "../recipes/registry";
import { SUBJECT_IDENTITY_RULE_VERSION } from "../comparability";
import { TOLERANCE_POLICY } from "../tolerance";
import { PATHWAY_MAPPING_VERSION } from "../../monetization/trace/pathway-mapping";
import type { DivergenceDecompositionVersionsV2 } from "../pairwise-decomposition-v2";

/** 新経路(V2)の分解版。`lib/demo/run-demo-pipeline.ts` の DECOMPOSITION_VERSIONS と同じ意味を core 内に固定する。 */
export const DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2: DivergenceDecompositionVersionsV2 = {
  algorithmVersion: "shapley-subset-v2",
  cicesMatchLevel: "group",
  aopMappingVersion: "aop-mapping-v1",
  f3ThresholdVersion: F3_THRESHOLD_DISABLED_VERSION,
  f8ThresholdVersion: F8_THRESHOLD_DISABLED_VERSION,
  recipeRegistryVersion: RECIPE_REGISTRY_VERSION,
  toleranceVersion: TOLERANCE_POLICY.version,
  subjectRuleVersion: SUBJECT_IDENTITY_RULE_VERSION,
  pathwayMappingVersion: PATHWAY_MAPPING_VERSION,
};

/** 診断で使う版。係数の一次資料由来と物理量のデモ既定値を区別して記録する(§7.3)。 */
export const WATER_CASE_VERSIONS = {
  valuation: {
    calibrationSetVersion: "ifvi-water-consumption-v2",
    fitnessTierThresholdVersion: "fitness-tier-v1",
    aopMappingVersion: "aop-mapping-v1",
  },
  decomposition: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
  data: {
    lime3: "AIST-IDEA v4.0 標準版 LCIA係数_LIME3(001511000 表層水 / 001515000 地下水、利子率2%・消費国・世界平均/日本)",
    ifvi: "IFVI Water Consumption Topic Methodology 2026-03 final, Appendix D Table D1 (Japan)",
    replacementCost: "デモ既定値(企業提供想定値 620 円/m³)",
    physicalQuantity: "デモ既定値(45,000 m³/年)。実測値ではない",
  },
} as const;

/** `{親手法ID}.{内訳ID}` 形式から親手法IDを取り出す。 */
export function parentMethodId(methodId: string): string {
  const dot = methodId.indexOf(".");
  return dot === -1 ? methodId : methodId.slice(0, dot);
}

export interface BaselineContributionSummary {
  factorId: string;
  category: string;
  /** 加法はφ_i(円)、乗法はc_i(対数)。 */
  shapley: number;
  displayAmount: number | null;
  displayMultiplier: number | null;
  isZero: boolean;
}

export interface BaselinePairSummary {
  methodIdA: string;
  methodIdB: string;
  analysisUnit: "cross_method";
  status: "decomposed" | "stopped";
  valueA: number;
  valueB: number;
  /** 金額差 V_A − V_B。停止ペアでも残す。 */
  absoluteDifference: number | null;
  lnRatio: number | null;
  zeroMeaningA: string | null;
  zeroMeaningB: string | null;
  recipeId: string | null;
  recipeVersion: string | null;
  reviewStatus: string | null;
  /** 停止時のみ。 */
  stopReason: StopReasonCode | null;
  missingDataItems: string[];
  /** 分解時のみ。 */
  mode: "additive" | "multiplicative" | null;
  decompositionKind: "full" | "partial" | null;
  vStar: number | null;
  totalDifference: number | null;
  explainedSum: number | null;
  contributions: BaselineContributionSummary[];
  residual: {
    value: number;
    displayMultiplier: number | null;
    ratio: number | null;
    ratioUnavailableReason: string | null;
    unclassified: boolean;
    knownUnquantifiedCount: number;
    nextActionCount: number;
  } | null;
  reverseDefined: boolean | null;
  evaluationCount: number | null;
  qualitativeDifferenceCategories: string[];
  implication: string;
}

export interface BaselineBreakdownSummary {
  parentMethodId: string;
  aggregationFormula: string;
  components: { subFactorId: string; value: number; zeroMeaning: string | null; selectedByAggregation: boolean }[];
  aggregate: { value: number; mixesValueConcepts: boolean } | null;
}

export interface BaselineSummary {
  recordCount: number;
  zeroValueRecords: string[];
  subject: { id: string; waterSource: string | null; waterUse: string | null; provenance: string; identityRuleVersion: string };
  groups: {
    valueConcept: string;
    parentMethodIds: string[];
    recordMethodIds: string[];
    crossMethodPairCount: number;
    breakdownAnalysisCount: number;
    groupLimitExceeded: boolean;
  }[];
  pairs: {
    total: number;
    decomposed: number;
    stopped: number;
    byMode: Record<string, number>;
    byStopReason: Record<string, number>;
    withZeroValue: number;
  };
  /** 許容誤差を超える寄与を持つ件数(要因ID別)。 */
  nonZeroContributionsByFactor: Record<string, number>;
  crossMethodPairs: BaselinePairSummary[];
  breakdownAnalyses: BaselineBreakdownSummary[];
  corpus: CorpusSummary;
  versions: typeof WATER_CASE_VERSIONS;
}

function zeroMeaningCodeOf(pair: PairwiseDecompositionV2, side: "A" | "B"): string | null {
  const meaning = side === "A" ? pair.zeroMeaningA : pair.zeroMeaningB;
  return meaning?.code ?? null;
}

export function summarizePair(pair: PairwiseDecompositionV2): BaselinePairSummary {
  const common = {
    methodIdA: pair.methodIdA,
    methodIdB: pair.methodIdB,
    analysisUnit: "cross_method" as const,
    valueA: pair.valueA,
    valueB: pair.valueB,
    absoluteDifference: pair.diagnostics.absoluteDifference,
    lnRatio: pair.diagnostics.lnRatio,
    zeroMeaningA: zeroMeaningCodeOf(pair, "A"),
    zeroMeaningB: zeroMeaningCodeOf(pair, "B"),
    recipeId: pair.recipe?.id ?? null,
    recipeVersion: pair.recipe?.version ?? null,
    reviewStatus: pair.recipe?.reviewStatus ?? null,
    qualitativeDifferenceCategories: pair.qualitativeDifferences.map((difference) => difference.category),
    implication: pair.implication.kind,
  };

  if (pair.status === "stopped") {
    return {
      ...common,
      status: "stopped",
      stopReason: pair.reason,
      missingDataItems: pair.missingData.map((action) => action.item),
      mode: null,
      decompositionKind: null,
      vStar: null,
      totalDifference: null,
      explainedSum: null,
      contributions: [],
      residual: null,
      reverseDefined: null,
      evaluationCount: null,
    };
  }

  const decomposed: DecomposedPair = pair;
  return {
    ...common,
    status: "decomposed",
    stopReason: null,
    missingDataItems: decomposed.residual.nextActions.map((action) => action.item),
    mode: decomposed.mode,
    decompositionKind: decomposed.kind,
    vStar: decomposed.vStar,
    totalDifference: decomposed.totalDifference,
    explainedSum: decomposed.explainedSum,
    contributions: decomposed.contributions.map((contribution) => ({
      factorId: contribution.factorId,
      category: contribution.category,
      shapley: contribution.shapley,
      displayAmount: contribution.displayAmount,
      displayMultiplier: contribution.displayMultiplier,
      isZero: contribution.isZero,
    })),
    residual: {
      value: decomposed.residual.value,
      displayMultiplier: decomposed.residual.displayMultiplier,
      ratio: decomposed.residual.ratio,
      ratioUnavailableReason: decomposed.residual.ratioUnavailableReason ?? null,
      unclassified: decomposed.residual.unclassified,
      knownUnquantifiedCount: decomposed.residual.knownUnquantified.length,
      nextActionCount: decomposed.residual.nextActions.length,
    },
    reverseDefined: decomposed.reverse.defined,
    evaluationCount: decomposed.evaluationCount,
  };
}

/**
 * §6.5 のコーパス指標。母集団(manifest)は結果を見る前に固定する。
 * 水既定ケースの候補ペアは手法間4件(内訳間3件は別の分析単位であり母数に入れない)。
 */
export const WATER_CASE_MANIFEST: CorpusManifest = {
  candidatePairCount: 4,
  primaryEvidence: [],
  negativeExamples: [
    "replacement-cost × ifvi-water-consumption.VFaccess(反実仮想不能・停止例)",
    "lime3-water × ifvi-water-consumption.VFnutrition(公表0を含む加法)",
    "lime3-water × ifvi-water-consumption.VFdisease(公表0を含む加法)",
    "lime3-water × ifvi-water-consumption.VFes(地理較正のゼロ寄与・残差が全体差)",
  ],
};

export function summarizeBaseline(
  decomposition: DivergenceDecompositionV2,
  records: ValuationRecord[],
  manifest: CorpusManifest = WATER_CASE_MANIFEST
): BaselineSummary {
  const pairs = decomposition.groups.flatMap((group) => group.crossMethodPairs);
  const byMode: Record<string, number> = {};
  const byStopReason: Record<string, number> = {};
  const nonZeroContributionsByFactor: Record<string, number> = {};
  let withZeroValue = 0;

  for (const pair of pairs) {
    if (pair.valueA === 0 || pair.valueB === 0) withZeroValue++;
    if (pair.status === "stopped") {
      byStopReason[pair.reason] = (byStopReason[pair.reason] ?? 0) + 1;
      continue;
    }
    byMode[pair.mode] = (byMode[pair.mode] ?? 0) + 1;
    for (const contribution of pair.contributions) {
      if (!contribution.isZero) {
        nonZeroContributionsByFactor[contribution.factorId] = (nonZeroContributionsByFactor[contribution.factorId] ?? 0) + 1;
      }
    }
  }

  const entries: CorpusEntry[] = pairs.map((pair) => ({
    subjectId: decomposition.subject.id,
    pair,
    recipeVersion: pair.recipe ? `${pair.recipe.id}@${pair.recipe.version}` : "(レシピ未登録)",
    currency: "JPY",
  }));

  const flow = decomposition.subject.flow;
  return {
    recordCount: records.length,
    zeroValueRecords: records.filter((record) => Number(record.centralValue) === 0).map((record) => record.methodId),
    subject: {
      id: decomposition.subject.id,
      waterSource: flow.kind === "water" ? flow.waterSource : null,
      waterUse: flow.kind === "water" ? flow.waterUse : null,
      provenance: decomposition.subject.provenance,
      identityRuleVersion: decomposition.subject.identityRuleVersion,
    },
    groups: decomposition.groups.map((group) => ({
      valueConcept: group.valueConcept,
      parentMethodIds: group.parentMethodIds,
      recordMethodIds: group.recordMethodIds,
      crossMethodPairCount: group.crossMethodPairs.length,
      breakdownAnalysisCount: group.breakdownAnalyses.length,
      groupLimitExceeded: group.groupLimit.exceeded,
    })),
    pairs: {
      total: pairs.length,
      decomposed: pairs.filter((pair) => pair.status === "decomposed").length,
      stopped: pairs.filter((pair) => pair.status === "stopped").length,
      byMode,
      byStopReason,
      withZeroValue,
    },
    nonZeroContributionsByFactor,
    crossMethodPairs: pairs.map(summarizePair),
    breakdownAnalyses: decomposition.groups.flatMap((group) =>
      group.breakdownAnalyses.map((analysis) => ({
        parentMethodId: analysis.parentMethodId,
        aggregationFormula: analysis.aggregationFormula,
        components: analysis.components.map((component) => ({
          subFactorId: component.subFactorId,
          value: component.value,
          zeroMeaning: component.zeroMeaning?.code ?? null,
          selectedByAggregation: component.selectedByAggregation,
        })),
        aggregate: analysis.aggregate
          ? { value: analysis.aggregate.value, mixesValueConcepts: analysis.aggregate.mixesValueConcepts }
          : null,
      }))
    ),
    corpus: summarizeCorpus(entries, manifest),
    versions: WATER_CASE_VERSIONS,
  };
}
