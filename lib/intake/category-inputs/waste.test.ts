import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWasteCsv } from "./waste";

const HEADER = [
  "site_id", "reporting_period", "waste_type_code", "hazardous", "treatment_route", "treatment_location",
  "weight_basis", "quantity_kg", "source_record_id", "linked_prtr_transfer_input_id", "internal_treatment_cost",
].join(",");

describe("parseWasteCsv", () => {
  it("returns normalized WasteQuantityInput rows with deterministic source hashes", () => {
    const row = "site-1,2025,industrial_unspecified,false,landfill,offsite,wet,100.5,waste-1,prtr-1,2500";
    const result = parseWasteCsv(`${HEADER}\n${row}`);
    expect(result.errors).toEqual([]);
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs![0]).toMatchObject({
      category: "waste", physicalQuantity: 100.5, unit: "kg", siteId: "site-1", sourceRegion: "JP", targetRegion: "JP",
      reportingPeriod: "2025", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
      treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: "waste-1", linkedPrtrTransferInputId: "prtr-1",
      internalTreatmentCost: 2500,
    });
    expect(result.inputs![0].sourceRecordHash).toMatch(/^[0-9a-f]{64}$/);
    const whitespace = parseWasteCsv(`${HEADER}\n site-1 , 2025 , industrial_unspecified , false , landfill , offsite , wet , 100.5 , waste-1 , prtr-1 , 2500 `);
    expect(whitespace.inputs![0].sourceRecordHash).toBe(result.inputs![0].sourceRecordHash);
  });

  it("allows empty optional linkage and internal cost", () => {
    const result = parseWasteCsv(`${HEADER}\nsite-1,2025,municipal_unspecified,true,landfill,offsite,dry,0,waste-1,,`);
    expect(result.errors).toEqual([]);
    expect(result.inputs![0].linkedPrtrTransferInputId).toBeUndefined();
    expect(result.inputs![0].internalTreatmentCost).toBeUndefined();
  });

  it("returns no partial inputs and reports all invalid rows", () => {
    const csv = [
      HEADER,
      "site-1,2025,industrial,false,landfill,offsite,wet,-1,duplicate,,",
      ",2025,industrial,yes,landfill,unknown,basis,10,duplicate,,-100",
    ].join("\n");
    const result = parseWasteCsv(csv);
    expect(result.inputs).toBeNull();
    expect(result.errors.join("\n")).toContain("負値");
    expect(result.errors.join("\n")).toContain("site_idが空");
    expect(result.errors.join("\n")).toContain("trueまたはfalse");
    expect(result.errors.join("\n")).toContain("重複");
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects missing quantity_kg headers instead of guessing a unit", () => {
    const result = parseWasteCsv(`${HEADER.replace("quantity_kg", "quantity_t")}\nsite-1,2025,x,false,landfill,offsite,wet,1,r1,,`);
    expect(result.inputs).toBeNull();
    expect(result.errors).toContain('waste.csvに必須列 "quantity_kg" がありません。');
  });

  it("rejects a header-only file", () => {
    expect(parseWasteCsv(HEADER)).toEqual({ inputs: null, errors: ["waste.csvにデータ行がありません。"] });
  });

  it("複数の報告期間を1バッチへ混在させない", () => {
    const result = parseWasteCsv([
      HEADER,
      "site-1,2024,industrial_unspecified,false,landfill,offsite,wet,1,r1,,",
      "site-1,2025,industrial_unspecified,false,landfill,offsite,wet,1,r2,,",
    ].join("\n"));
    expect(result.inputs).toBeNull();
    expect(result.errors.join(" ")).toContain("複数のreporting_period");
  });

  it("accepts the downloadable waste template", () => {
    const result = parseWasteCsv(readFileSync(join(__dirname, "templates", "waste.csv"), "utf8"));
    expect(result.errors).toEqual([]);
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs![0]).toMatchObject({
      siteId: "site-042",
      reportingPeriod: "2023",
      physicalQuantity: 1_000,
      treatmentRoute: "landfill",
      linkedPrtrTransferInputId: "DEMO-FAC-001:1:offsite_waste",
      internalTreatmentCost: 25_000,
    });
  });
});
