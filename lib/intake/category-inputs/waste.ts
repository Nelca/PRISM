import type { WasteQuantityInput } from "@core/types/valuation";
import {
  cell,
  hashNormalizedRow,
  parseCategoryCsv,
  parseFiniteNonNegative,
  parseOptionalFiniteNonNegative,
  requireText,
  type CategoryInputParseOptions,
} from "./common";

const FILE_NAME = "waste.csv";
const REQUIRED_HEADERS = [
  "site_id",
  "reporting_period",
  "waste_type_code",
  "hazardous",
  "treatment_route",
  "treatment_location",
  "weight_basis",
  "quantity_kg",
  "source_record_id",
  "linked_prtr_transfer_input_id",
  "internal_treatment_cost",
] as const;
const HEADER_ALIASES: Record<string, string> = {
  拠点ID: "site_id",
  報告期間: "reporting_period",
  廃棄物種別コード: "waste_type_code",
  有害廃棄物: "hazardous",
  処理方法: "treatment_route",
  処理場所: "treatment_location",
  重量基準: "weight_basis",
  数量kg: "quantity_kg",
  元データID: "source_record_id",
  PRTR移動量ID: "linked_prtr_transfer_input_id",
  内部処理費用: "internal_treatment_cost",
};

export interface WasteCsvParseResult {
  inputs: WasteQuantityInput[] | null;
  errors: string[];
}

export function parseWasteCsv(text: string, options: CategoryInputParseOptions = {}): WasteCsvParseResult {
  const parsed = parseCategoryCsv(text, FILE_NAME, REQUIRED_HEADERS, HEADER_ALIASES);
  if (parsed.errors.length > 0) return { inputs: null, errors: parsed.errors };

  const errors: string[] = [];
  const inputs: WasteQuantityInput[] = [];
  const seenSourceRecordIds = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const line = index + 2;
    const rowErrors: string[] = [];
    const label = (field: string) => `${FILE_NAME} ${line}行目: ${field}`;
    const siteId = requireText(cell(row, parsed.columns, "site_id"), label("site_id"), rowErrors);
    const reportingPeriod = requireText(cell(row, parsed.columns, "reporting_period"), label("reporting_period"), rowErrors);
    const wasteTypeCode = requireText(cell(row, parsed.columns, "waste_type_code"), label("waste_type_code"), rowErrors);
    const treatmentRoute = requireText(cell(row, parsed.columns, "treatment_route"), label("treatment_route"), rowErrors);
    const sourceRecordId = requireText(cell(row, parsed.columns, "source_record_id"), label("source_record_id"), rowErrors);
    const hazardousRaw = cell(row, parsed.columns, "hazardous");
    const treatmentLocationRaw = cell(row, parsed.columns, "treatment_location");
    const weightBasisRaw = cell(row, parsed.columns, "weight_basis");
    const quantity = parseFiniteNonNegative(cell(row, parsed.columns, "quantity_kg"), label("quantity_kg"), rowErrors);
    const internalTreatmentCost = parseOptionalFiniteNonNegative(
      cell(row, parsed.columns, "internal_treatment_cost"),
      label("internal_treatment_cost"),
      rowErrors
    );

    let hazardous: boolean | null = null;
    if (hazardousRaw === "true") hazardous = true;
    else if (hazardousRaw === "false") hazardous = false;
    else rowErrors.push(`${label("hazardous")}はtrueまたはfalseで指定してください("${hazardousRaw}")。`);

    const treatmentLocation = treatmentLocationRaw === "onsite" || treatmentLocationRaw === "offsite" ? treatmentLocationRaw : null;
    if (!treatmentLocation) rowErrors.push(`${label("treatment_location")}はonsiteまたはoffsiteで指定してください("${treatmentLocationRaw}")。`);

    const weightBasis = weightBasisRaw === "wet" || weightBasisRaw === "dry" || weightBasisRaw === "unknown" ? weightBasisRaw : null;
    if (!weightBasis) rowErrors.push(`${label("weight_basis")}はwet、dry、unknownのいずれかで指定してください("${weightBasisRaw}")。`);

    if (sourceRecordId) {
      const firstLine = seenSourceRecordIds.get(sourceRecordId);
      if (firstLine !== undefined) rowErrors.push(`${label("source_record_id")} "${sourceRecordId}" は${firstLine}行目と重複しています。`);
      else seenSourceRecordIds.set(sourceRecordId, line);
    }

    if (
      siteId && reportingPeriod && wasteTypeCode && treatmentRoute && sourceRecordId && hazardous !== null &&
      treatmentLocation && weightBasis && quantity !== null && rowErrors.length === 0
    ) {
      const linkedPrtrTransferInputId = cell(row, parsed.columns, "linked_prtr_transfer_input_id") || undefined;
      const normalized = {
        siteId,
        reportingPeriod,
        wasteTypeCode,
        hazardous,
        treatmentRoute,
        treatmentLocation,
        weightBasis,
        quantityKg: quantity,
        sourceRecordId,
        linkedPrtrTransferInputId: linkedPrtrTransferInputId ?? null,
        internalTreatmentCost: internalTreatmentCost ?? null,
      };
      inputs.push({
        category: "waste",
        physicalQuantity: quantity,
        unit: "kg",
        siteId,
        sourceRegion: options.sourceRegion ?? "JP",
        targetRegion: options.targetRegion ?? "JP",
        reportingPeriod,
        wasteTypeCode,
        hazardous,
        treatmentRoute,
        treatmentLocation,
        weightBasis,
        sourceRecordId,
        sourceRecordHash: hashNormalizedRow(normalized),
        linkedPrtrTransferInputId,
        internalTreatmentCost,
      });
    }
    errors.push(...rowErrors);
  });

  const reportingPeriods = new Set(inputs.map((input) => input.reportingPeriod));
  if (errors.length === 0 && reportingPeriods.size > 1) {
    errors.push(`${FILE_NAME}: 1バッチに複数のreporting_periodは指定できません（${[...reportingPeriods].join("、")}）。期間ごとにファイルを分けてください。`);
  }

  return errors.length > 0 ? { inputs: null, errors } : { inputs, errors: [] };
}
