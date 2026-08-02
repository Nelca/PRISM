/**
 * M1統合テスト(実装計画フェーズ6)。
 * 行データ(CSV相当)→Site→座標解決(Locate前提)→NatureInterface生成(Locate)→
 * CriteriaMet判定→MaterialIssue組み立てまでを、モックのgeocode/layerLookupsで通しで検証する。
 */
import { describe, expect, it } from "vitest";
import { buildSitesFromRows } from "./ingest";
import type { SiteRow } from "./ingest";
import { resolveSiteLocation } from "./location";
import { buildNatureInterfaces } from "./locate";
import type { LayerLookup } from "./locate";
import { buildExcludedMaterialIssue, buildMaterialIssues } from "./build-material-issues";

describe("M1統合テスト:CSV相当の行データからMaterialIssueまで通しで検証する", () => {
  it("座標がある拠点はジオコーディングなしでそのままLocateに進む", () => {
    const rows: SiteRow[] = [
      { id: "site-001", name: "工場A", siteType: "own_site", industrySector: "chemicals", lat: 35.0, lng: 139.0 },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(errors).toHaveLength(0);

    const resolution = resolveSiteLocation(sites[0], () => null); // geocodeは呼ばれないはず
    expect(resolution.excluded).toBe(false);

    const layerLookups: LayerLookup[] = [
      { layerType: "protected_area", dataSource: "WDPA", licenseMode: "pending_review", lookup: () => true },
    ];
    const interfaces = buildNatureInterfaces(resolution.site, layerLookups);
    expect(interfaces).toHaveLength(1);

    const issues = buildMaterialIssues(resolution.site.id, { climate: interfaces });
    expect(issues[0].criteriaMet.highBiodiversityImportance).toBe(true);
  });

  it("住所のみの拠点はジオコーディングが成功すればLocateに進む", () => {
    const rows: SiteRow[] = [
      { id: "site-002", name: "サプライヤーB", siteType: "supplier_site", industrySector: "textile", address: "大阪府1-1" },
    ];
    const { sites } = buildSitesFromRows(rows);

    const resolution = resolveSiteLocation(sites[0], (address) =>
      address === "大阪府1-1" ? { lat: 34.6937, lng: 135.5023 } : null
    );

    expect(resolution.excluded).toBe(false);
    expect(resolution.site.location).toMatchObject({ geocoded: true, lat: 34.6937, lng: 135.5023 });
  });

  it("座標・住所ともにない行はSite自体が作られず、MaterialIssueも生成されない", () => {
    const rows: SiteRow[] = [{ id: "site-003", name: "拠点C", siteType: "own_site", industrySector: "steel" }];
    const { sites, errors } = buildSitesFromRows(rows);

    expect(sites).toHaveLength(0);
    expect(errors[0].reason).toContain("座標・住所ともに不明");
  });

  it("住所はあるがジオコーディングに失敗した拠点は、Locateを実行せずexcluded=trueのMaterialIssueを生成する(M1 D-3)", () => {
    const rows: SiteRow[] = [
      { id: "site-004", name: "拠点D", siteType: "own_site", industrySector: "steel", address: "存在しない住所" },
    ];
    const { sites } = buildSitesFromRows(rows);

    const resolution = resolveSiteLocation(sites[0], () => null);

    expect(resolution.excluded).toBe(true);
    expect(resolution.exclusionReason).toBeDefined();

    // 座標が解決できずLocateが実行できないため、buildNatureInterfaces/buildMaterialIssuesは呼ばず、
    // 「評価対象にすら入らなかった」ことを監査可能なMaterialIssueとして直接記録する。
    const issue = buildExcludedMaterialIssue(resolution.site.id, "water", resolution.exclusionReason!);
    expect(issue.excluded).toBe(true);
    expect(issue.exclusionReason).toBe(resolution.exclusionReason);
    expect(issue.sensitivityScore).toBe(0);
  });

  it("要件定義書§2の具体例(化学工場・水ストレス地域)を、行データからMaterialIssueまで通しで再現する", () => {
    const rows: SiteRow[] = [
      { id: "site-042", name: "化学工場", siteType: "own_site", industrySector: "chemicals", lat: 12.0, lng: 34.0 },
    ];
    const { sites } = buildSitesFromRows(rows);
    const resolution = resolveSiteLocation(sites[0], () => null);

    const layerLookups: LayerLookup[] = [
      { layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", lookup: () => true }, // KBAから5km圏内
      { layerType: "water_stress", dataSource: "Aqueduct", licenseMode: "reference_only", lookup: () => true }, // 「高」
      {
        layerType: "dependency_impact",
        dataSource: "ENCORE",
        licenseMode: "reference_only",
        lookup: () => true, // 化学業種×水は「高」評価
      },
      { layerType: "protected_area", dataSource: "WDPA", licenseMode: "pending_review", lookup: () => false },
      { layerType: "ecosystem_integrity", dataSource: "FLII", licenseMode: "reference_only", lookup: () => false },
    ];

    const interfaces = buildNatureInterfaces(resolution.site, layerLookups);
    const issues = buildMaterialIssues(resolution.site.id, { water: interfaces });

    expect(issues).toHaveLength(1);
    expect(issues[0].sensitivityScore).toBe(3);
    expect(issues[0].criteriaMet).toEqual({
      highEcosystemIntegrity: false,
      rapidIntegrityDecline: false,
      highBiodiversityImportance: true,
      waterStress: true,
      likelySignificantDependencyImpact: true,
    });
  });
});
