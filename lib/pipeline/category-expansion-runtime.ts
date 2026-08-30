import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getPluginsForCategory } from "@core/monetization/registry";
import type { DeepDiveQuantityConfig } from "@core/pipeline/valuation-pipeline";
import type {
  LandConversionInput,
  LandOccupationInput,
  PhysicalQuantityInput,
  PollutionReleaseInput,
  WasteQuantityInput,
} from "@core/types/valuation";
import {
  loadLandMappings,
  loadLime3CoefficientTable,
  loadPollutionMappings,
  loadWasteMappings,
  resolveLandUseFactor,
  resolvePollutionFactor,
  resolveWasteFactor,
} from "@/lib/data/lime3";
import type {
  AppendCalculationLineItemInput,
  StoredInputBatch,
  StoredPhysicalInputRecord,
} from "@/lib/db/repositories/physical-inputs";
import type { InputCoverageSummary, MethodAvailability } from "@/lib/demo/run-demo-pipeline";
import type { PrtrNormalizedRecord } from "@/lib/intake/prtr";

const DATA_ROOT = path.join(process.cwd(), "docs", "data");
const LIME3_CSV = path.join(DATA_ROOT, "external", "aist-idea-lime3-v4.0-lcia-coefficients.csv");
const POLLUTION_MAPPING = path.join(DATA_ROOT, "mappings", "prtr-lime3-flow-mapping-v1.csv");
const WASTE_MAPPING = path.join(DATA_ROOT, "mappings", "waste-lime3-flow-mapping-v1.csv");
const LAND_MAPPING = path.join(DATA_ROOT, "mappings", "land-use-lime3-flow-mapping-v1.csv");
const LIME3_LICENSE_EXPIRES_AT = "2027-06-30T23:59:59+09:00";

export const LIME3_USD_JPY_CONVERSION = {
  fromCurrency: "USD" as const,
  toCurrency: "JPY" as const,
  rate: 94.46,
  rateDate: "2024",
  source: "World Bank PA.NUS.PPP (Japan, 2024)",
};

const IDENTITY_CALIBRATION = {
  pppSource: "not_applicable:currency-converted-separately",
  pppValue: 1,
  incomeElasticity: 0,
  sourceIncomeLevel: 1,
  targetIncomeLevel: 1,
  deflator: 1,
  relativePriceEscalationRate: 0,
  elapsedYears: 0,
  areaScaling: 1,
};

