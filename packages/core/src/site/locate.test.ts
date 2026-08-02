import { describe, expect, it } from "vitest";
import { buildNatureInterfaces } from "./locate";
import type { LayerLookup } from "./locate";
import type { Site } from "../types/site";

const site: Site = {
  id: "site-042",
  name: "工場A",
  siteType: "own_site",
  industrySector: "chemicals",
  location: { kind: "coordinates", lat: 35.0, lng: 139.0 },
};

describe("buildNatureInterfaces", () => {
  it("lookupが値を返すレイヤのみNatureInterfaceを生成する", () => {
    const layers: LayerLookup[] = [
      { layerType: "protected_area", dataSource: "WDPA", licenseMode: "pending_review", lookup: () => true },
      { layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", lookup: () => null }, // 対象外
      { layerType: "water_stress", dataSource: "Aqueduct", licenseMode: "reference_only", lookup: () => 4.2 },
    ];

    const result = buildNatureInterfaces(site, layers);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.layerType).sort()).toEqual(["protected_area", "water_stress"].sort());
  });

  it("各NatureInterfaceがsiteIdと生のrawResultを正しく保持する", () => {
    // ENCOREのレーティングは実際には多段階(low/medium/high等)の可能性があるが、
    // rawResultの型はboolean|numberのため、呼び出し側でboolean化してから渡す想定。
    const layers: LayerLookup[] = [
      { layerType: "dependency_impact", dataSource: "ENCORE", licenseMode: "reference_only", lookup: () => true },
    ];
    const result = buildNatureInterfaces(site, layers);

    expect(result[0].siteId).toBe("site-042");
    expect(result[0].rawResult).toBe(true);
    expect(result[0].dataSource).toBe("ENCORE");
    expect(result[0].id).toContain("site-042");
  });

  it("layerLookupsが空の場合、空配列を返す", () => {
    expect(buildNatureInterfaces(site, [])).toEqual([]);
  });
});
