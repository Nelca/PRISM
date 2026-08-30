import { describe, expect, it } from "vitest";
import type { FactorResolution, MethodConfig, PollutionReleaseInput } from "../../types/valuation";
import { lime3PollutionPlugin } from "./lime3-pollution";

const input: PollutionReleaseInput = {
  category: "pollution", physicalQuantity: 10, unit: "kg", siteId: "site-1", sourceRegion: "JP", targetRegion: "JP",
  reportingYear: 2023, prtrListVersion: "2023", facilityId: "f1", prtrSubstanceCode: "009",
  casRns: ["107-13-1"], releaseMedium: "air", sourceKind: "public_prtr", sourceRecordId: "r1", sourceRecordHash: "h",
};

const resolution: FactorResolution = {
  factor: {
    factorId: "f", methodId: "lime3-pollution", methodVersion: "3.0.0", sourceFlowId: "002P22009",
    sourceFlowName: "排出, アクリロニトリル, 大気, 不特定", medium: "air", valuePerUnit: 2.5,
    denominatorUnit: "kg", currency: "USD", priceYear: null, geographicPerspective: "production-japan",
    sourceRegion: "JP", sourceHash: "hash", licenseMode: "bring_your_own_license", licenseValidUntil: "2027-06-30",
  },
  mappingId: "lime3-pollution:2023:2023:009:air", mappingVersion: "1.0.0", mappingHash: "mapping-hash",
};
const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution };

describe("lime3PollutionPlugin", () => {
  it("calculates quantity times factor as welfare without invented uncertainty or calibration", () => {
    const output = lime3PollutionPlugin.evaluate(input, config)[0];
    expect(output.centralValue).toBe(25);
    expect(output.valueConcept).toBe("welfare");
    expect(output.aopCode).toBe("unmapped");
    expect(output.parameterUncertainty.kind).toBe("not_available");
    expect(output.transferFitness.tier).toBe("not_applicable");
    expect(output.skipGeographicCalibration).toBe(true);
  });

  it("rejects transfer media and mismatched mappings/media", () => {
    expect(() => lime3PollutionPlugin.evaluate({ ...input, releaseMedium: "sewer" }, config)).toThrow("移動量");
    expect(() => lime3PollutionPlugin.evaluate(input, {
      ...config, factorResolution: { ...resolution, mappingId: "lime3-pollution:2023:2023:009:public_water" },
    })).toThrow("物質・媒体");
    expect(() => lime3PollutionPlugin.evaluate(input, {
      ...config, factorResolution: { ...resolution, factor: { ...resolution.factor, medium: "public_water" } },
    })).toThrow("排出媒体");
  });

  it("requires a structured resolution and Japanese kg inputs", () => {
    expect(() => lime3PollutionPlugin.evaluate(input, { depth: "deep_dive" })).toThrow("factorResolution");
    expect(() => lime3PollutionPlugin.evaluate({ ...input, targetRegion: "US" }, config)).toThrow("日本の入力");
  });
});
