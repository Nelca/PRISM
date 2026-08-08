/**
 * M2統合テスト(実装計画フェーズ5)。
 * M1(site/)のMaterialIssueとM3(monetization/)のスクリーニングValuationRecordから
 * PriorityScore・DepthDecisionまでを通しで検証する。
 */
import { describe, expect, it } from "vitest";
import { buildMaterialIssues } from "../site/build-material-issues";
import { buildNatureInterfaces } from "../site/locate";
import type { LayerLookup } from "../site/locate";
import { buildValuationRecordsForPlugin } from "../monetization/build-valuation-records";
import { replacementCostPlugin } from "../monetization/plugins/replacement-cost";
import { computePriorityScores } from "./priority-score";
import { computeDepthDecisions } from "./depth-decision";
import { IDENTITY_CALIBRATION, TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";
import type { Site } from "../types/site";
import type { ExchangeValuationRecord, PhysicalQuantityInput } from "../types/valuation";

describe("M2統合テスト:M1のMaterialIssueとM3のスクリーニング結果からDepthDecisionまで通しで検証する", () => {
  const sites: Site[] = [
    { id: "site-A", name: "拠点A", siteType: "own_site", industrySector: "chemicals", location: { kind: "coordinates", lat: 1, lng: 1 } },
    { id: "site-B", name: "拠点B", siteType: "own_site", industrySector: "textile", location: { kind: "coordinates", lat: 2, lng: 2 } },
    { id: "site-C", name: "拠点C", siteType: "own_site", industrySector: "steel", location: { kind: "coordinates", lat: 3, lng: 3 } },
  ];

  // 拠点ごとに水ストレス・KBA該当有無を変え、感応度スコアに差をつける
  const layerLookupsBySite: Record<string, LayerLookup[]> = {
    "site-A": [
      // 本テストの関心はM2の優先度算定であり、ライセンス保留の挙動(GAP-08、site/criteria.tsのテスト)
      // ではないため、契約締結済み(embedded)として感応度に差が出る状態にしている。
      { layerType: "kba", dataSource: "IBAT", licenseMode: "embedded", lookup: () => true },
      { layerType: "water_stress", dataSource: "Aqueduct", licenseMode: "reference_only", lookup: () => true },
    ],
    "site-B": [{ layerType: "water_stress", dataSource: "Aqueduct", licenseMode: "reference_only", lookup: () => true }],
    "site-C": [],
  };

  // 拠点ごとに物理量・単価を変え、financialExposureに差をつける
  const physicalQuantities: Record<string, number> = { "site-A": 1000, "site-B": 100, "site-C": 10 };

  function buildScreeningRecord(site: Site) {
    const input: PhysicalQuantityInput = {
      category: "water",
      physicalQuantity: physicalQuantities[site.id],
      unit: "m3",
      siteId: site.id,
      sourceRegion: "JP",
      targetRegion: "JP",
    };
    const group = buildValuationRecordsForPlugin(replacementCostPlugin, {
      physicalQuantityId: `pq-${site.id}`,
      input,
      config: { depth: "screening", unitReplacementCost: 500 },
      calibration: IDENTITY_CALIBRATION,
      versions: TEST_VALUATION_VERSIONS,
    });
    // replacement-costは常にexchange概念を返す(monetization/plugins/replacement-cost.ts)
    return group.records[0] as ExchangeValuationRecord;
  }

  it("拠点ごとに異なる感応度・financialExposureからPriorityScoreとDepthDecisionが得られる", () => {
    const priorityInputs = sites.map((site) => {
      const interfaces = buildNatureInterfaces(site, layerLookupsBySite[site.id]);
      const [materialIssue] = buildMaterialIssues(site.id, { water: interfaces });
      const screeningValuationRecord = buildScreeningRecord(site);

      return {
        materialIssueId: materialIssue.id,
        sensitivityScore: materialIssue.sensitivityScore,
        screeningValuationRecord,
        impactCategory: materialIssue.impactCategory,
      };
    });

    // 感応度スコアがM1の判定通りであることを確認(site-A=2, site-B=1, site-C=0)
    expect(priorityInputs.find((i) => i.materialIssueId.includes("site-A"))?.sensitivityScore).toBe(2);
    expect(priorityInputs.find((i) => i.materialIssueId.includes("site-B"))?.sensitivityScore).toBe(1);
    expect(priorityInputs.find((i) => i.materialIssueId.includes("site-C"))?.sensitivityScore).toBe(0);

    const priorityScores = computePriorityScores(priorityInputs);
    const decisions = computeDepthDecisions(priorityScores);

    // 3件中上位1件(ceil(3×0.2)=1)のみ深掘りに昇格する。感応度・financialExposureとも
    // 最大のsite-Aが最上位になるはず
    const promoted = decisions.filter((d) => d.depth === "deep_dive");
    expect(promoted).toHaveLength(1);
    expect(promoted[0].materialIssueId).toContain("site-A");

    const excluded = decisions.filter((d) => d.excludedFromDeepDive);
    expect(excluded).toHaveLength(2);
    for (const d of excluded) {
      expect(d.exclusionReason).toBeDefined();
    }
  });

  it("M1のMaterialIssue.exclusionReasonとM2のDepthDecision.exclusionReasonは別フィールドである(M2 D-4)", () => {
    const site = sites[2]; // site-C: 感応度0だが、M1では除外されていない(座標があるため)
    const interfaces = buildNatureInterfaces(site, layerLookupsBySite[site.id]);
    const [materialIssue] = buildMaterialIssues(site.id, { water: interfaces });

    // M1側:このMaterialIssueは生成された時点でexcluded=false(座標があるため除外されない)
    expect(materialIssue.excluded).toBe(false);
    expect(materialIssue.exclusionReason).toBeUndefined();

    // M2側:深掘りには進まなかった場合、DepthDecision.exclusionReasonに別の理由が記録される
    const screeningValuationRecord = buildScreeningRecord(site);
    const priorityScores = computePriorityScores([
      {
        materialIssueId: materialIssue.id,
        sensitivityScore: materialIssue.sensitivityScore,
        screeningValuationRecord,
        impactCategory: materialIssue.impactCategory,
      },
    ]);
    const [decision] = computeDepthDecisions(priorityScores, { promotionPercentile: 0 });

    expect(decision.excludedFromDeepDive).toBe(true);
    expect(decision.exclusionReason).toContain("深掘り評価には進みません");
  });
});
