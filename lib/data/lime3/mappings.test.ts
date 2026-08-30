import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LandConversionInput, LandOccupationInput, PollutionReleaseInput, WasteQuantityInput } from "@/packages/core/src/types";
import { loadLime3CoefficientTable } from "./loader";
import {
  loadLandMappings,
  loadPollutionMappings,
  loadWasteMappings,
  resolveLandUseFactor,
  resolvePollutionFactor,
  resolveWasteFactor,
} from "./mappings";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const table = loadLime3CoefficientTable(read("docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv"));

const pollutionInput: PollutionReleaseInput = {
  category: "pollution",
  physicalQuantity: 10,
  unit: "kg",
  siteId: "site-1",
  sourceRegion: "JP",
  targetRegion: "JP",
  reportingYear: 2023,
  prtrListVersion: "2023",
  facilityId: "facility-1",
  prtrSubstanceCode: "009",
  casRns: ["107-13-1"],
  releaseMedium: "air",
  sourceKind: "public_prtr",
  sourceRecordId: "row-1",
  sourceRecordHash: "hash",
};

const wasteInput: WasteQuantityInput = {
  category: "waste",
  physicalQuantity: 100,
  unit: "kg",
  siteId: "site-1",
  sourceRegion: "JP",
  targetRegion: "JP",
  reportingPeriod: "2025",
  wasteTypeCode: "industrial_unspecified",
  hazardous: false,
  treatmentRoute: "landfill",
  treatmentLocation: "offsite",
  weightBasis: "wet",
  sourceRecordId: "row-2",
  sourceRecordHash: "hash",
};

describe("reviewed LIME3 mappings", () => {
  it("resolves PRTR only when list version, code, CAS and medium all match", () => {
    const mappings = loadPollutionMappings(read("docs/data/mappings/prtr-lime3-flow-mapping-v1.csv"));
    const resolution = resolvePollutionFactor(pollutionInput, table, mappings)!;
    expect(resolution.factor.sourceFlowId).toBe("002P22009");
    expect(resolution.factor.valuePerUnit).toBe(2.59237975);
    expect(resolution.factor.medium).toBe("air");
    expect(resolvePollutionFactor({ ...pollutionInput, casRns: ["different"] }, table, mappings)).toBeNull();
    expect(resolvePollutionFactor({ ...pollutionInput, reportingYear: 2024 }, table, mappings)).toBeNull();
    expect(resolvePollutionFactor({ ...pollutionInput, releaseMedium: "sewer" }, table, mappings)).toBeNull();
  });

  it("rejects unreviewed/fuzzy mapping statuses", () => {
    const csv = [
      "mapping_id,mapping_version,match_status,reporting_year,prtr_list_version,prtr_substance_code,cas_rn,release_medium,source_flow_id",
      "id,1,candidate,2023,2023,009,107-13-1,air,002P22009",
    ].join("\n");
    expect(() => loadPollutionMappings(csv)).toThrow("未レビュー");
  });

  it("resolves only an exactly matching waste type, route and location", () => {
    const mappings = loadWasteMappings(read("docs/data/mappings/waste-lime3-flow-mapping-v1.csv"));
    const resolution = resolveWasteFactor(wasteInput, table, mappings)!;
    expect(resolution.factor.sourceFlowId).toBe("006153");
    expect(resolution.factor.valuePerUnit).toBe(0.0641845845);
    expect(resolveWasteFactor({ ...wasteInput, treatmentRoute: "incineration" }, table, mappings)).toBeNull();
  });

  it("keeps land conversion and occupation separate", () => {
    const mappings = loadLandMappings(read("docs/data/mappings/land-use-lime3-flow-mapping-v1.csv"));
    const occupation: LandOccupationInput = {
      category: "land_use", activityKind: "occupation", physicalQuantity: 5, unit: "m2year",
      siteId: "site-1", sourceRegion: "JP", targetRegion: "JP", projectId: "p1", landClass: "building",
      sourceRecordId: "row-3", sourceRecordHash: "hash",
    };
    const conversion: LandConversionInput = {
      category: "land_use", activityKind: "conversion", physicalQuantity: 5, unit: "m2",
      siteId: "site-1", sourceRegion: "JP", targetRegion: "JP", projectId: "p1",
      landClassBefore: "forest", landClassAfter: "building", sourceRecordId: "row-4", sourceRecordHash: "hash",
    };
    expect(resolveLandUseFactor(occupation, table, mappings)!.factor.valuePerUnit).toBe(0.15982721);
    expect(resolveLandUseFactor(conversion, table, mappings)!.factor.valuePerUnit).toBe(12.340288);
    expect(resolveLandUseFactor({ ...occupation, landClass: "forest" }, table, mappings)).toBeNull();
  });
});
