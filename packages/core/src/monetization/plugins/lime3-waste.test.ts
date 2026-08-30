import { describe, expect, it } from "vitest";
import type { FactorResolution, MethodConfig, WasteQuantityInput } from "../../types/valuation";
import { lime3WastePlugin } from "./lime3-waste";

const input: WasteQuantityInput = {
  category: "waste", physicalQuantity: 100, unit: "kg", siteId: "site-1", sourceRegion: "JP", targetRegion: "JP",
  reportingPeriod: "2025", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
  treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: "r1", sourceRecordHash: "h",
};
const resolution: FactorResolution = {
  factor: {
    factorId: "f", methodId: "lime3-waste", methodVersion: "3.0.0", sourceFlowId: "006153",
    sourceFlowName: "排出, 埋立物, 産廃 (特定せず), 陸域, 不特定", valuePerUnit: 0.0641845845,
    denominatorUnit: "kg", currency: "USD", priceYear: null, geographicPerspective: "production-japan",
    sourceRegion: "JP", sourceHash: "hash", licenseMode: "bring_your_own_license", licenseValidUntil: "2027-06-30",
  },
  mappingId: "lime3-waste:industrial_unspecified:landfill:offsite", mappingVersion: "1.0.0", mappingHash: "mapping-hash",
};
const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution };

describe("lime3WastePlugin", () => {
  it("calculates an exact treatment route as welfare", () => {
    const output = lime3WastePlugin.evaluate(input, config)[0];
    expect(output.centralValue).toBeCloseTo(6.41845845);
    expect(output.valueConcept).toBe("welfare");
    expect(output.parameterUncertainty.kind).toBe("not_available");
    expect(output.skipGeographicCalibration).toBe(true);
    expect(output.scopeExclusions.join(" ")).toContain("処理費用");
  });

  it("does not substitute landfill coefficients for another route or waste type", () => {
    expect(() => lime3WastePlugin.evaluate({ ...input, treatmentRoute: "recycling" }, config)).toThrow("処理経路");
    expect(() => lime3WastePlugin.evaluate({ ...input, wasteTypeCode: "municipal_unspecified" }, config)).toThrow("種類・処理経路");
  });

  it("requires structured factors without pollution media", () => {
    expect(() => lime3WastePlugin.evaluate(input, { depth: "deep_dive" })).toThrow("factorResolution");
    expect(() => lime3WastePlugin.evaluate(input, {
      ...config, factorResolution: { ...resolution, factor: { ...resolution.factor, medium: "onsite_landfill" } },
    })).toThrow("排出媒体");
  });
});
