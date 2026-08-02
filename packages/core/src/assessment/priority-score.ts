/**
 * M2 D-2:優先度算定(PriorityScore組み立て)。
 * 参照元: docs/requirements/m2-assessment-execution.md §2
 *
 * 4項目(感応度・財務エクスポージャ・不確実性の大きさ・開示必須性)はすべてM1・M3の
 * 既存出力の再利用で構成する。新しい財務データソース・重み付けは要求しない。
 * 単位が異なる4項目は、加算する前に同一バッチ内の百分位順位(percentile-rank.ts)に
 * 変換してから単純合算する(等重み)。
 */

import { computePercentileRanks } from "./percentile-rank";
import { getDisclosureRequirement } from "./disclosure-requirement";
import type { ImpactCategory } from "../types/common";
import type { PriorityScore } from "../types/assessment";
import type { ExchangeValuationRecord } from "../types/valuation";

export interface PriorityScoreInput {
  materialIssueId: string;
  /** M1のMaterialIssue.sensitivityScore(0〜5)をそのまま使う。 */
  sensitivityScore: number;
  /** スクリーニング深度で生成された交換価値ValuationRecord(M3)。 */
  screeningValuationRecord: ExchangeValuationRecord;
  impactCategory: ImpactCategory;
}

export function computePriorityScores(inputs: PriorityScoreInput[]): PriorityScore[] {
  const sensitivities = inputs.map((input) => input.sensitivityScore);
  const financialExposures = inputs.map((input) => input.screeningValuationRecord.centralValue as number);
  const uncertaintyMagnitudes = inputs.map((input) => {
    const { p5, p95 } = input.screeningValuationRecord.quantileRange;
    return Math.log(p95 / p5);
  });
  const disclosureRequirements = inputs.map((input) => getDisclosureRequirement(input.impactCategory));

  const sensitivityRanks = computePercentileRanks(sensitivities);
  const financialRanks = computePercentileRanks(financialExposures);
  const uncertaintyRanks = computePercentileRanks(uncertaintyMagnitudes);
  const disclosureRanks = computePercentileRanks(disclosureRequirements);

  return inputs.map((input, i) => ({
    materialIssueId: input.materialIssueId,
    sensitivity: sensitivities[i],
    financialExposure: financialExposures[i],
    uncertaintyMagnitude: uncertaintyMagnitudes[i],
    disclosureRequirement: disclosureRequirements[i],
    normalizedScore: sensitivityRanks[i] + financialRanks[i] + uncertaintyRanks[i] + disclosureRanks[i],
  }));
}
