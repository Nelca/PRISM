import { describe, expect, it } from "vitest";
import { parseSitesCsv } from "./sites-template";
import { buildSitesFromRows } from "@core/site/ingest";

const SAMPLE_CSV = `# コメント行は無視される
site_id,name,site_type,industry_sector,lat,lng,address
site-001,本社工場,own_site,chemicals,35.1,136.9,
site-002,海外サプライヤー,supplier_site,textile,,,未特定地区
`;

describe("parseSitesCsv", () => {
  it("コメント行を無視し、CSVをSiteRow[]に変換する", () => {
    const { rows, errors } = parseSitesCsv(SAMPLE_CSV);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "site-001",
      name: "本社工場",
      siteType: "own_site",
      industrySector: "chemicals",
      lat: 35.1,
      lng: 136.9,
      address: undefined,
    });
    expect(rows[1]).toMatchObject({ id: "site-002", address: "未特定地区", lat: undefined, lng: undefined });
  });

  it("buildSitesFromRows()にそのまま渡してビジネスルール検証まで通せる", () => {
    const { rows } = parseSitesCsv(SAMPLE_CSV);
    const { sites, errors } = buildSitesFromRows(rows);
    expect(errors).toHaveLength(0);
    expect(sites).toHaveLength(2);
  });

  it("必須列が欠けている場合はエラーを返す", () => {
    const { rows, errors } = parseSitesCsv("site_id,name\nsite-001,拠点A");
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.includes("site_type"))).toBe(true);
  });

  it("latが数値でない場合はエラーを記録しつつ他の行は処理を続ける", () => {
    const csv = "site_id,name,site_type,industry_sector,lat,lng,address\nsite-001,拠点A,own_site,steel,not-a-number,139,";
    const { rows, errors } = parseSitesCsv(csv);
    expect(errors.some((e) => e.includes("lat"))).toBe(true);
    expect(rows[0].lat).toBeUndefined();
  });

  it("site_idが空の行はエラーとして記録し、行自体はスキップする", () => {
    const csv = "site_id,name,site_type,industry_sector,lat,lng,address\n,拠点A,own_site,steel,35,139,";
    const { rows, errors } = parseSitesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.includes("site_id"))).toBe(true);
  });
});
