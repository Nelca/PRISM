import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type { DivergenceDecomposition, PairwiseDecomposition } from "@core/types/divergence";

export function decompositionForMaterialIssue(
  result: DemoPipelineResult,
  materialIssueId: string
): DivergenceDecomposition | undefined {
  return result.valuation.divergenceDecompositions.find((d) => d.id === `dd-${materialIssueId}`);
}

export function hasRepresentativeSelection(result: DemoPipelineResult, materialIssueId: string): boolean {
  return decompositionForMaterialIssue(result, materialIssueId)?.representativeValueSelection !== undefined;
}

export function materialIssueIdsWithoutRepresentativeSelection(result: DemoPipelineResult): string[] {
  return Object.keys(result.valuation.valuationRecordsByMaterialIssue).filter(
    (materialIssueId) =>
      decompositionForMaterialIssue(result, materialIssueId) !== undefined &&
      !hasRepresentativeSelection(result, materialIssueId)
  );
}

export function representativeCentralValueForMaterialIssue(
  result: DemoPipelineResult,
  materialIssueId: string
): number | undefined {
  const records = result.valuation.valuationRecordsByMaterialIssue[materialIssueId];
  const recordId = result.valuation.representativeRecordByMaterialIssue[materialIssueId];
  const record = records?.find((candidate) => candidate.id === recordId);
  return record ? Number(record.centralValue) : undefined;
}

export function hasDegenerateRepresentative(result: DemoPipelineResult, siteId: string): boolean {
  return result.assessment.materialIssues
    .filter((issue) => issue.siteId === siteId)
    .some((issue) => representativeCentralValueForMaterialIssue(result, issue.id) === 0);
}

export function sitesWithDegenerateRepresentative(
  result: DemoPipelineResult
): { siteId: string; siteName: string; uninternalizedCost: number; zeroRepresentative: boolean }[] {
  return result.decisions
    .filter((decision) => {
      const uninternalizedCost = Number(decision.financialBridge.internalizationStatus.uninternalizedCost);
      return uninternalizedCost < 0 || hasDegenerateRepresentative(result, decision.siteId);
    })
    .map((decision) => ({
      siteId: decision.siteId,
      siteName: decision.siteName,
      uninternalizedCost: Number(decision.financialBridge.internalizationStatus.uninternalizedCost),
      zeroRepresentative: hasDegenerateRepresentative(result, decision.siteId),
    }));
}

export function pairDivergenceRatio(pair: PairwiseDecomposition): number | null {
  const ratio = pair.ratio;
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return null;
  return ratio >= 1 ? ratio : 1 / ratio;
}

export function maxDivergenceRatio(decomposition: DivergenceDecomposition): number | null {
  const ratios = decomposition.groups
    .flatMap((group) => group.pairwiseDecompositions.map(pairDivergenceRatio))
    .filter((ratio): ratio is number => ratio !== null);
  return ratios.length > 0 ? Math.max(...ratios) : null;
}
