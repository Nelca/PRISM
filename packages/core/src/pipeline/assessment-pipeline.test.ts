import { describe, expect, it } from "vitest";
import { runAssessmentPipeline } from "./assessment-pipeline";
import { createIdSequence } from "./ids";
import { IDENTITY_CALIBRATION } from "../divergence/test-helpers";
import { exchangeAmount } from "../types/common";
import type { SiteRow } from "../site/ingest";
import type { ExchangeValuationRecord } from "../types/valuation";
import type { MaterialIssue } from "../types/site";

const NOW = "2026-08-02T00:00:00Z";

function makeScreeningRecord(centralValue: number): ExchangeValuationRecord {
  return {
    id: `vr-${centralValue}`,
    methodId: "replacement-cost",
    methodVersion: "1.0.0",
    physicalQuantityId: "pq-1",
    siteId: "site-A",
    aopCode: "not_applicable",
    aopSourceLabel: "test",
    aopMappingConfidence: "high",
    quantileRange: { p5: centralValue * 0.8, p50: centralValue, p95: centralValue * 1.2 },
    parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
    transferFitness: { tier: "not_applicable" },
    discountRate: null,
    discountRateStatus: "no_time_dimension",
    geographicCalibration: IDENTITY_CALIBRATION,
    scopeExclusions: [],
    recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
    assumptionEntryIds: [],
    recalculationHash: "placeholder:test",
    valueConcept: "exchange",
    centralValue: exchangeAmount(centralValue),
  };
}

describe("runAssessmentPipeline", () => {
  const rows: SiteRow[] = [
    { id: "site-A", name: "拠点A", siteType: "own_site", industrySector: "chemicals", lat: 35.0, lng: 139.0 },
    { id: "site-B", name: "拠点B", siteType: "own_site", industrySector: "steel", address: "存在しない住所" },
  ];

  it("座標解決に成功した拠点はMaterialIssue・優先度・昇格判定まで通り、AssumptionEntryが実際に生成される", () => {
    const result = runAssessmentPipeline({
      rows,
      geocode: () => null, // site-Bは失敗する想定
      interfacesByCategoryForSite: () => ({ water: [] }),
      excludedCategoriesForSite: () => ["water"],
      screeningValuationForMaterialIssue: (issue: MaterialIssue) =>
        makeScreeningRecord(issue.siteId === "site-A" ? 1_000_000 : 100),
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.ingestionErrors).toHaveLength(0);
    expect(result.sites).toHaveLength(2);

    const siteAIssue = result.materialIssues.find((i) => i.siteId === "site-A")!;
    expect(siteAIssue.excluded).toBe(false);

    const siteBIssue = result.materialIssues.find((i) => i.siteId === "site-B")!;
    expect(siteBIssue.excluded).toBe(true);
    expect(siteBIssue.assumptionEntryIds).toHaveLength(1);

    // M1のAssumptionEntry(site-Bの除外)が実際に生成されている
    const m1Entry = result.assumptionEntries.find((e) => e.sourceModule === "M1")!;
    expect(m1Entry).toBeDefined();
    expect(m1Entry.payload).toEqual({ module: "M1", kind: "exclusion", reason: expect.stringContaining("ジオコーディング") });
    expect(siteBIssue.assumptionEntryIds).toEqual([m1Entry.id]);

    // M2のAssumptionEntry(DepthDecisionごと)が実際に生成され、IDが反映されている
    expect(result.depthDecisions).toHaveLength(1); // site-Bは評価対象外(excludedのため優先度算定に含まれない)
    const decision = result.depthDecisions[0];
    expect(decision.assumptionEntryIds).toHaveLength(1);
    const m2Entry = result.assumptionEntries.find((e) => e.id === decision.assumptionEntryIds[0])!;
    expect(m2Entry.sourceModule).toBe("M2");
    expect(m2Entry.relatedRecordId).toBe(decision.materialIssueId);
  });

  it("除外された拠点は優先度算定・昇格判定の対象に含まれない", () => {
    const result = runAssessmentPipeline({
      rows,
      geocode: () => null,
      interfacesByCategoryForSite: () => ({ water: [] }),
      excludedCategoriesForSite: () => ["water"],
      screeningValuationForMaterialIssue: () => makeScreeningRecord(1_000_000),
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.priorityScores).toHaveLength(1);
    expect(result.priorityScores[0].materialIssueId).toContain("site-A");
  });
});
