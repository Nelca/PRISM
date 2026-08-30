/**
 * PRTR・廃棄物・土地利用の画面確認用デモ入力。
 * すべて架空値。`lib/intake`配下のダウンロード可能なサンプルと同じ内容を表す。
 */

import type { LandConversionInput, LandOccupationInput, WasteQuantityInput } from "@core/types/valuation";
import type { StoredInputBatch, StoredPhysicalInputRecord } from "@/lib/db/repositories/physical-inputs";
import type { PrtrNormalizedRecord, PrtrReleaseMedium } from "@/lib/intake/prtr";

const CREATED_AT = "2026-08-29T00:00:00Z";
const SITE_ID = "site-042";
const PRTR_BATCH_ID = "demo-input-batch-pollution-2023";
const WASTE_BATCH_ID = "demo-input-batch-waste-2023";
const LAND_BATCH_ID = "demo-input-batch-land-use-2023";

const SAMPLE_HASHES = {
  honshi: "ee01f596ca27c5f767e8c932b2dca6e63cb4675caa16afae0649ebd1a1b7fe74",
  besshi: "6d4570bedbc9740b2f8d14acff403010782aa1533ab76e3d87c883f89d1a948b",
  otherIndustries: "a36dc0b96ebc2f8115b6f8daad5d71cd717b3e1702c80d51043e2c710d8702d1",
  crosswalk: "0f6c331803f0b928bcbb630827fc0f671daa2a6c8ee8e45a1ea9aa39769147e8",
  waste: "a69c2624c38e3160b9c01c9ebc9673555f757319d52de02413a9156ab270e7a9",
  land: "8e83d4d949da1112ce4ad7f607c586916dff9699f7a0771b3d7d55b224cd3c4f",
} as const;

function prtrRecord(
  medium: PrtrReleaseMedium,
  quantityKg: number | null,
  eligibility: "eligible" | "transfer_only"
): StoredPhysicalInputRecord {
  const id = `demo-prtr-${medium}`;
  const data: PrtrNormalizedRecord = {
    id,
    physicalQuantityId: id,
    siteId: SITE_ID,
    reportingYear: 2023,
    prtrListVersion: "2023",
    facilityId: "DEMO-FAC-001",
    businessEntityName: "東海化成株式会社（デモ）",
    facilityName: "本社工場（デモPRTR）",
    prefecture: "愛知県",
    municipality: "名古屋市",
    prtrSubstanceCode: "009",
    substanceName: "アクリロニトリル",
    casRns: [],
    releaseMedium: medium,
    quantityKg,
    originalQuantity: quantityKg,
    originalUnit: "kg",
    measurementStatus: quantityKg === null ? "not_reported" : "reported",
    calculationEligibility: eligibility,
    sourceKind: "demo_sample",
    sourceRecordId: "DEMO-FAC-001:1",
    sourceRecordHash: "1".repeat(64),
    sourceLineNumber: 1,
  };
  return {
    batchId: PRTR_BATCH_ID,
    id,
    siteId: SITE_ID,
    category: "pollution",
    physicalQuantity: quantityKg,
    unit: "kg",
    calculationEligibility: eligibility,
    sourceRecordHash: data.sourceRecordHash,
    sourceLineNumber: 1,
    data: data as unknown as Record<string, unknown>,
  };
}

const wasteInput: WasteQuantityInput = {
  category: "waste",
  physicalQuantity: 1_000,
  unit: "kg",
  siteId: SITE_ID,
  sourceRegion: "JP",
  targetRegion: "JP",
  reportingPeriod: "2023",
  wasteTypeCode: "industrial_unspecified",
  hazardous: false,
  treatmentRoute: "landfill",
  treatmentLocation: "offsite",
  weightBasis: "wet",
  sourceRecordId: "waste-demo-001",
  sourceRecordHash: "2".repeat(64),
  linkedPrtrTransferInputId: "DEMO-FAC-001:1:offsite_waste",
  internalTreatmentCost: 25_000,
};

