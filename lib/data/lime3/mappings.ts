import { createHash } from "node:crypto";
import type {
  FactorResolution,
  LandConversionInput,
  LandOccupationInput,
  PollutionReleaseInput,
  PollutionReleaseMedium,
  WasteQuantityInput,
} from "@/packages/core/src/types";
import { rowsAsObjects } from "./csv";
import { buildLime3ValueFactor, type LoadedLime3Table, type Lime3CoefficientRow } from "./loader";

type ReviewedStatus = "exact" | "reviewed_alias";

interface MappingReview {
  mappingId: string;
  mappingVersion: string;
  matchStatus: ReviewedStatus;
  sourceFlowId: string;
  rationale: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface PollutionLime3Mapping extends MappingReview {
  reportingYear: number;
  prtrListVersion: string;
  prtrSubstanceCode: string;
  casRn: string;
  releaseMedium: Exclude<PollutionReleaseMedium, "sewer" | "offsite_waste">;
  sourceFlowId: string;
}

export interface WasteLime3Mapping extends MappingReview {
  wasteTypeCode: string;
  treatmentRoute: string;
  treatmentLocation: "onsite" | "offsite";
  sourceFlowId: string;
}

export type LandLime3Mapping = MappingReview &
  (
    | {
      activityKind: "occupation";
      landClass: string;
      }
    | {
      activityKind: "conversion";
      landClassBefore: string;
      landClassAfter: string;
      }
  );

const statuses = new Set<ReviewedStatus>(["exact", "reviewed_alias"]);
const directMedia = new Set(["air", "public_water", "soil", "onsite_landfill"]);

function required(row: Record<string, string>, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`LIME3対応表の必須列「${key}」が空です。`);
  return value;
}

function common(row: Record<string, string>) {
  const matchStatus = required(row, "match_status") as ReviewedStatus;
  if (!statuses.has(matchStatus)) throw new Error(`未レビューの対応状態は計算に使用できません: ${matchStatus}`);
  return {
    mappingId: required(row, "mapping_id"),
    mappingVersion: required(row, "mapping_version"),
    matchStatus,
    sourceFlowId: required(row, "source_flow_id"),
    rationale: required(row, "rationale"),
    reviewedBy: required(row, "reviewed_by"),
    reviewedAt: required(row, "reviewed_at"),
  };
}

export function loadPollutionMappings(csvText: string): PollutionLime3Mapping[] {
  return rowsAsObjects(csvText).map((row) => {
    const releaseMedium = required(row, "release_medium") as PollutionLime3Mapping["releaseMedium"];
    if (!directMedia.has(releaseMedium)) throw new Error(`汚染対応表の排出媒体が不正です: ${releaseMedium}`);
    const reportingYear = Number(required(row, "reporting_year"));
    if (!Number.isInteger(reportingYear) || reportingYear < 2001) throw new Error(`汚染対応表の報告年度が不正です: ${row["reporting_year"]}`);
    const result = {
      ...common(row),
      reportingYear,
      prtrListVersion: required(row, "prtr_list_version"),
      prtrSubstanceCode: required(row, "prtr_substance_code"),
      casRn: required(row, "cas_rn"),
      releaseMedium,
    };
    const expectedId = `lime3-pollution:${result.reportingYear}:${result.prtrListVersion}:${result.prtrSubstanceCode}:${result.releaseMedium}`;
    if (result.mappingId !== expectedId) throw new Error(`汚染対応表のmapping_idは監査キー「${expectedId}」と一致する必要があります。`);
    return result;
  });
}

export function loadWasteMappings(csvText: string): WasteLime3Mapping[] {
  return rowsAsObjects(csvText).map((row) => {
    const treatmentLocation = required(row, "treatment_location") as "onsite" | "offsite";
    if (treatmentLocation !== "onsite" && treatmentLocation !== "offsite") {
      throw new Error(`廃棄物対応表の処理場所が不正です: ${treatmentLocation}`);
    }
    const result = {
      ...common(row),
      wasteTypeCode: required(row, "waste_type_code"),
      treatmentRoute: required(row, "treatment_route"),
      treatmentLocation,
    };
    const expectedId = `lime3-waste:${result.wasteTypeCode}:${result.treatmentRoute}:${result.treatmentLocation}`;
    if (result.mappingId !== expectedId) throw new Error(`廃棄物対応表のmapping_idは監査キー「${expectedId}」と一致する必要があります。`);
    return result;
  });
}

export function loadLandMappings(csvText: string): LandLime3Mapping[] {
  return rowsAsObjects(csvText).map((row) => {
    const activityKind = required(row, "activity_kind");
    if (activityKind === "occupation") {
      const result = { ...common(row), activityKind: "occupation" as const, landClass: required(row, "land_class") };
      const expectedId = `lime3-land-use:occupation:${result.landClass}`;
      if (result.mappingId !== expectedId) throw new Error(`土地利用対応表のmapping_idは監査キー「${expectedId}」と一致する必要があります。`);
      return result;
    }
    if (activityKind === "conversion") {
      const result = {
        ...common(row),
        activityKind: "conversion" as const,
        landClassBefore: required(row, "land_class_before"),
        landClassAfter: required(row, "land_class_after"),
      };
      const expectedId = `lime3-land-use:conversion:${result.landClassBefore}:${result.landClassAfter}`;
      if (result.mappingId !== expectedId) throw new Error(`土地利用対応表のmapping_idは監査キー「${expectedId}」と一致する必要があります。`);
      return result;
    }
    throw new Error(`土地利用対応表の活動種別が不正です: ${activityKind}`);
  });
}

