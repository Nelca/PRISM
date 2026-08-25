import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";

export function hasMaterialIssue(result: DemoPipelineResult, materialIssueId: string): boolean {
  return result.assessment.materialIssues.some((issue) => issue.id === materialIssueId);
}

export function hasDecisionSite(result: DemoPipelineResult, siteId: string): boolean {
  return result.decisions.some((decision) => decision.siteId === siteId);
}

export function hasDisclosureClaim(result: DemoPipelineResult, claimId: string): boolean {
  return result.disclosureClaims.some((claim) => claim.id === claimId);
}

export function hasValuationSelection(
  result: DemoPipelineResult,
  materialIssueId: string,
  recordId: string,
  methodId: string
): boolean {
  return (result.valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [])
    .some((record) => record.id === recordId && record.methodId === methodId);
}