const landConversion: LandConversionInput = {
  category: "land_use",
  activityKind: "conversion",
  physicalQuantity: 500,
  unit: "m2",
  siteId: SITE_ID,
  sourceRegion: "JP",
  targetRegion: "JP",
  projectId: "project-demo-001",
  landClassBefore: "forest",
  landClassAfter: "building",
  sourceRecordId: "land-demo-001",
  sourceRecordHash: "3".repeat(64),
};

const landOccupation: LandOccupationInput = {
  category: "land_use",
  activityKind: "occupation",
  physicalQuantity: 500,
  unit: "m2year",
  siteId: SITE_ID,
  sourceRegion: "JP",
  targetRegion: "JP",
  projectId: "project-demo-001",
  landClass: "building",
  sourceRecordId: "land-demo-002",
  sourceRecordHash: "4".repeat(64),
};

function customerRecord(
  batchId: string,
  id: string,
  input: WasteQuantityInput | LandConversionInput | LandOccupationInput,
  line: number
): StoredPhysicalInputRecord {
  return {
    batchId,
    id,
    siteId: input.siteId,
    category: input.category,
    physicalQuantity: input.physicalQuantity,
    unit: input.unit,
    calculationEligibility: "eligible",
    sourceRecordHash: input.sourceRecordHash,
    sourceLineNumber: line,
    data: { ...input, sourceKind: "demo_sample" },
  };
}

export const DEMO_CATEGORY_EXPANSION_RECORDS: StoredPhysicalInputRecord[] = [
  prtrRecord("air", 120, "eligible"),
  prtrRecord("public_water", 0, "eligible"),
  prtrRecord("soil", null, "eligible"),
  prtrRecord("onsite_landfill", 0, "eligible"),
  prtrRecord("sewer", 0, "transfer_only"),
  prtrRecord("offsite_waste", 1_000, "transfer_only"),
  customerRecord(WASTE_BATCH_ID, "demo-waste-row-1", wasteInput, 2),
  customerRecord(LAND_BATCH_ID, "demo-land-row-1", landConversion, 2),
  customerRecord(LAND_BATCH_ID, "demo-land-row-2", landOccupation, 3),
];

export const DEMO_CATEGORY_EXPANSION_BATCHES: StoredInputBatch[] = [
  {
    id: PRTR_BATCH_ID,
    category: "pollution",
    sourceKind: "demo_sample",
    schemaVersion: "env-prtr-official-2023-v1",
    dataVersion: "DEMO-PRTR-2023",
    reportingYear: 2023,
    sourceManifest: [
      { role: "honshi", fileName: "honshi.txt", sha256: SAMPLE_HASHES.honshi, rowCount: 1, encoding: "CP932" },
      { role: "besshi", fileName: "besshi.txt", sha256: SAMPLE_HASHES.besshi, rowCount: 1, encoding: "CP932" },
      { role: "other_industries", fileName: "other-industries.txt", sha256: SAMPLE_HASHES.otherIndustries, rowCount: 1, encoding: "CP932" },
      { role: "facility_crosswalk", fileName: "facility-crosswalk.csv", sha256: SAMPLE_HASHES.crosswalk, rowCount: 1, encoding: "UTF-8" },
    ],
    createdAt: CREATED_AT,
  },
  {
    id: WASTE_BATCH_ID,
    category: "waste",
    sourceKind: "demo_sample",
    schemaVersion: "customer-waste-csv-v1",
    dataVersion: "DEMO-WASTE-2023",
    reportingYear: null,
    sourceManifest: { fileName: "waste.csv", sha256: SAMPLE_HASHES.waste, rowCount: 1, encoding: "UTF-8" },
    createdAt: CREATED_AT,
  },
  {
    id: LAND_BATCH_ID,
    category: "land_use",
    sourceKind: "demo_sample",
    schemaVersion: "customer-land-use-csv-v1",
    dataVersion: "DEMO-LAND-2023",
    reportingYear: null,
    sourceManifest: { fileName: "land-use.csv", sha256: SAMPLE_HASHES.land, rowCount: 2, encoding: "UTF-8" },
    createdAt: CREATED_AT,
  },
];
