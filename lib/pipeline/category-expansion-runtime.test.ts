import { describe, expect, it } from "vitest";
import type { StoredInputBatch, StoredPhysicalInputRecord } from "@/lib/db/repositories/physical-inputs";
import type { PrtrNormalizedRecord } from "@/lib/intake/prtr";
import type { LandConversionInput, LandOccupationInput, WasteQuantityInput } from "@core/types/valuation";
import { buildCategoryExpansionRuntime } from "./category-expansion-runtime";
import { requiresLicenseRefresh } from "./execute-run";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";

function prtrRecord(
  id: string,
  releaseMedium: PrtrNormalizedRecord["releaseMedium"],
  quantity: number | null
): StoredPhysicalInputRecord {
  const data: PrtrNormalizedRecord = {
    id,
    physicalQuantityId: id,
    siteId: "site-042",
    reportingYear: 2023,
    prtrListVersion: "2023",
    facilityId: "facility-1",
    businessEntityName: "test",
    facilityName: "test",
    prefecture: "東京都",
    municipality: "千代田区",
    prtrSubstanceCode: "009",
    substanceName: "アクリロニトリル",
    casRns: [],
    releaseMedium,
    quantityKg: quantity,
    originalQuantity: quantity,
    originalUnit: "kg",
    measurementStatus: quantity === null ? "not_reported" : "reported",
    calculationEligibility:
      releaseMedium === "sewer" || releaseMedium === "offsite_waste" ? "transfer_only" : "eligible",
    sourceKind: "customer_prtr",
    sourceRecordId: "facility-1:1",
    sourceRecordHash: `hash-${id}`,
    sourceLineNumber: 1,
  };
  return {
    batchId: "batch-1",
    id,
    siteId: "site-042",
    category: "pollution",
    physicalQuantity: quantity,
    unit: "kg",
    calculationEligibility: data.calculationEligibility,
    sourceRecordHash: data.sourceRecordHash,
    sourceLineNumber: 1,
    data: data as unknown as Record<string, unknown>,
  };
}

const batch: StoredInputBatch = {
  id: "batch-1",
  category: "pollution",
  sourceKind: "customer_prtr",
  schemaVersion: "env-prtr-official-2023-v1",
  dataVersion: "PRTR-2023",
  reportingYear: 2023,
  sourceManifest: [{ fileName: "本紙.txt", sha256: "file-hash" }],
  createdAt: "2026-08-29T00:00:00Z",
};

function customerRecord(input: WasteQuantityInput | LandConversionInput | LandOccupationInput): StoredPhysicalInputRecord {
  return {
    batchId: `batch-${input.category}`,
    id: `row-${input.category}`,
    siteId: input.siteId,
    category: input.category,
    physicalQuantity: input.physicalQuantity,
    unit: input.unit,
    calculationEligibility: "eligible",
    sourceRecordHash: input.sourceRecordHash,
    sourceLineNumber: 2,
    data: input as unknown as Record<string, unknown>,
  };
}

