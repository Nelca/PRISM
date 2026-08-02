import { describe, expect, it } from "vitest";
import { parseNatureInterfacesCsv } from "./nature-interfaces-template";
import { buildNatureInterfaces } from "@core/site/locate";
import type { Site } from "@core/types/site";

const SAMPLE_CSV = `# PRISM運用チームが記入
site_id,layer_type,data_source,raw_result,license_mode
site-001,kba,IBAT Alliance,true,pending_review
site-001,water_stress,WRI Aqueduct 4.0,4.2,reference_only
site-001,dependency_impact,ENCORE,,reference_only
`;

describe("parseNatureInterfacesCsv", () => {
  it("拠点IDごとにLayerLookup[]を組み立てる", () => {
    const { lookupsBySite, errors } = parseNatureInterfacesCsv(SAMPLE_CSV);
    expect(errors).toHaveLength(0);
    expect(lookupsBySite["site-001"]).toHaveLength(3);
  });

  it("buildNatureInterfaces()にそのまま渡せる(raw_result空の行はレイヤを生成しない)", () => {
    const { lookupsBySite } = parseNatureInterfacesCsv(SAMPLE_CSV);
    const site: Site = {
      id: "site-001",
      name: "本社工場",
      siteType: "own_site",
      industrySector: "chemicals",
      location: { kind: "coordinates", lat: 1, lng: 1 },
    };
    const interfaces = buildNatureInterfaces(site, lookupsBySite["site-001"]);
    // dependency_impactはraw_result空のため生成されない
    expect(interfaces).toHaveLength(2);
    expect(interfaces.map((i) => i.layerType).sort()).toEqual(["kba", "water_stress"]);
    expect(interfaces.find((i) => i.layerType === "water_stress")?.rawResult).toBe(4.2);
  });

  it("layer_typeが不正な場合はエラーを記録する", () => {
    const csv = "site_id,layer_type,data_source,raw_result,license_mode\nsite-001,invalid_layer,X,true,reference_only";
    const { errors } = parseNatureInterfacesCsv(csv);
    expect(errors.some((e) => e.includes("layer_type"))).toBe(true);
  });

  it("license_modeが不正な場合はエラーを記録する", () => {
    const csv = "site_id,layer_type,data_source,raw_result,license_mode\nsite-001,kba,X,true,invalid_mode";
    const { errors } = parseNatureInterfacesCsv(csv);
    expect(errors.some((e) => e.includes("license_mode"))).toBe(true);
  });

  it("raw_resultがtrue/false/数値以外の場合はエラーを記録する", () => {
    const csv = "site_id,layer_type,data_source,raw_result,license_mode\nsite-001,kba,X,not-valid,reference_only";
    const { errors } = parseNatureInterfacesCsv(csv);
    expect(errors.some((e) => e.includes("raw_result"))).toBe(true);
  });
});
