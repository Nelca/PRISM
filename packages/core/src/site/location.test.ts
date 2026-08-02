import { describe, expect, it } from "vitest";
import { resolveSiteLocation } from "./location";
import type { Site } from "../types/site";

const baseSite: Omit<Site, "location"> = {
  id: "site-1",
  name: "工場A",
  siteType: "own_site",
  industrySector: "chemicals",
};

describe("resolveSiteLocation", () => {
  it("既に座標がある場合はそのまま返す(除外なし)", () => {
    const site: Site = { ...baseSite, location: { kind: "coordinates", lat: 35.0, lng: 139.0 } };
    const result = resolveSiteLocation(site, () => null);
    expect(result.excluded).toBe(false);
    expect(result.site).toEqual(site);
  });

  it("住所がありジオコーディングが成功する場合、座標を埋めて返す", () => {
    const site: Site = { ...baseSite, location: { kind: "address", address: "東京都千代田区1-1", geocoded: false } };
    const result = resolveSiteLocation(site, () => ({ lat: 35.6895, lng: 139.6917 }));

    expect(result.excluded).toBe(false);
    expect(result.site.location).toEqual({
      kind: "address",
      address: "東京都千代田区1-1",
      geocoded: true,
      lat: 35.6895,
      lng: 139.6917,
    });
  });

  it("ジオコーディングに失敗した場合、excluded=trueかつexclusionReasonが設定される", () => {
    const site: Site = { ...baseSite, location: { kind: "address", address: "不明な住所", geocoded: false } };
    const result = resolveSiteLocation(site, () => null);

    expect(result.excluded).toBe(true);
    expect(result.exclusionReason).toContain("不明な住所");
    expect((result.site.location as { geocoded: boolean }).geocoded).toBe(false);
  });
});
