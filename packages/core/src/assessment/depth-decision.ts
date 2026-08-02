/**
 * M2 D-3:深掘りへの昇格(暫定的な上位20%閾値+手動上書き)。D-4:除外理由の記録。
 * 参照元: docs/requirements/m2-assessment-execution.md §3・§4
 *
 * 「上位20%」は暫定値(design-rationale-log D-26・M4 F-3/F-8と同じ扱い)。
 * 手動上書きは、優先度算定の結果によらずユーザーが深掘りを指定できる経路であり、
 * これがないと優先度算定が事実上の「推奨」になってしまう(D-23)。
 */

import type { DepthDecision, PriorityScore } from "../types/assessment";

const DEFAULT_PROMOTION_PERCENTILE = 0.2;

export interface ComputeDepthDecisionsOptions {
  promotionPercentile?: number;
  /** 優先度算定の結果によらず深掘り対象に指定するmaterialIssueIdの集合。 */
  manualOverrides?: Set<string>;
}

export function computeDepthDecisions(
  priorityScores: PriorityScore[],
  options: ComputeDepthDecisionsOptions = {}
): DepthDecision[] {
  const promotionPercentile = options.promotionPercentile ?? DEFAULT_PROMOTION_PERCENTILE;
  const manualOverrides = options.manualOverrides ?? new Set<string>();

  const promotionCount = Math.ceil(priorityScores.length * promotionPercentile);
  const sortedDescending = [...priorityScores].sort((a, b) => b.normalizedScore - a.normalizedScore);
  const autoPromotedIds = new Set(sortedDescending.slice(0, promotionCount).map((s) => s.materialIssueId));

  return priorityScores.map((score): DepthDecision => {
    const promotedManually = manualOverrides.has(score.materialIssueId);
    const promoted = promotedManually || autoPromotedIds.has(score.materialIssueId);

    if (promoted) {
      return {
        materialIssueId: score.materialIssueId,
        depth: "deep_dive",
        promotedManually,
        excludedFromDeepDive: false,
        assumptionEntryIds: [],
      };
    }

    return {
      materialIssueId: score.materialIssueId,
      depth: "screening",
      promotedManually: false,
      excludedFromDeepDive: true,
      exclusionReason: `優先度算定の結果(normalizedScore=${score.normalizedScore.toFixed(3)})が上位${Math.round(
        promotionPercentile * 100
      )}%に入らなかったため、深掘り評価には進みません。`,
      assumptionEntryIds: [],
    };
  });
}