function findRow(table: LoadedLime3Table, sourceFlowId: string): Lime3CoefficientRow {
  const row = table.rows.find((candidate) => candidate.sourceFlowId === sourceFlowId);
  if (!row) throw new Error(`対応表が参照するLIME3基本フローが存在しません: ${sourceFlowId}`);
  return row;
}

function mappingHash(mapping: object): string {
  return createHash("sha256").update(JSON.stringify(mapping), "utf8").digest("hex");
}

function exactlyOne<T>(matches: T[], description: string): T | null {
  if (matches.length > 1) throw new Error(`${description}に複数のレビュー済み対応が存在します。`);
  return matches[0] ?? null;
}

function validatePollutionClassification(row: Lime3CoefficientRow, medium: PollutionLime3Mapping["releaseMedium"]): void {
  const expected = medium === "air" ? "排出/大気" : medium === "public_water" ? "排出/水圏" : "排出/陸域";
  if (row.classification !== expected || row.unit !== "kg") {
    throw new Error(`LIME3基本フロー ${row.sourceFlowId} の媒体または単位がPRTR対応表と一致しません。`);
  }
}

export function resolvePollutionFactor(
  input: PollutionReleaseInput,
  table: LoadedLime3Table,
  mappings: PollutionLime3Mapping[]
): FactorResolution | null {
  if (input.releaseMedium === "sewer" || input.releaseMedium === "offsite_waste") return null;
  const mapping = exactlyOne(
    mappings.filter(
      (candidate) =>
        candidate.prtrListVersion === input.prtrListVersion &&
        candidate.reportingYear === input.reportingYear &&
        candidate.prtrSubstanceCode === input.prtrSubstanceCode &&
        candidate.releaseMedium === input.releaseMedium &&
        input.casRns.includes(candidate.casRn)
    ),
    `PRTR ${input.prtrListVersion}/${input.prtrSubstanceCode}/${input.releaseMedium}`
  );
  if (!mapping) return null;
  const row = findRow(table, mapping.sourceFlowId);
  validatePollutionClassification(row, mapping.releaseMedium);
  const factor = buildLime3ValueFactor(row, table.sourceHash, "lime3-pollution");
  factor.medium = mapping.releaseMedium;
  return { factor, mappingId: mapping.mappingId, mappingVersion: mapping.mappingVersion, mappingHash: mappingHash(mapping) };
}

export function resolveWasteFactor(
  input: WasteQuantityInput,
  table: LoadedLime3Table,
  mappings: WasteLime3Mapping[]
): FactorResolution | null {
  const mapping = exactlyOne(
    mappings.filter(
      (candidate) =>
        candidate.wasteTypeCode === input.wasteTypeCode &&
        candidate.treatmentRoute === input.treatmentRoute &&
        candidate.treatmentLocation === input.treatmentLocation
    ),
    `廃棄物 ${input.wasteTypeCode}/${input.treatmentRoute}/${input.treatmentLocation}`
  );
  if (!mapping) return null;
  const row = findRow(table, mapping.sourceFlowId);
  if (row.classification !== "排出/陸域" || row.unit !== "kg" || !row.sourceFlowName.includes("埋立物")) {
    throw new Error(`LIME3基本フロー ${row.sourceFlowId} は指定された廃棄物埋立経路と一致しません。`);
  }
  return {
    factor: buildLime3ValueFactor(row, table.sourceHash, "lime3-waste"),
    mappingId: mapping.mappingId,
    mappingVersion: mapping.mappingVersion,
    mappingHash: mappingHash(mapping),
  };
}

export function resolveLandUseFactor(
  input: LandConversionInput | LandOccupationInput,
  table: LoadedLime3Table,
  mappings: LandLime3Mapping[]
): FactorResolution | null {
  const matches = mappings.filter((candidate) => {
    if (candidate.activityKind !== input.activityKind) return false;
    return candidate.activityKind === "occupation" && input.activityKind === "occupation"
      ? candidate.landClass === input.landClass
      : candidate.activityKind === "conversion" && input.activityKind === "conversion"
        ? candidate.landClassBefore === input.landClassBefore && candidate.landClassAfter === input.landClassAfter
        : false;
  });
  const mapping = exactlyOne(matches, `土地利用 ${input.activityKind}`);
  if (!mapping) return null;
  const row = findRow(table, mapping.sourceFlowId);
  const expectedUnit = input.activityKind === "conversion" ? "m²" : "m²year";
  const expectedLabel = input.activityKind === "conversion" ? "土地改変" : "土地占有";
  if (row.classification !== "資源/土地利用" || row.unit !== expectedUnit || !row.sourceFlowName.includes(expectedLabel)) {
    throw new Error(`LIME3基本フロー ${row.sourceFlowId} は指定された土地活動と一致しません。`);
  }
  return {
    factor: buildLime3ValueFactor(row, table.sourceHash, "lime3-land-use"),
    mappingId: mapping.mappingId,
    mappingVersion: mapping.mappingVersion,
    mappingHash: mappingHash(mapping),
  };
}
