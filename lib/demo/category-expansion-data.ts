/**
 * PRTR・廃棄物・土地利用の画面確認用デモ入力。
 * すべて架空値。`lib/intake`配下のダウンロード可能なサンプルと同じ内容を表す。
 */

import type {
  CorporateFinancialEffectInput,
  LandConversionInput,
  LandOccupationInput,
  WasteQuantityInput,
} from "@core/types/valuation";
import type { StoredInputBatch, StoredPhysicalInputRecord } from "@/lib/db/repositories/physical-inputs";
import type { PrtrNormalizedRecord, PrtrReleaseMedium } from "@/lib/intake/prtr";

const CREATED_AT = "2026-08-29T00:00:00Z";
const HEADQUARTERS_SITE_ID = "site-042";
const YOKKAICHI_SITE_ID = "site-070";
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

function corporateEffect(
  input: Omit<CorporateFinancialEffectInput, "sourceKind" | "sourceLabel" | "sourceHash" | "dataVersion" | "uncertaintySigma">
): CorporateFinancialEffectInput {
  return {
    ...input,
    sourceKind: "demo_company_input",
    sourceLabel: "東海化成株式会社（架空）の環境対応費用入力",
    sourceHash: "5".repeat(64),
    dataVersion: "DEMO-CORPORATE-FINANCIAL-EFFECTS-2027-v1",
    uncertaintySigma: 0.15,
  };
}

function prtrRecord(
  siteId: string,
  medium: PrtrReleaseMedium,
  quantityKg: number | null,
  eligibility: "eligible" | "transfer_only",
  effect?: CorporateFinancialEffectInput
): StoredPhysicalInputRecord {
  const facilityId = siteId === HEADQUARTERS_SITE_ID ? "DEMO-HQ-FAC-001" : "DEMO-YK-FAC-001";
  const id = `demo-${siteId}-prtr-${medium}`;
  const data: PrtrNormalizedRecord = {
    id,
    physicalQuantityId: id,
    siteId,
    reportingYear: 2023,
    prtrListVersion: "2023",
    facilityId,
    businessEntityName: "東海化成株式会社（デモ）",
    facilityName: siteId === HEADQUARTERS_SITE_ID ? "本社工場（デモPRTR）" : "四日市工場（デモPRTR）",
    prefecture: siteId === HEADQUARTERS_SITE_ID ? "愛知県" : "三重県",
    municipality: siteId === HEADQUARTERS_SITE_ID ? "名古屋市" : "四日市市",
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
    sourceRecordId: `${facilityId}:1`,
    sourceRecordHash: "1".repeat(64),
    sourceLineNumber: 1,
  };
  return {
    batchId: PRTR_BATCH_ID,
    id,
    siteId,
    category: "pollution",
    physicalQuantity: quantityKg,
    unit: "kg",
    calculationEligibility: eligibility,
    sourceRecordHash: data.sourceRecordHash,
    sourceLineNumber: 1,
    data: { ...data, ...(effect ? { corporateFinancialEffect: effect } : {}) } as unknown as Record<string, unknown>,
  };
}

function wasteInput(siteId: string): WasteQuantityInput {
  const facilityId = siteId === HEADQUARTERS_SITE_ID ? "DEMO-HQ-FAC-001" : "DEMO-YK-FAC-001";
  return {
    category: "waste", physicalQuantity: 1_000, unit: "kg", siteId, sourceRegion: "JP", targetRegion: "JP",
    reportingPeriod: "2023", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
    treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: `waste-${siteId}-demo-001`,
    sourceRecordHash: "2".repeat(64), linkedPrtrTransferInputId: `${facilityId}:1:offsite_waste`, internalTreatmentCost: 25_000,
  };
}

function landConversion(siteId: string): LandConversionInput {
  return {
    category: "land_use", activityKind: "conversion", physicalQuantity: 500, unit: "m2", siteId,
    sourceRegion: "JP", targetRegion: "JP", projectId: `project-${siteId}-demo-001`,
    landClassBefore: "forest", landClassAfter: "building", sourceRecordId: `land-${siteId}-demo-001`,
    sourceRecordHash: "3".repeat(64),
  };
}

function landOccupation(siteId: string): LandOccupationInput {
  return {
    category: "land_use", activityKind: "occupation", physicalQuantity: 500, unit: "m2year", siteId,
    sourceRegion: "JP", targetRegion: "JP", projectId: `project-${siteId}-demo-001`, landClass: "building",
    sourceRecordId: `land-${siteId}-demo-002`, sourceRecordHash: "4".repeat(64),
  };
}

function customerRecord(
  batchId: string,
  id: string,
  input: WasteQuantityInput | LandConversionInput | LandOccupationInput,
  line: number,
  effect?: CorporateFinancialEffectInput
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
    data: { ...input, sourceKind: "demo_sample", ...(effect ? { corporateFinancialEffect: effect } : {}) },
  };
}

