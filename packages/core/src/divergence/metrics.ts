/**
 * M4完成 §6.5:コーパス指標(実証指標)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.5
 *
 * 集計単位は「対象ID × 手法ペア × レシピ版」で1件とする。逆方向(A/B入替)は同じ件に併記し、
 * 件数を水増ししない。分母0は 0% ではなく `"not_applicable"` を返す。
 * 未分類残差の**金額割合**は、既知理由への数値配分がない限り算出しない(§6.5 末尾)ため、
 * この関数は件数率だけを返す。
 */

import type { PairwiseDecompositionV2, StopReasonCode } from "../types/divergence";
import { TOLERANCE_POLICY, isZeroWithinTolerance, toleranceScale } from "./tolerance";

export type MetricValue = number | "not_applicable";

/** 同一対象・同一価値概念・符号意味・正規化条件のいずれかを満たさない停止理由(§6.5 比較可能率)。 */
export const NOT_COMPARABLE_STOP_REASONS: StopReasonCode[] = [
  "different_subject",
  "value_concept_mismatch",
  "sign_mismatch",
  "counterfactual_sign_mismatch",
  "non_finite",
  "normalization_mismatch",
];

export interface CorpusEntry {
  subjectId: string;
  pair: PairwiseDecompositionV2;
  recipeVersion: string;
  /** 加法残差の通貨。分布は通貨ごとに分ける(§6.5)。既定 "JPY"。 */
  currency?: string;
}

export interface CorpusManifest {
  /** 結果を見る前に固定した候補ペアの母集団。 */
  candidatePairCount: number;
  primaryEvidence: string[];
  negativeExamples: string[];
}

export interface ResidualDistribution {
  count: number;
  min: number;
  max: number;
  median: number;
}

export interface CorpusSummary {
  manifest: CorpusManifest;
  toleranceVersion: string;
  /** 方向重複を除いた集計件数。 */
  countedEntries: number;
  duplicatesDropped: number;
  comparablePairCount: number;
  comparableRate: MetricValue;
  decomposedCount: number;
  /** 全候補ペアを分母にした率。 */
  decompositionRateOverall: MetricValue;
  /** 比較可能ペアを分母にした条件付き率。 */
  decompositionRateAmongComparable: MetricValue;
  /** 許容誤差を超える寄与を持つ件数(要因別)。 */
  nonZeroContributionCountsByFactor: Record<string, number>;
  /** 寄与合計も許容誤差を超える件数(状態B通過用の実例)。 */
  pairsWithNonZeroExplainedSum: number;
  additiveResidualDistributionByCurrency: Record<string, ResidualDistribution>;
  /** 乗法残差は対数値として別に集計する。 */
  multiplicativeResidualDistribution: ResidualDistribution | null;
  residualRatioNullCount: number;
  nonZeroResidualCount: number;
  /** 非ゼロ残差があり、根拠付きの定性差異候補も特定できない件数 / 非ゼロ残差件数。 */
  unclassifiedResidualCaseRate: MetricValue;
  /** 停止は0にせず、欠測理由として理由別に数える。 */
  stopReasonCounts: Record<string, number>;
}

function rate(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return "not_applicable";
  return numerator / denominator;
}

function distribution(values: number[]): ResidualDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return { count: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], median };
}

/** 対象ID × 手法ペア(順序非依存)× レシピ版 で1件にする。 */
function entryKey(entry: CorpusEntry): string {
  const methods = [entry.pair.methodIdA, entry.pair.methodIdB].sort().join("~");
  return `${entry.subjectId}|${methods}|${entry.recipeVersion}`;
}

export function summarizeCorpus(entries: CorpusEntry[], manifest: CorpusManifest): CorpusSummary {
  const seen = new Set<string>();
  const unique: CorpusEntry[] = [];
  let duplicatesDropped = 0;
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) {
      duplicatesDropped++;
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  const stopReasonCounts: Record<string, number> = {};
  const nonZeroContributionCountsByFactor: Record<string, number> = {};
  const additiveResiduals: Record<string, number[]> = {};
  const multiplicativeResiduals: number[] = [];

  let comparablePairCount = 0;
  let decomposedCount = 0;
  let pairsWithNonZeroExplainedSum = 0;
  let residualRatioNullCount = 0;
  let nonZeroResidualCount = 0;
  let unclassifiedResidualCount = 0;

  for (const entry of unique) {
    const pair = entry.pair;
    if (pair.status === "stopped") {
      stopReasonCounts[pair.reason] = (stopReasonCounts[pair.reason] ?? 0) + 1;
      if (!NOT_COMPARABLE_STOP_REASONS.includes(pair.reason)) comparablePairCount++;
      continue;
    }

    comparablePairCount++;
    decomposedCount++;

    const spec = pair.mode === "multiplicative" ? TOLERANCE_POLICY.log : TOLERANCE_POLICY.money;
    const scale = toleranceScale([
      ...pair.contributions.map((contribution) => contribution.shapley),
      pair.residual.value,
      pair.totalDifference,
      pair.explainedSum,
    ]);

    for (const contribution of pair.contributions) {
      if (!contribution.isZero) {
        nonZeroContributionCountsByFactor[contribution.factorId] = (nonZeroContributionCountsByFactor[contribution.factorId] ?? 0) + 1;
      }
    }
    if (!isZeroWithinTolerance(pair.explainedSum, scale, spec)) pairsWithNonZeroExplainedSum++;

    if (pair.residual.ratio === null) residualRatioNullCount++;
    if (!isZeroWithinTolerance(pair.residual.value, scale, spec)) {
      nonZeroResidualCount++;
      if (pair.residual.unclassified) unclassifiedResidualCount++;
    }

    if (pair.mode === "multiplicative") {
      multiplicativeResiduals.push(pair.residual.value);
    } else {
      const currency = entry.currency ?? "JPY";
      (additiveResiduals[currency] ??= []).push(pair.residual.value);
    }
  }

  const additiveResidualDistributionByCurrency: Record<string, ResidualDistribution> = {};
  for (const [currency, values] of Object.entries(additiveResiduals)) {
    additiveResidualDistributionByCurrency[currency] = distribution(values);
  }

  return {
    manifest,
    toleranceVersion: TOLERANCE_POLICY.version,
    countedEntries: unique.length,
    duplicatesDropped,
    comparablePairCount,
    comparableRate: rate(comparablePairCount, manifest.candidatePairCount),
    decomposedCount,
    decompositionRateOverall: rate(decomposedCount, manifest.candidatePairCount),
    decompositionRateAmongComparable: rate(decomposedCount, comparablePairCount),
    nonZeroContributionCountsByFactor,
    pairsWithNonZeroExplainedSum,
    additiveResidualDistributionByCurrency,
    multiplicativeResidualDistribution: multiplicativeResiduals.length > 0 ? distribution(multiplicativeResiduals) : null,
    residualRatioNullCount,
    nonZeroResidualCount,
    unclassifiedResidualCaseRate: rate(unclassifiedResidualCount, nonZeroResidualCount),
    stopReasonCounts,
  };
}
