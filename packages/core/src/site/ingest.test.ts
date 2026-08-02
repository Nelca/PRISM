import { describe, expect, it } from "vitest";
import { buildSitesFromRows } from "./ingest";
import type { SiteRow } from "./ingest";

describe("buildSitesFromRows", () => {
  it("座標付きの行を正しくSiteに変換する", () => {
    const rows: SiteRow[] = [
      { id: "s1", name: "工場A", siteType: "own_site", industrySector: "chemicals", lat: 35.0, lng: 139.0 },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(errors).toHaveLength(0);
    expect(sites).toHaveLength(1);
    expect(sites[0].location).toEqual({ kind: "coordinates", lat: 35.0, lng: 139.0 });
  });

  it("住所のみの行はaddressバリアント(geocoded:false)になる", () => {
    const rows: SiteRow[] = [
      { id: "s2", name: "サプライヤーB", siteType: "supplier_site", industrySector: "textile", address: "大阪府1-1" },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(errors).toHaveLength(0);
    expect(sites[0].location).toEqual({ kind: "address", address: "大阪府1-1", geocoded: false });
  });

  it("座標・住所ともにない行はエラーとして除外される(M1 D-3)", () => {
    const rows: SiteRow[] = [{ id: "s3", name: "拠点C", siteType: "own_site", industrySector: "steel" }];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(sites).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain("座標・住所ともに不明");
  });

  it("緯度・経度の片方しかなく住所もない場合、座標・住所ともに不明とは別の理由でエラーになる", () => {
    const rows: SiteRow[] = [{ id: "s-partial", name: "拠点P", siteType: "own_site", industrySector: "steel", lat: 35.0 }];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(sites).toHaveLength(0);
    expect(errors[0].reason).toContain("片方しか指定されておらず");
    expect(errors[0].reason).not.toContain("座標・住所ともに不明");
  });

  it("緯度・経度の片方しかなくても住所があれば住所を使う", () => {
    const rows: SiteRow[] = [
      { id: "s-fallback", name: "拠点Q", siteType: "own_site", industrySector: "steel", lat: 35.0, address: "東京都" },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(errors).toHaveLength(0);
    expect(sites[0].location).toEqual({ kind: "address", address: "東京都", geocoded: false });
  });

  it("siteTypeが不正な値の場合はエラーになる", () => {
    const rows: SiteRow[] = [
      { id: "s4", name: "拠点D", siteType: "invalid_type", industrySector: "steel", lat: 1, lng: 1 },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(sites).toHaveLength(0);
    expect(errors[0].reason).toContain("siteType");
  });

  it("拠点名が空の場合はエラーになる", () => {
    const rows: SiteRow[] = [{ id: "s5", name: "  ", siteType: "own_site", industrySector: "steel", lat: 1, lng: 1 }];
    const { errors } = buildSitesFromRows(rows);
    expect(errors[0].reason).toContain("拠点名");
  });

  it("複数行のうち一部だけエラーの場合、正常な行だけsitesに含まれる", () => {
    const rows: SiteRow[] = [
      { id: "s6", name: "拠点E", siteType: "own_site", industrySector: "steel", lat: 1, lng: 1 },
      { id: "s7", name: "拠点F", siteType: "own_site", industrySector: "steel" },
    ];
    const { sites, errors } = buildSitesFromRows(rows);
    expect(sites).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});