export interface CategoryExpansionRuntime {
  physicalInputs: PhysicalQuantityInput[];
  deepDiveConfigsByMaterialIssue: Record<string, DeepDiveQuantityConfig[]>;
  coverageByMaterialIssue: Record<string, InputCoverageSummary>;
  methodAvailabilityByMaterialIssue: Record<string, MethodAvailability[]>;
  inputBatchHashes: string[];
  calculationLineItems: AppendCalculationLineItemInput[];
  activeMaterialIssueTargets: { siteId: string; category: PhysicalQuantityInput["category"] }[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function batchHash(batch: StoredInputBatch): string {
  return sha256(
    JSON.stringify({
      category: batch.category,
      sourceKind: batch.sourceKind,
      schemaVersion: batch.schemaVersion,
      dataVersion: batch.dataVersion,
      reportingYear: batch.reportingYear,
      sourceManifest: batch.sourceManifest,
    })
  );
}

function prtrInput(record: StoredPhysicalInputRecord): PollutionReleaseInput | null {
  if (record.category !== "pollution" || record.physicalQuantity === null) return null;
  const data = record.data as unknown as PrtrNormalizedRecord;
  return {
    category: "pollution",
    physicalQuantity: record.physicalQuantity,
    unit: "kg",
    siteId: record.siteId,
    sourceRegion: "JP",
    targetRegion: "JP",
    reportingYear: data.reportingYear,
    prtrListVersion: data.prtrListVersion,
    facilityId: data.facilityId,
    prtrSubstanceCode: data.prtrSubstanceCode,
    casRns: data.casRns,
    releaseMedium: data.releaseMedium,
    sourceKind: data.sourceKind,
    sourceRecordId: data.sourceRecordId,
    sourceRecordHash: data.sourceRecordHash,
  };
}

function storedCustomerInput(record: StoredPhysicalInputRecord): WasteQuantityInput | LandConversionInput | LandOccupationInput | null {
  if (record.physicalQuantity === null || (record.category !== "waste" && record.category !== "land_use")) return null;
  const data = record.data as Record<string, unknown>;
  return {
    ...data,
    category: record.category,
    physicalQuantity: record.physicalQuantity,
    unit: record.unit,
    siteId: record.siteId,
    sourceRegion: typeof data.sourceRegion === "string" ? data.sourceRegion : "JP",
    targetRegion: typeof data.targetRegion === "string" ? data.targetRegion : "JP",
    sourceRecordHash: record.sourceRecordHash,
  } as WasteQuantityInput | LandConversionInput | LandOccupationInput;
}

function createCoverage(sourceKind: string, period: string): InputCoverageSummary {
  return {
    sourceKind,
    reportingPeriod: period,
    quantities: [],
    rowCounts: { total: 0, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 0 },
    mappingVersion: "1.0.0",
    coefficientVersion: "LIME3-3.0.0/AIST-IDEA-4.0",
  };
}

function addCoverage(
  coverage: InputCoverageSummary,
  status: "calculated" | "unmapped" | "transferOnly" | "blocked",
  quantity: number | null,
  unit: string
): void {
  coverage.rowCounts.total += 1;
  coverage.rowCounts[status] += 1;
  let breakdown = coverage.quantities.find((entry) => entry.unit === unit);
  if (!breakdown) {
    breakdown = {
      unit, total: 0, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 0,
      rowCounts: { total: 0, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 0 },
    };
    coverage.quantities.push(breakdown);
  }
  breakdown.rowCounts.total += 1;
  breakdown.rowCounts[status] += 1;
  if (quantity !== null) {
    breakdown.total += quantity;
    breakdown[status] += quantity;
  }
}

/** 追記済み入力をレビュー済み対応表へ解決し、M1〜M8へ渡す実行時設定を組み立てる。 */
export async function buildCategoryExpansionRuntime(
  records: StoredPhysicalInputRecord[],
  activeBatches: StoredInputBatch[],
  referenceDate = new Date()
): Promise<CategoryExpansionRuntime> {
  if (records.length === 0) {
    return {
      physicalInputs: [],
      deepDiveConfigsByMaterialIssue: {},
      coverageByMaterialIssue: {},
      methodAvailabilityByMaterialIssue: {},
      inputBatchHashes: activeBatches.map(batchHash),
      calculationLineItems: [],
      activeMaterialIssueTargets: [],
    };
  }
  const [lime3Text, pollutionMappingText, wasteMappingText, landMappingText] = await Promise.all([
    readFile(LIME3_CSV, "utf8"),
    readFile(POLLUTION_MAPPING, "utf8"),
    readFile(WASTE_MAPPING, "utf8"),
    readFile(LAND_MAPPING, "utf8"),
  ]);
  const table = loadLime3CoefficientTable(lime3Text);
  const pollutionMappings = loadPollutionMappings(pollutionMappingText);
  const wasteMappings = loadWasteMappings(wasteMappingText);
  const landMappings = loadLandMappings(landMappingText);
  const physicalInputs: PhysicalQuantityInput[] = [];
  const deepDiveConfigsByMaterialIssue: Record<string, DeepDiveQuantityConfig[]> = {};
  const coverageByMaterialIssue: Record<string, InputCoverageSummary> = {};
  const methodAvailabilityByMaterialIssue: Record<string, MethodAvailability[]> = {};
  const calculationLineItems: AppendCalculationLineItemInput[] = [];
  const targetKeys = new Map<string, { siteId: string; category: PhysicalQuantityInput["category"] }>();
  const licenseExpired = referenceDate.getTime() > new Date(LIME3_LICENSE_EXPIRES_AT).getTime();

  for (const record of records) {
    const input = prtrInput(record) ?? storedCustomerInput(record);
    const materialIssueId = `${record.siteId}-mi-${record.category}`;
    if (record.category === "pollution" || record.category === "waste" || record.category === "land_use") {
      targetKeys.set(materialIssueId, { siteId: record.siteId, category: record.category });
    }
    const methodId =
      record.category === "pollution" ? "lime3-pollution" : record.category === "waste" ? "lime3-waste" : "lime3-land-use";
    const data = record.data as Record<string, unknown>;
    const sourceKind = typeof data.sourceKind === "string" ? data.sourceKind : record.category === "pollution" ? "public_prtr" : "customer_csv";
    const reportingPeriod =
      typeof data.reportingYear === "number"
        ? String(data.reportingYear)
        : typeof data.reportingPeriod === "string"
          ? data.reportingPeriod
          : "not_specified";
    const coverage = (coverageByMaterialIssue[materialIssueId] ??= createCoverage(sourceKind, reportingPeriod));
    methodAvailabilityByMaterialIssue[materialIssueId] = [
      {
        methodId,
        licenseMode: "bring_your_own_license",
        status: licenseExpired ? "expired" : "available",
        reason: licenseExpired
          ? "AIST-IDEA標準版ライセンスの有効期限を経過したため算定を停止"
          : "AIST-IDEA標準版ライセンス(有効期限2027-06-30)",
        licenseExpiresAt: "2027-06-30",
      },
    ];

    if (!input) {
      addCoverage(coverage, "blocked", null, record.unit);
      calculationLineItems.push({
        id: `cli-${record.id}`,
        inputRecordId: record.id,
        materialIssueId,
        methodId,
        status: "blocked",
        reason: "物理量が未報告のため算定していません。0とは扱いません。",
        data: { inputBatchId: record.batchId },
      });
      continue;
    }
    physicalInputs.push(input);
    if (input.category === "pollution" && (input.releaseMedium === "sewer" || input.releaseMedium === "offsite_waste")) {
      addCoverage(coverage, "transferOnly", input.physicalQuantity, input.unit);
      calculationLineItems.push({
        id: `cli-${record.id}`,
        inputRecordId: record.id,
        materialIssueId,
        methodId,
        status: "transfer_only",
        reason: "下水道・事業所外への移動量は環境への直接放出として貨幣化しません。",
        data: { inputBatchId: record.batchId },
      });
      continue;
    }
    if (licenseExpired) {
      addCoverage(coverage, "blocked", input.physicalQuantity, input.unit);
      calculationLineItems.push({
        id: `cli-${record.id}`,
        inputRecordId: record.id,
        materialIssueId,
        methodId,
        status: "blocked",
        reason: "LIME3係数ライセンスの有効期限を経過したため算定していません。",
        data: { inputBatchId: record.batchId },
      });
      continue;
    }

    let resolvedInput: PhysicalQuantityInput = input;
    if (input.category === "pollution" && input.casRns.length === 0) {
      const candidates = pollutionMappings.filter(
        (mapping) =>
          mapping.reportingYear === input.reportingYear &&
          mapping.prtrListVersion === input.prtrListVersion &&
          mapping.prtrSubstanceCode === input.prtrSubstanceCode &&
          mapping.releaseMedium === input.releaseMedium
      );
      if (candidates.length === 1) {
        resolvedInput = { ...input, casRns: [candidates[0].casRn], casSource: "reviewed_mapping" };
      }
    }
    const resolution =
      resolvedInput.category === "pollution"
        ? resolvePollutionFactor(resolvedInput, table, pollutionMappings)
        : resolvedInput.category === "waste"
          ? resolveWasteFactor(resolvedInput, table, wasteMappings)
          : resolvedInput.category === "land_use"
            ? resolveLandUseFactor(resolvedInput, table, landMappings)
            : null;
    if (!resolution) {
      addCoverage(coverage, "unmapped", input.physicalQuantity, input.unit);
      calculationLineItems.push({
        id: `cli-${record.id}`,
        inputRecordId: record.id,
        materialIssueId,
        methodId,
        status: "unmapped",
        reason: "レビュー済みLIME3対応表に一致する係数がありません。",
        data: { inputBatchId: record.batchId },
      });
      continue;
    }

    addCoverage(coverage, "calculated", input.physicalQuantity, input.unit);
    const plugin = getPluginsForCategory(input.category).find((candidate) => candidate.methodId === methodId);
    if (!plugin) throw new Error(`${methodId}が手法レジストリに登録されていません。`);
    (deepDiveConfigsByMaterialIssue[materialIssueId] ??= []).push({
      physicalQuantityId: record.id,
      input: resolvedInput,
      config: {
        depth: "deep_dive",
        factorResolution: resolution,
        currencyConversion: resolution.factor.currency === "JPY" ? undefined : LIME3_USD_JPY_CONVERSION,
      },
      calibration: IDENTITY_CALIBRATION,
      plugins: [plugin],
      calibrationSetVersion: "lime3-jpy-currency-conversion-v1",
      reconciliationFunctionVersion: "none",
      fitnessTierThresholdVersion: "not-applicable-v1",
    });
    const valuationRecordId = `${methodId}-${record.id}`;
    const currencyRate = resolution.factor.currency === "JPY" ? 1 : LIME3_USD_JPY_CONVERSION.rate;
    calculationLineItems.push({
      id: `cli-${record.id}`,
      inputRecordId: record.id,
      materialIssueId,
      methodId,
      status: "calculated",
      factorId: resolution.factor.factorId,
      mappingId: resolution.mappingId,
      valuationRecordId,
      amount: input.physicalQuantity * resolution.factor.valuePerUnit * currencyRate,
      data: { inputBatchId: record.batchId, mappingVersion: resolution.mappingVersion, mappingHash: resolution.mappingHash },
    });
  }

  return {
    physicalInputs,
    deepDiveConfigsByMaterialIssue,
    coverageByMaterialIssue,
    methodAvailabilityByMaterialIssue,
    inputBatchHashes: activeBatches.map(batchHash),
    calculationLineItems,
    activeMaterialIssueTargets: [...targetKeys.values()],
  };
}
