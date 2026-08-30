import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type { PhysicalQuantityInput, ValueFactorRecord } from "@core/types/valuation";

function publicInputSnapshot(input: PhysicalQuantityInput | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const base = {
    category: input.category,
    unit: input.unit,
    siteId: input.siteId,
    sourceRegion: input.sourceRegion,
    targetRegion: input.targetRegion,
  };
  if (input.category === "pollution") {
    return {
      ...base,
      reportingYear: input.reportingYear,
      prtrListVersion: input.prtrListVersion,
      prtrSubstanceCode: input.prtrSubstanceCode,
      releaseMedium: input.releaseMedium,
      sourceKind: input.sourceKind,
    };
  }
  if (input.category === "waste") {
    return {
      ...base,
      reportingPeriod: input.reportingPeriod,
      wasteTypeCode: input.wasteTypeCode,
      hazardous: input.hazardous,
      treatmentRoute: input.treatmentRoute,
      treatmentLocation: input.treatmentLocation,
      weightBasis: input.weightBasis,
    };
  }
  if (input.category === "land_use") {
    return input.activityKind === "conversion"
      ? { ...base, activityKind: input.activityKind, landClassBefore: input.landClassBefore, landClassAfter: input.landClassAfter }
      : { ...base, activityKind: input.activityKind, landClass: input.landClass };
  }
  return { ...base, physicalQuantity: input.physicalQuantity };
}

function publicFactorSnapshot(factor: ValueFactorRecord | undefined): Record<string, unknown> | undefined {
  if (!factor) return undefined;
  // 原係数値と名称はLIME3ライセンス資産なので、出力APIでは再配布しない。
  return {
    factorId: factor.factorId,
    methodId: factor.methodId,
    methodVersion: factor.methodVersion,
    sourceFlowId: factor.sourceFlowId,
    medium: factor.medium,
    denominatorUnit: factor.denominatorUnit,
    currency: factor.currency,
    priceYear: factor.priceYear,
    geographicPerspective: factor.geographicPerspective,
    sourceRegion: factor.sourceRegion,
    sourceHash: factor.sourceHash,
    licenseMode: factor.licenseMode,
    licenseValidUntil: factor.licenseValidUntil,
  };
}

/** API利用者向け。顧客原本の識別子/hashとライセンス対象の原係数を除いた結果を返す。 */
export function buildPublicPipelineResult(result: DemoPipelineResult) {
  const valuationRecordsByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.valuationRecordsByMaterialIssue).map(([materialIssueId, records]) => [
      materialIssueId,
      records.map((record) => ({
        ...record,
        inputSnapshot: publicInputSnapshot(record.inputSnapshot),
        factorSnapshot: publicFactorSnapshot(record.factorSnapshot),
      })),
    ])
  );
  const assumptionEntries = result.assumptionEntries.map((entry) => {
    if (entry.payload.module !== "M3" || entry.payload.kind !== "input_mapping") return entry;
    return { ...entry, payload: { ...entry.payload, sourceRecordHash: null } };
  });
  const expansionCategories = new Set(["pollution", "waste", "land_use"]);
  const physicalQuantityByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.physicalQuantityByMaterialIssue).filter(([, quantity]) => !expansionCategories.has(quantity.category))
  );
  const physicalQuantitiesByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.physicalQuantitiesByMaterialIssue).filter(
      ([, quantities]) => quantities.every((quantity) => !expansionCategories.has(quantity.category))
    )
  );
  // LIME3原係数は centralValue / (物理量 × 通貨換算率) で復元できるため、公開APIでは
  // 追加カテゴリの正確な物理量を全ての重複経路から除く。行数・単位・算定状態は残す。
  const coverageByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.coverageByMaterialIssue).map(([materialIssueId, coverage]) => [
      materialIssueId,
      {
        sourceKind: coverage.sourceKind,
        reportingPeriod: coverage.reportingPeriod,
        units: coverage.quantities.map((quantity) => quantity.unit),
        rowCounts: coverage.rowCounts,
        mappingVersion: coverage.mappingVersion,
        coefficientVersion: coverage.coefficientVersion,
        quantitiesRedacted: true,
      },
    ])
  );
  return {
    ...result,
    valuation: {
      ...result.valuation,
      valuationRecordsByMaterialIssue,
      physicalQuantityByMaterialIssue,
      physicalQuantitiesByMaterialIssue,
      coverageByMaterialIssue,
    },
    assumptionEntries,
  };
}
