import { describe, expect, it } from "vitest";
import { buildExcludedMaterialIssue, buildMaterialIssues } from "./build-material-issues";
import type { NatureInterface } from "../types/site";

function iface(overrides: Partial<NatureInterface> & Pick<NatureInterface, "layerType" | "rawResult">): NatureInterface {
  return {
    id: `ni-${overrides.layerType}`,
    siteId: "site-042",
    dataSource: "test",
    licenseMode: "reference_only",
    ...overrides,
  };
}

describe("buildMaterialIssues", () => {
  it("カテゴリごとに1件のMaterialIssueを生成する", () => {
    const issues = buildMaterialIssues("site-042", {
      water: [iface({ layerType: "water_stress", rawResult: true })],
      climate: [iface({ layerType: "dependency_impact", rawResult: true })],
    });

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.impactCategory).sort()).toEqual(["climate", "water"].sort());
  });

  it("各MaterialIssueのsensitivityScoreはcriteriaMetの充足数と一致する", () => {
    const issues = buildMaterialIssues("site-042", {
      water: [
        iface({ layerType: "kba", rawResult: true }),
        iface({ layerType: "water_stress", rawResult: true }),
        iface({ layerType: "dependency_impact", rawResult: true }),
      ],
    });

    expect(issues[0].sensitivityScore).toBe(3);
    expect(issues[0].excluded).toBe(false);
    expect(issues[0].siteId).toBe("site-042");
  });

  it("カテゴリ指定がない場合は空配列を返す", () => {
    expect(buildMaterialIssues("site-042", {})).toEqual([]);
  });
});

describe("buildExcludedMaterialIssue", () => {
  it("excluded=true・exclusionReason付きの監査可能なレコードを返す(M1 D-3)", () => {
    const issue = buildExcludedMaterialIssue("site-042", "water", "座標・住所ともに不明です(M1 D-3)。");

    expect(issue.excluded).toBe(true);
    expect(issue.exclusionReason).toBe("座標・住所ともに不明です(M1 D-3)。");
    expect(issue.sensitivityScore).toBe(0);
    expect(Object.values(issue.criteriaMet).every((v) => v === false)).toBe(true);
  });
});
