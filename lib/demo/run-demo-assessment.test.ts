import { describe, expect, it } from "vitest";
import { createIdSequence } from "@core/pipeline/ids";
import { emptyInteractionState } from "./interaction-state";
import { runDemoAssessment } from "./run-demo-assessment";
import { DEFAULT_DEEP_DIVE_PARAMS } from "./user-site-defaults";

const NOW = "2027-02-14T09:12:00Z";

describe("runDemoAssessment user controls", () => {
  it("既定で手動昇格する課題も、利用者の概算評価への変更を優先する", () => {
    const interactions = emptyInteractionState();
    interactions.depthOverrides.set("site-user-test-mi-water", "demote");
    const result = runDemoAssessment(
      [{
        row: { id: "site-user-test", name: "試験工場", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 139 },
        deepDive: { ...DEFAULT_DEEP_DIVE_PARAMS, category: "water", forcePromote: true },
      }],
      interactions,
      createIdSequence("assessment-test"),
      NOW
    );

    expect(result.depthDecisions.find((entry) => entry.materialIssueId === "site-user-test-mi-water")?.depth).toBe("screening");
  });

  it("GHGを選んだ追加拠点には気候課題だけを作る", () => {
    const result = runDemoAssessment(
      [{
        row: { id: "site-user-ghg", name: "GHG試験工場", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 139 },
        deepDive: { ...DEFAULT_DEEP_DIVE_PARAMS, category: "climate", unit: "tCO2e", forcePromote: true },
      }],
      emptyInteractionState(),
      createIdSequence("assessment-ghg-test"),
      NOW
    );

    const categories = result.materialIssues
      .filter((issue) => issue.siteId === "site-user-ghg")
      .map((issue) => issue.impactCategory);
    expect(categories).toEqual(["climate"]);
  });
});
