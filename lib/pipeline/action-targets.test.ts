import { describe, expect, it } from "vitest";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { hasDecisionSite, hasDisclosureClaim, hasMaterialIssue, hasValuationSelection } from "./action-targets";

describe("Server Action targets", () => {
  const result = runDemoPipeline();

  it("現在のrunに実在する対象だけを受け付ける", () => {
    const issue = result.assessment.materialIssues[0];
    const [materialIssueId, records] = Object.entries(result.valuation.valuationRecordsByMaterialIssue)[0];
    const record = records[0];
    expect(hasMaterialIssue(result, issue.id)).toBe(true);
    expect(hasDecisionSite(result, result.decisions[0].siteId)).toBe(true);
    expect(hasDisclosureClaim(result, result.disclosureClaims[0].id)).toBe(true);
    expect(hasValuationSelection(result, materialIssueId, record.id, record.methodId)).toBe(true);
  });

  it("未知または組み合わせの違うIDを拒否する", () => {
    expect(hasMaterialIssue(result, "missing")).toBe(false);
    expect(hasDecisionSite(result, "missing")).toBe(false);
    expect(hasDisclosureClaim(result, "missing")).toBe(false);
    const [materialIssueId, records] = Object.entries(result.valuation.valuationRecordsByMaterialIssue)[0];
    expect(hasValuationSelection(result, materialIssueId, records[0].id, "wrong-method")).toBe(false);
  });
});