function recordsForSite(siteId: string, withExchangeValue: boolean): StoredPhysicalInputRecord[] {
  const facilityId = siteId === HEADQUARTERS_SITE_ID ? "DEMO-HQ-FAC-001" : "DEMO-YK-FAC-001";
  const projectId = `project-${siteId}-demo-001`;
  const airId = `demo-${siteId}-prtr-air`;
  const wasteId = `demo-${siteId}-waste-row-1`;
  const conversionId = `demo-${siteId}-land-row-1`;
  const occupationId = `demo-${siteId}-land-row-2`;
  const pollutionEffect = withExchangeValue ? corporateEffect({
    id: `cfe-${siteId}-pollution`, siteId, category: "pollution", linkedPhysicalQuantityId: airId,
    grossCost: 18_000_000, alreadyInternalizedCost: 3_000_000, verifiedIncrementalBenefit: 0, amountBasis: "annual",
    internalizationScenarios: [{ scenario: "pollution_regulation_and_remediation", probability: 0.65, period: 3 }],
    doubleCountKey: `${siteId}:pollution:direct-air:acrylonitrile`,
  }) : undefined;
  const wasteEffect = withExchangeValue ? corporateEffect({
    id: `cfe-${siteId}-waste`, siteId, category: "waste", linkedPhysicalQuantityId: wasteId,
    grossCost: 85_000, alreadyInternalizedCost: 25_000, verifiedIncrementalBenefit: 12_000, amountBasis: "annual",
    internalizationScenarios: [{ scenario: "waste_epr_and_treatment", probability: 0.7, period: 1 }],
    doubleCountKey: `${siteId}:waste:${facilityId}:offsite-waste`,
  }) : undefined;
  const conversionEffect = withExchangeValue ? corporateEffect({
    id: `cfe-${siteId}-land-conversion`, siteId, category: "land_use", linkedPhysicalQuantityId: conversionId,
    grossCost: 36_000_000, alreadyInternalizedCost: 6_000_000, verifiedIncrementalBenefit: 0, amountBasis: "one_time",
    internalizationScenarios: [{ scenario: "land_restoration_and_offset", probability: 0.55, period: 5 }],
    doubleCountKey: `${siteId}:land:${projectId}:conversion`,
  }) : undefined;
  const occupationEffect = withExchangeValue ? corporateEffect({
    id: `cfe-${siteId}-land-occupation`, siteId, category: "land_use", linkedPhysicalQuantityId: occupationId,
    grossCost: 1_200_000, alreadyInternalizedCost: 200_000, verifiedIncrementalBenefit: 0, amountBasis: "annual",
    internalizationScenarios: [{ scenario: "land_restoration_and_offset", probability: 0.4, period: 2 }],
    doubleCountKey: `${siteId}:land:${projectId}:occupation`,
  }) : undefined;

  return [
    prtrRecord(siteId, "air", 120, "eligible", pollutionEffect),
    prtrRecord(siteId, "public_water", 0, "eligible"),
    prtrRecord(siteId, "soil", null, "eligible"),
    prtrRecord(siteId, "onsite_landfill", 0, "eligible"),
    prtrRecord(siteId, "sewer", 0, "transfer_only"),
    prtrRecord(siteId, "offsite_waste", 1_000, "transfer_only"),
    customerRecord(WASTE_BATCH_ID, wasteId, wasteInput(siteId), 2, wasteEffect),
    customerRecord(LAND_BATCH_ID, conversionId, landConversion(siteId), 2, conversionEffect),
    customerRecord(LAND_BATCH_ID, occupationId, landOccupation(siteId), 3, occupationEffect),
  ];
}

export const DEMO_CATEGORY_EXPANSION_RECORDS: StoredPhysicalInputRecord[] = [
  ...recordsForSite(HEADQUARTERS_SITE_ID, true),
  ...recordsForSite(YOKKAICHI_SITE_ID, false),
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
      { role: "honshi", fileName: "honshi.txt", sha256: SAMPLE_HASHES.honshi, rowCount: 2, encoding: "CP932" },
      { role: "besshi", fileName: "besshi.txt", sha256: SAMPLE_HASHES.besshi, rowCount: 2, encoding: "CP932" },
      { role: "other_industries", fileName: "other-industries.txt", sha256: SAMPLE_HASHES.otherIndustries, rowCount: 2, encoding: "CP932" },
      { role: "facility_crosswalk", fileName: "facility-crosswalk.csv", sha256: SAMPLE_HASHES.crosswalk, rowCount: 2, encoding: "UTF-8" },
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
    sourceManifest: { fileName: "waste.csv", sha256: SAMPLE_HASHES.waste, rowCount: 2, encoding: "UTF-8" },
    createdAt: CREATED_AT,
  },
  {
    id: LAND_BATCH_ID,
    category: "land_use",
    sourceKind: "demo_sample",
    schemaVersion: "customer-land-use-csv-v1",
    dataVersion: "DEMO-LAND-2023",
    reportingYear: null,
    sourceManifest: { fileName: "land-use.csv", sha256: SAMPLE_HASHES.land, rowCount: 4, encoding: "UTF-8" },
    createdAt: CREATED_AT,
  },
];
