/**
 * GAP-13(`rapidIntegrityDecline`)の実データ差し替え(docs/data/acquisition-runbook.md §3.9・
 * docs/data/ecosystem-integrity-trend-notes.md)が正しくコードに反映されていることを検証する。
 *
 * `packages/core/src/site/ecosystem-integrity-trend.test.ts`・`ecological-integrity-grid.test.ts`
 * は閾値判定ロジック・グリッド抽出の自己整合性のみを検証しており、実際に
 * `interfacesByCategoryForSite`(拠点の座標から動的にグリッドを引く経路)を通じて
 * `rapidIntegrityDecline`に反映されることは検証していない。このテストはその欠落を埋める。
 *
 * 2026-08-10追記:従来はsite-042/050/060限定のハードコードだったが、拠点座標から動的に
 * 引く方式(`@core/site/ecological-integrity-grid`)に差し替えた。既存3拠点だけでなく、
 * `LAYER_LOOKUPS_BY_SITE`に登録されていない新規拠点でも同じ経路で評価されることを確認する。
 */
import { describe, expect, it } from "vitest";
import { assessCriteria } from "@core/site/criteria";
import type { Site } from "@core/types/site";
import { interfacesByCategoryForSite, resolveCriterionForDemo } from "./company";

function assess(site: Site) {
  const interfaces = interfacesByCategoryForSite(site).water ?? [];
  return assessCriteria(interfaces, resolveCriterionForDemo);
}

const KNOWN_SITES: Array<{ id: string; lat: number; lng: number }> = [
  { id: "site-042", lat: 35.1, lng: 136.9 },
  { id: "site-050", lat: 34.7, lng: 135.5 },
  { id: "site-060", lat: 23.0, lng: 72.6 },
];

function coordinateSite(id: string, lat: number, lng: number): Site {
  return { id, name: id, siteType: "own_site", industrySector: "chemicals", location: { kind: "coordinates", lat, lng } };
}

describe("rapidIntegrityDecline:既存3拠点での実データ反映", () => {
  it.each(KNOWN_SITES)(
    "$id は評価不能(no_data_source)ではなく、実データに基づき評価される(2015→2023の変化は閾値30%未満のためfalse)",
    ({ id, lat, lng }) => {
      const { criteriaMet, unevaluatedCriteria } = assess(coordinateSite(id, lat, lng));

      expect(criteriaMet.rapidIntegrityDecline).toBe(false);
      expect(unevaluatedCriteria.some((c) => c.criterion === "rapidIntegrityDecline")).toBe(false);
    }
  );

  it("highEcosystemIntegrityとrapidIntegrityDeclineは同じecosystem_integrity layerTypeから独立して導出される(resolveCriterionの誤配線がないことの確認)", () => {
    const { criteriaMet, unevaluatedCriteria } = assess(coordinateSite("site-042", 35.1, 136.9));

    // site-042にはhighEcosystemIntegrity向けのNatureInterfaceを渡していないため、
    // rapidIntegrityDeclineだけが評価済みで、highEcosystemIntegrityはno_data_sourceのまま。
    expect(criteriaMet.highEcosystemIntegrity).toBe(false);
    expect(unevaluatedCriteria.map((c) => c.criterion)).toContain("highEcosystemIntegrity");
    expect(unevaluatedCriteria.map((c) => c.criterion)).not.toContain("rapidIntegrityDecline");
  });
});

describe("rapidIntegrityDecline:LAYER_LOOKUPS_BY_SITEに未登録の新規拠点でも動的に評価される", () => {
  it("未知の拠点ID・座標既知の拠点は、水ストレス・ENCORE等の固定データは無いが、rapidIntegrityDeclineだけは評価される", () => {
    // ブラジル・ロンドニア州。company.tsのLAYER_LOOKUPS_BY_SITEには存在しない座標・拠点ID。
    const newSite = coordinateSite("site-new-999", -10.5, -62.8);
    const { criteriaMet, unevaluatedCriteria } = assess(newSite);

    expect(unevaluatedCriteria.some((c) => c.criterion === "rapidIntegrityDecline")).toBe(false);
    expect(typeof criteriaMet.rapidIntegrityDecline).toBe("boolean");

    // 固定データ(kba/water_stress/dependency_impact)は用意していないため、これらは未評価のまま。
    expect(unevaluatedCriteria.map((c) => c.criterion)).toContain("waterStress");
    expect(unevaluatedCriteria.map((c) => c.criterion)).toContain("likelySignificantDependencyImpact");
  });

  it("住所ジオコーディングで座標を得た拠点(geocoded=true)でも動的に評価される", () => {
    const geocodedSite: Site = {
      id: "site-geocoded-999",
      name: "geocoded",
      siteType: "supplier_site",
      industrySector: "textile",
      location: { kind: "address", address: "somewhere", geocoded: true, lat: 23.8, lng: 90.4 },
    };
    const { unevaluatedCriteria } = assess(geocodedSite);
    expect(unevaluatedCriteria.some((c) => c.criterion === "rapidIntegrityDecline")).toBe(false);
  });

  it("座標が未解決(geocoded=false)の拠点はrapidIntegrityDeclineも評価できない(no_data_source)", () => {
    const unresolvedSite: Site = {
      id: "site-unresolved-999",
      name: "unresolved",
      siteType: "supplier_site",
      industrySector: "textile",
      location: { kind: "address", address: "somewhere", geocoded: false },
    };
    const { unevaluatedCriteria } = assess(unresolvedSite);
    expect(unevaluatedCriteria.some((c) => c.criterion === "rapidIntegrityDecline")).toBe(true);
  });
});