describe("buildCategoryExpansionRuntime", () => {
  it("実LIME3 CSVとレビュー済み対応表からPRTR算定設定を構築する", async () => {
    const runtime = await buildCategoryExpansionRuntime([prtrRecord("row-air", "air", 10)], [batch]);
    expect(runtime.physicalInputs).toHaveLength(1);
    const [config] = runtime.deepDiveConfigsByMaterialIssue["site-042-mi-pollution"];
    expect(config.input).toMatchObject({ casRns: ["107-13-1"], casSource: "reviewed_mapping" });
    expect(config.config.factorResolution?.mappingId).toBe("lime3-pollution:2023:2023:009:air");
    expect(config.config.currencyConversion?.rate).toBe(94.46);
    expect(runtime.coverageByMaterialIssue["site-042-mi-pollution"].quantities[0]).toMatchObject({
      unit: "kg", total: 10, calculated: 10, unmapped: 0, transferOnly: 0, blocked: 0,
      rowCounts: { total: 1, calculated: 1 },
    });
    expect(runtime.calculationLineItems[0]).toMatchObject({ status: "calculated", inputRecordId: "row-air" });
    expect(runtime.inputBatchHashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("移動量と未報告を0円の算定済みにしない", async () => {
    const runtime = await buildCategoryExpansionRuntime(
      [prtrRecord("row-transfer", "offsite_waste", 4), prtrRecord("row-empty", "air", null)],
      [batch]
    );
    const coverage = runtime.coverageByMaterialIssue["site-042-mi-pollution"];
    expect(coverage.quantities[0]).toMatchObject({
      unit: "kg", total: 4, calculated: 0, unmapped: 0, transferOnly: 4, blocked: 0,
      rowCounts: { total: 2, transferOnly: 1, blocked: 1 },
    });
    expect(coverage.rowCounts).toMatchObject({ total: 2, transferOnly: 1, blocked: 1 });
    expect(runtime.calculationLineItems.map((item) => item.status)).toEqual(["transfer_only", "blocked"]);
    expect(runtime.deepDiveConfigsByMaterialIssue["site-042-mi-pollution"]).toBeUndefined();
  });

  it("廃棄物の内部処理費用をLIME3厚生価値へ加算しない", async () => {
    const input: WasteQuantityInput = {
      category: "waste", physicalQuantity: 100, unit: "kg", siteId: "site-042", sourceRegion: "JP", targetRegion: "JP",
      reportingPeriod: "2025", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
      treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: "waste-1", sourceRecordHash: "waste-hash",
      internalTreatmentCost: 999_999,
    };
    const runtime = await buildCategoryExpansionRuntime([customerRecord(input)], []);
    const config = runtime.deepDiveConfigsByMaterialIssue["site-042-mi-waste"][0];
    const factor = config.config.factorResolution!.factor;
    expect(runtime.calculationLineItems[0].amount).toBe(100 * factor.valuePerUnit * 94.46);
    expect(runtime.calculationLineItems[0].amount).not.toBe(999_999);
  });

  it("土地転換はm2のレビュー済み係数だけへ解決する", async () => {
    const input: LandConversionInput = {
      category: "land_use", activityKind: "conversion", physicalQuantity: 500, unit: "m2", siteId: "site-042",
      sourceRegion: "JP", targetRegion: "JP", projectId: "project-1", landClassBefore: "forest", landClassAfter: "building",
      sourceRecordId: "land-1", sourceRecordHash: "land-hash",
    };
    const runtime = await buildCategoryExpansionRuntime([customerRecord(input)], []);
    expect(runtime.deepDiveConfigsByMaterialIssue["site-042-mi-land_use"][0].config.factorResolution).toMatchObject({
      mappingId: "lime3-land-use:conversion:forest:building",
      factor: { denominatorUnit: "m2" },
    });
  });

  it("土地転換m2と占有m2yearのカバレッジを合算しない", async () => {
    const conversion: LandConversionInput = {
      category: "land_use", activityKind: "conversion", physicalQuantity: 500, unit: "m2", siteId: "site-042",
      sourceRegion: "JP", targetRegion: "JP", projectId: "project-1", landClassBefore: "forest", landClassAfter: "building",
      sourceRecordId: "land-conversion", sourceRecordHash: "land-conversion-hash",
    };
    const occupation: LandOccupationInput = {
      category: "land_use", activityKind: "occupation", physicalQuantity: 20, unit: "m2year", siteId: "site-042",
      sourceRegion: "JP", targetRegion: "JP", projectId: "project-1", landClass: "building",
      sourceRecordId: "land-occupation", sourceRecordHash: "land-occupation-hash",
    };
    const records = [
      { ...customerRecord(conversion), id: "land-conversion-row" },
      { ...customerRecord(occupation), id: "land-occupation-row" },
    ];
    const runtime = await buildCategoryExpansionRuntime(records, []);
    expect(runtime.coverageByMaterialIssue["site-042-mi-land_use"].quantities).toMatchObject([
      { unit: "m2", total: 500, calculated: 500 },
      { unit: "m2year", total: 20, calculated: 20 },
    ]);
  });

  it("ライセンス期限後は係数が対応していても全量をblockedにする", async () => {
    const runtime = await buildCategoryExpansionRuntime(
      [prtrRecord("row-air", "air", 10)],
      [batch],
      new Date("2027-07-01T00:00:00+09:00")
    );
    expect(runtime.deepDiveConfigsByMaterialIssue["site-042-mi-pollution"]).toBeUndefined();
    expect(runtime.coverageByMaterialIssue["site-042-mi-pollution"].quantities[0]).toMatchObject({ blocked: 10, calculated: 0 });
    expect(runtime.methodAvailabilityByMaterialIssue["site-042-mi-pollution"][0].status).toBe("expired");
    expect(runtime.calculationLineItems[0].status).toBe("blocked");
  });
});

describe("requiresLicenseRefresh", () => {
  it("期限前の保存runは再利用し、期限後は再算定を要求する", () => {
    const result = runDemoPipeline();
    result.valuation.methodAvailabilityByMaterialIssue["site-042-mi-pollution"] = [{
      methodId: "lime3-pollution", licenseMode: "bring_your_own_license", status: "available",
      licenseExpiresAt: "2027-06-30",
    }];
    expect(requiresLicenseRefresh(result, new Date("2027-06-30T12:00:00+09:00"))).toBe(false);
    expect(requiresLicenseRefresh(result, new Date("2027-07-01T00:00:00+09:00"))).toBe(true);
    result.valuation.methodAvailabilityByMaterialIssue["site-042-mi-pollution"][0].status = "expired";
    expect(requiresLicenseRefresh(result, new Date("2027-07-01T00:00:00+09:00"))).toBe(false);
  });
});
