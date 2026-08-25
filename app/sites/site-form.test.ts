import { describe, expect, it } from "vitest";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import { parseSiteForm } from "./site-form";

function baseForm() {
  const form = new FormData();
  form.set("name", "東京工場");
  form.set("siteType", "own_site");
  form.set("industrySector", "chemicals");
  form.set("locationKind", "coordinates");
  form.set("lat", "35");
  form.set("lng", "139");
  return form;
}

describe("site form", () => {
  it("有効な座標入力をドメイン入力へ変換する", () => {
    const parsed = parseSiteForm(baseForm(), DEFAULT_DEEP_DIVE_PARAMS);
    expect(parsed).toMatchObject({ row: { name: "東京工場", lat: 35, lng: 139 } });
  });

  it("座標範囲と非有限な詳細値を拒否する", () => {
    const invalidLat = baseForm();
    invalidLat.set("lat", "91");
    expect(parseSiteForm(invalidLat, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");

    const invalidQuantity = baseForm();
    invalidQuantity.set("physicalQuantity", "Infinity");
    expect(parseSiteForm(invalidQuantity, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");
  });
});
