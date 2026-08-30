import type { LandConversionInput, LandOccupationInput } from "@core/types/valuation";
import {
  cell,
  hashNormalizedRow,
  parseCategoryCsv,
  parseFiniteNonNegative,
  requireText,
  type CategoryInputParseOptions,
} from "./common";

const FILE_NAME = "land-use.csv";
const REQUIRED_HEADERS = [
  "site_id",
  "activity_kind",
  "project_id",
  "quantity",
  "unit",
  "land_class",
  "land_class_before",
  "land_class_after",
  "source_record_id",
] as const;

export type ParsedLandUseInput = (LandConversionInput | LandOccupationInput) & { geometryGeoJson?: object };

export interface LandUseCsvParseResult {
  inputs: ParsedLandUseInput[] | null;
  errors: string[];
}

function parseGeometry(raw: string, label: string, errors: string[]): object | undefined {
  if (raw === "") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${label}はGeoJSONオブジェクトで指定してください。`);
      return undefined;
    }
    return value as object;
  } catch {
    errors.push(`${label}が正しいJSONではありません。`);
    return undefined;
  }
}

export function parseLandUseCsv(text: string, options: CategoryInputParseOptions = {}): LandUseCsvParseResult {
  const parsed = parseCategoryCsv(text, FILE_NAME, REQUIRED_HEADERS);
  if (parsed.errors.length > 0) return { inputs: null, errors: parsed.errors };

  const errors: string[] = [];
  const inputs: ParsedLandUseInput[] = [];
  const seenSourceRecordIds = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const line = index + 2;
    const rowErrors: string[] = [];
    const label = (field: string) => `${FILE_NAME} ${line}行目: ${field}`;
    const siteId = requireText(cell(row, parsed.columns, "site_id"), label("site_id"), rowErrors);
    const projectId = requireText(cell(row, parsed.columns, "project_id"), label("project_id"), rowErrors);
    const sourceRecordId = requireText(cell(row, parsed.columns, "source_record_id"), label("source_record_id"), rowErrors);
    const quantity = parseFiniteNonNegative(cell(row, parsed.columns, "quantity"), label("quantity"), rowErrors);
    const activityKindRaw = cell(row, parsed.columns, "activity_kind");
    const unit = cell(row, parsed.columns, "unit");
    const landClass = cell(row, parsed.columns, "land_class");
    const landClassBefore = cell(row, parsed.columns, "land_class_before");
    const landClassAfter = cell(row, parsed.columns, "land_class_after");
    const geometryGeoJson = parseGeometry(cell(row, parsed.columns, "geometry_geojson"), label("geometry_geojson"), rowErrors);

    if (sourceRecordId) {
      const firstLine = seenSourceRecordIds.get(sourceRecordId);
      if (firstLine !== undefined) rowErrors.push(`${label("source_record_id")} "${sourceRecordId}" は${firstLine}行目と重複しています。`);
      else seenSourceRecordIds.set(sourceRecordId, line);
    }

    if (activityKindRaw !== "conversion" && activityKindRaw !== "occupation") {
      rowErrors.push(`${label("activity_kind")}はconversionまたはoccupationで指定してください("${activityKindRaw}")。`);
    } else if (activityKindRaw === "conversion") {
      if (unit !== "m2") rowErrors.push(`${label("unit")}はconversionの場合m2である必要があります("${unit}")。`);
      if (!landClassBefore) rowErrors.push(`${label("land_class_before")}が空です。`);
      if (!landClassAfter) rowErrors.push(`${label("land_class_after")}が空です。`);
      if (landClass) rowErrors.push(`${label("land_class")}はconversionの場合空欄にしてください。`);
    } else {
      if (unit !== "m2year") rowErrors.push(`${label("unit")}はoccupationの場合m2yearである必要があります("${unit}")。`);
      if (!landClass) rowErrors.push(`${label("land_class")}が空です。`);
      if (landClassBefore || landClassAfter) rowErrors.push(`${label("land_class_before/land_class_after")}はoccupationの場合空欄にしてください。`);
    }

    if (siteId && projectId && sourceRecordId && quantity !== null && rowErrors.length === 0) {
      const normalizedBase = {
        siteId,
        activityKind: activityKindRaw,
        projectId,
        quantity,
        unit,
        landClass: landClass || null,
        landClassBefore: landClassBefore || null,
        landClassAfter: landClassAfter || null,
        sourceRecordId,
        geometryGeoJson: geometryGeoJson ?? null,
      };
      const common = {
        category: "land_use" as const,
        physicalQuantity: quantity,
        siteId,
        sourceRegion: options.sourceRegion ?? "JP",
        targetRegion: options.targetRegion ?? "JP",
        projectId,
        sourceRecordId,
        sourceRecordHash: hashNormalizedRow(normalizedBase),
        ...(geometryGeoJson ? { geometryGeoJson } : {}),
      };
      inputs.push(
        activityKindRaw === "conversion"
          ? { ...common, activityKind: "conversion", unit: "m2", landClassBefore, landClassAfter }
          : { ...common, activityKind: "occupation", unit: "m2year", landClass }
      );
    }
    errors.push(...rowErrors);
  });

  return errors.length > 0 ? { inputs: null, errors } : { inputs, errors: [] };
}
