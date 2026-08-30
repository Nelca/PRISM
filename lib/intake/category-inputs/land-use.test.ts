import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLandUseCsv } from "./land-use";

const HEADER = [
  "site_id", "activity_kind", "project_id", "quantity", "unit", "land_class", "land_class_before",
  "land_class_after", "source_record_id", "geometry_geojson",
].join(",");

describe("parseLandUseCsv", () => {
  it("parses conversion and occupation as distinct physical input types", () => {
    const csv = [
      HEADER,
      'site-1,conversion,p1,500,m2,,forest,building,land-1,"{""type"":""Polygon"",""coordinates"":[]}"',
      "site-1,occupation,p1,20,m2year,building,,,land-2,",
    ].join("\n");
    const result = parseLandUseCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.inputs).toHaveLength(2);
    expect(result.inputs![0]).toMatchObject({ activityKind: "conversion", unit: "m2", landClassBefore: "forest", landClassAfter: "building" });
    expect(result.inputs![1]).toMatchObject({ activityKind: "occupation", unit: "m2year", landClass: "building" });
    expect(result.inputs![0].sourceRecordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.inputs![0].geometryGeoJson).toEqual({ type: "Polygon", coordinates: [] });
  });

  it("normalizes GeoJSON key order before hashing", () => {
    const first = parseLandUseCsv(`${HEADER}\nsite-1,occupation,p1,1,m2year,building,,,r1,"{""type"":""Point"",""coordinates"":[1,2]}"`);
    const second = parseLandUseCsv(`${HEADER}\nsite-1,occupation,p1,1,m2year,building,,,r1,"{""coordinates"":[1,2],""type"":""Point""}"`);
    expect(first.inputs![0].sourceRecordHash).toBe(second.inputs![0].sourceRecordHash);
  });

  it("rejects invalid GeoJSON JSON without returning partial rows", () => {
    const result = parseLandUseCsv(`${HEADER}\nsite-1,occupation,p1,1,m2year,building,,,r1,{broken}`);
    expect(result.inputs).toBeNull();
    expect(result.errors.join(" ")).toContain("正しいJSONではありません");
  });

  it("collects negative, unit, conditional-field, required and duplicate errors", () => {
    const csv = [
      HEADER,
      "site-1,conversion,p1,-1,m2year,should-be-empty,,building,dup,",
      ",occupation,,1,m2,,forest,,dup,",
    ].join("\n");
    const result = parseLandUseCsv(csv);
    expect(result.inputs).toBeNull();
    const messages = result.errors.join("\n");
    expect(messages).toContain("負値");
    expect(messages).toContain("conversionの場合m2");
    expect(messages).toContain("land_class_beforeが空");
    expect(messages).toContain("site_idが空");
    expect(messages).toContain("project_idが空");
    expect(messages).toContain("occupationの場合m2year");
    expect(messages).toContain("重複");
  });

  it("accepts the downloadable land-use template", () => {
    const result = parseLandUseCsv(readFileSync(join(__dirname, "templates", "land-use.csv"), "utf8"));
    expect(result.errors).toEqual([]);
    expect(result.inputs).toHaveLength(2);
    expect(result.inputs![0]).toMatchObject({
      siteId: "site-042",
      activityKind: "conversion",
      physicalQuantity: 500,
      unit: "m2",
      landClassBefore: "forest",
      landClassAfter: "building",
    });
    expect(result.inputs![1]).toMatchObject({
      siteId: "site-042",
      activityKind: "occupation",
      physicalQuantity: 500,
      unit: "m2year",
      landClass: "building",
    });
  });
});
