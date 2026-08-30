import { describe, expect, it } from "vitest";
import type { FactorResolution, LandConversionInput, LandOccupationInput, MethodConfig } from "../../types/valuation";
import { lime3LandUsePlugin } from "./lime3-land-use";

const conversion: LandConversionInput = {
  category: "land_use", activityKind: "conversion", physicalQuantity: 10, unit: "m2", siteId: "site-1",
  sourceRegion: "JP", targetRegion: "JP", projectId: "p1", landClassBefore: "forest", landClassAfter: "building",
  sourceRecordId: "r1", sourceRecordHash: "h",
};
const occupation: LandOccupationInput = {
  category: "land_use", activityKind: "occupation", physicalQuantity: 10, unit: "m2year", siteId: "site-1",
  sourceRegion: "JP", targetRegion: "JP", projectId: "p1", landClass: "building", sourceRecordId: "r2", sourceRecordHash: "h",
};

function resolution(unit: "m2" | "m2year", mappingId: string, valuePerUnit: number): FactorResolution {
  return {
    factor: {
      factorId: "f", methodId: "lime3-land-use", methodVersion: "3.0.0", sourceFlowId: unit === "m2" ? "008273" : "008105",
      sourceFlowName: "land", valuePerUnit, denominatorUnit: unit, currency: "USD", priceYear: null,
      geographicPerspective: "production-japan", sourceRegion: "JP", sourceHash: "hash",
      licenseMode: "bring_your_own_license", licenseValidUntil: "2027-06-30",
    }, mappingId, mappingVersion: "1.0.0", mappingHash: "mapping-hash",
  };
}

describe("lime3LandUsePlugin", () => {
  it("calculates conversion in m2", () => {
    const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution("m2", "lime3-land-use:conversion:forest:building", 12.340288) };
    const output = lime3LandUsePlugin.evaluate(conversion, config)[0];
    expect(output.centralValue).toBeCloseTo(123.40288);
    expect(output.valueConcept).toBe("welfare");
    expect(output.aopCode).toBe("unmapped");
    expect(output.parameterUncertainty.kind).toBe("not_available");
    expect(output.skipGeographicCalibration).toBe(true);
  });

  it("calculates occupation in m2year", () => {
    const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution("m2year", "lime3-land-use:occupation:building", 0.15982721) };
    expect(lime3LandUsePlugin.evaluate(occupation, config)[0].centralValue).toBeCloseTo(1.5982721);
  });

  it("rejects conversion/occupation unit and land-class mismatches", () => {
    const wrongUnit: MethodConfig = { depth: "deep_dive", factorResolution: resolution("m2year", "lime3-land-use:conversion:forest:building", 1) };
    expect(() => lime3LandUsePlugin.evaluate(conversion, wrongUnit)).toThrow("単位はm2");
    const wrongClass: MethodConfig = { depth: "deep_dive", factorResolution: resolution("m2", "lime3-land-use:conversion:forest:paddy", 1) };
    expect(() => lime3LandUsePlugin.evaluate(conversion, wrongClass)).toThrow("土地クラス");
  });
});
