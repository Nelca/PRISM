import { describe, expect, it } from "vitest";
import { computeDepthDecisions } from "./depth-decision";
import type { PriorityScore } from "../types/assessment";

function score(materialIssueId: string, normalizedScore: number): PriorityScore {
  return {
    materialIssueId,
    sensitivity: 0,
    financialExposure: 0,
    uncertaintyMagnitude: 0,
    disclosureRequirement: 0,
    normalizedScore,
  };
}

describe("computeDepthDecisions", () => {
  it("要件定義書の例:4件中上位1件(ceil(4×0.2)=1)のみ深掘りに昇格する", () => {
    const scores = [score("A", 3.125), score("B", 2.375), score("C", 2.625), score("D", 1.875)];
    const decisions = computeDepthDecisions(scores);
    const byId = Object.fromEntries(decisions.map((d) => [d.materialIssueId, d]));

    expect(byId.A.depth).toBe("deep_dive");
    expect(byId.A.excludedFromDeepDive).toBe(false);
    expect(byId.A.promotedManually).toBe(false);

    for (const id of ["B", "C", "D"]) {
      expect(byId[id].depth).toBe("screening");
      expect(byId[id].excludedFromDeepDive).toBe(true);
      expect(byId[id].exclusionReason).toBeDefined();
    }
  });

  it("手動上書きは優先度算定の結果によらず深掘りに昇格させる(promotedManually=true)", () => {
    const scores = [score("A", 3.125), score("B", 2.375), score("C", 2.625), score("D", 1.875)];
    const decisions = computeDepthDecisions(scores, { manualOverrides: new Set(["D"]) });
    const byId = Object.fromEntries(decisions.map((d) => [d.materialIssueId, d]));

    expect(byId.D.depth).toBe("deep_dive");
    expect(byId.D.promotedManually).toBe(true);
    expect(byId.D.excludedFromDeepDive).toBe(false);
    // 自動昇格対象(A)はpromotedManually=falseのまま
    expect(byId.A.promotedManually).toBe(false);
  });

  it("promotionPercentileを変更すると昇格件数が変わる", () => {
    const scores = [score("A", 4), score("B", 3), score("C", 2), score("D", 1)];
    const decisions = computeDepthDecisions(scores, { promotionPercentile: 0.5 });
    const promoted = decisions.filter((d) => d.depth === "deep_dive");
    expect(promoted).toHaveLength(2); // ceil(4×0.5)=2
  });

  it("除外されたDepthDecisionはassumptionEntryIdsを持つ(将来のM8接続用)", () => {
    const scores = [score("A", 1)];
    const [decision] = computeDepthDecisions(scores);
    expect(decision.assumptionEntryIds).toEqual([]);
  });
});
