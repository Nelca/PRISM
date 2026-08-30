import { createHash, randomUUID } from "node:crypto";
import { parseCsvStrict, type CsvRow } from "./csv";
import {
  BESSHI,
  BESSHI_COLUMN_COUNT,
  CROSSWALK_COLUMNS,
  HONSHI,
  HONSHI_COLUMN_COUNT,
  OTHER_INDUSTRIES_COLUMN_COUNT,
  PRTR_OFFICIAL_SCHEMA_VERSION,
} from "./layout";
import type {
  LoadPrtrDatasetInput,
  LoadPrtrDatasetResult,
  PrtrCalculationEligibility,
  PrtrImportBatch,
  PrtrNormalizedRecord,
  PrtrReleaseMedium,
  PrtrSourceFile,
  PrtrSourceManifestEntry,
} from "./types";

interface FacilityRow {
  facilityId: string;
  reportingYear: number;
  businessEntityName: string;
  facilityName: string;
  prefecture: string;
  municipality: string;
}

interface CrosswalkRow {
  reportingYear: number;
  facilityId: string;
  siteId: string;
  lineNumber: number;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decode(file: PrtrSourceFile, encoding: "CP932" | "UTF-8", errors: string[]): string {
  try {
    const label = encoding === "CP932" ? "shift_jis" : "utf-8";
    return new TextDecoder(label, { fatal: true }).decode(file.bytes).replace(/^\uFEFF/, "");
  } catch {
    errors.push(`${file.name}: ${encoding}として読み取れません。文字コードを確認してください。`);
    return "";
  }
}

function parseFile(
  file: PrtrSourceFile,
  role: PrtrSourceManifestEntry["role"],
  encoding: "CP932" | "UTF-8",
  errors: string[]
): { rows: CsvRow[]; manifest: PrtrSourceManifestEntry } {
  const parsed = parseCsvStrict(decode(file, encoding, errors), file.name);
  errors.push(...parsed.errors);
  return {
    rows: parsed.rows,
    manifest: {
      role,
      fileName: file.name,
      sha256: sha256(file.bytes),
      rowCount: parsed.rows.length,
      encoding,
    },
  };
}

function requireColumnCount(rows: CsvRow[], expected: number, fileName: string, errors: string[]): void {
  for (const row of rows) {
    if (row.fields.length !== expected) {
      errors.push(`${fileName} ${row.lineNumber}行目: 列数が${row.fields.length}列です。${expected}列である必要があります。`);
    }
  }
}

function parseInteger(value: string, label: string, errors: string[]): number | null {
  if (!/^\d+$/.test(value.trim())) {
    errors.push(`${label}: 整数で入力してください。`);
    return null;
  }
  return Number(value);
}

function parseFacilities(rows: CsvRow[], fileName: string, expectedYear: number, errors: string[]): Map<string, FacilityRow> {
  const facilities = new Map<string, FacilityRow>();
  for (const row of rows) {
    if (row.fields.length !== HONSHI_COLUMN_COUNT) continue;
    const facilityId = row.fields[HONSHI.facilityId].trim();
    const year = parseInteger(row.fields[HONSHI.reportingYear], `${fileName} ${row.lineNumber}行目の排出年度`, errors);
    if (!facilityId) errors.push(`${fileName} ${row.lineNumber}行目: 整理番号が空です。`);
    if (year !== null && year !== expectedYear) {
      errors.push(`${fileName} ${row.lineNumber}行目: 排出年度${year}が指定年度${expectedYear}と一致しません。`);
    }
    if (facilities.has(facilityId)) {
      errors.push(`${fileName} ${row.lineNumber}行目: 整理番号${facilityId}が重複しています。`);
      continue;
    }
    if (facilityId && year !== null) {
      facilities.set(facilityId, {
        facilityId,
        reportingYear: year,
        businessEntityName: row.fields[HONSHI.businessEntityName],
        facilityName: row.fields[HONSHI.facilityName],
        prefecture: row.fields[HONSHI.prefecture],
        municipality: row.fields[HONSHI.municipality],
      });
    }
  }
  return facilities;
}

function parseCrosswalk(
  rows: CsvRow[],
  fileName: string,
  expectedYear: number,
  validSiteIds: ReadonlySet<string> | undefined,
  errors: string[]
): CrosswalkRow[] {
  if (rows.length === 0) {
    errors.push(`${fileName}: ヘッダーと1件以上の対応行が必要です。`);
    return [];
  }
  const header = rows[0].fields.map((field) => field.trim());
  if (header.length !== CROSSWALK_COLUMNS.length || CROSSWALK_COLUMNS.some((column, index) => header[index] !== column)) {
    errors.push(`${fileName} 1行目: ヘッダーは ${CROSSWALK_COLUMNS.join(",")} の順にしてください。`);
  }

  const result: CrosswalkRow[] = [];
  const seenFacility = new Set<string>();
  for (const row of rows.slice(1)) {
    if (row.fields.length !== CROSSWALK_COLUMNS.length) {
      errors.push(`${fileName} ${row.lineNumber}行目: 3列である必要があります。`);
      continue;
    }
    const year = parseInteger(row.fields[0], `${fileName} ${row.lineNumber}行目のreporting_year`, errors);
    const facilityId = row.fields[1].trim();
    const siteId = row.fields[2].trim();
    if (!facilityId) errors.push(`${fileName} ${row.lineNumber}行目: facility_idが空です。`);
    if (!siteId) errors.push(`${fileName} ${row.lineNumber}行目: site_idが空です。`);
    if (year !== null && year !== expectedYear) {
      errors.push(`${fileName} ${row.lineNumber}行目: reporting_year ${year}が指定年度${expectedYear}と一致しません。`);
    }
    const key = `${year}:${facilityId}`;
    if (seenFacility.has(key)) {
      errors.push(`${fileName} ${row.lineNumber}行目: reporting_yearとfacility_idの組合せが重複しています。`);
    }
    seenFacility.add(key);
    if (siteId && validSiteIds && !validSiteIds.has(siteId)) {
      errors.push(`${fileName} ${row.lineNumber}行目: site_id ${siteId}はこのテナントの登録拠点ではありません。`);
    }
    if (year !== null && facilityId && siteId) result.push({ reportingYear: year, facilityId, siteId, lineNumber: row.lineNumber });
  }
  if (result.length === 0) errors.push(`${fileName}: 有効な事業所対応がありません。`);
  return result;
}

function parseQuantity(
  value: string,
  unitCode: string,
  label: string,
  errors: string[]
): { original: number | null; kg: number | null; status: "reported" | "not_reported"; unit: "kg" | "mg-TEQ" } {
  const unit = unitCode === "2" ? "mg-TEQ" : "kg";
  if (unitCode !== "1" && unitCode !== "2") {
    errors.push(`${label}: 単位コードは1(kg)または2(mg-TEQ)である必要があります。`);
  }
  if (value.trim() === "") return { original: null, kg: null, status: "not_reported", unit };
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    errors.push(`${label}: 量は0以上の数値である必要があります。`);
    return { original: null, kg: null, status: "not_reported", unit };
  }
  return {
    original: quantity,
    kg: unitCode === "2" ? quantity / 1_000_000 : quantity,
    status: "reported",
    unit,
  };
}

const MEDIUM_COLUMNS: ReadonlyArray<{
  medium: PrtrReleaseMedium;
  column: number;
  eligibility: PrtrCalculationEligibility;
}> = [
  { medium: "air", column: BESSHI.air, eligibility: "eligible" },
  { medium: "public_water", column: BESSHI.publicWater, eligibility: "eligible" },
  { medium: "soil", column: BESSHI.soil, eligibility: "eligible" },
  { medium: "onsite_landfill", column: BESSHI.onsiteLandfill, eligibility: "eligible" },
  { medium: "sewer", column: BESSHI.sewer, eligibility: "transfer_only" },
  { medium: "offsite_waste", column: BESSHI.offsiteWaste, eligibility: "transfer_only" },
];

/** 公式3ファイルと明示crosswalkを全件検証し、長形式へ正規化する。エラー時はbatchを返さない。 */
export function loadPrtrDataset(input: LoadPrtrDatasetInput): LoadPrtrDatasetResult {
  const errors: string[] = [];
  if (!Number.isInteger(input.reportingYear) || input.reportingYear < 2023) {
    errors.push("reportingYearは2023以上の整数を指定してください(この取込器は2023年以降の公式列定義に対応します)。");
  }
  if (!input.prtrListVersion.trim()) errors.push("prtrListVersionを指定してください。");

  const honshi = parseFile(input.honshi, "honshi", "CP932", errors);
  const besshi = parseFile(input.besshi, "besshi", "CP932", errors);
  const other = parseFile(input.otherIndustries, "other_industries", "CP932", errors);
  const crosswalk = parseFile(input.facilityCrosswalk, "facility_crosswalk", "UTF-8", errors);
  requireColumnCount(honshi.rows, HONSHI_COLUMN_COUNT, input.honshi.name, errors);
  requireColumnCount(besshi.rows, BESSHI_COLUMN_COUNT, input.besshi.name, errors);
  requireColumnCount(other.rows, OTHER_INDUSTRIES_COLUMN_COUNT, input.otherIndustries.name, errors);

  const facilities = parseFacilities(honshi.rows, input.honshi.name, input.reportingYear, errors);
  const mappings = parseCrosswalk(
    crosswalk.rows,
    input.facilityCrosswalk.name,
    input.reportingYear,
    input.validSiteIds,
    errors
  );
  const siteByFacility = new Map<string, string>();
  for (const mapping of mappings) {
    if (!facilities.has(mapping.facilityId)) {
      errors.push(`${input.facilityCrosswalk.name} ${mapping.lineNumber}行目: facility_id ${mapping.facilityId}が本紙にありません。`);
    }
    siteByFacility.set(mapping.facilityId, mapping.siteId);
  }

  for (const row of other.rows) {
    if (row.fields.length === OTHER_INDUSTRIES_COLUMN_COUNT && !facilities.has(row.fields[0].trim())) {
      errors.push(`${input.otherIndustries.name} ${row.lineNumber}行目: 整理番号${row.fields[0]}が本紙にありません。`);
    }
  }

  const records: PrtrNormalizedRecord[] = [];
  const seenSheets = new Set<string>();
  for (const row of besshi.rows) {
    if (row.fields.length !== BESSHI_COLUMN_COUNT) continue;
    const facilityId = row.fields[BESSHI.facilityId].trim();
    const facility = facilities.get(facilityId);
    if (!facility) {
      errors.push(`${input.besshi.name} ${row.lineNumber}行目: 整理番号${facilityId}が本紙にありません。`);
      continue;
    }
    const sheetNumber = row.fields[BESSHI.sheetNumber].trim();
    const sheetKey = `${facilityId}:${sheetNumber}`;
    if (!sheetNumber) errors.push(`${input.besshi.name} ${row.lineNumber}行目: 別紙番号が空です。`);
    if (seenSheets.has(sheetKey)) errors.push(`${input.besshi.name} ${row.lineNumber}行目: 整理番号と別紙番号が重複しています。`);
    seenSheets.add(sheetKey);

    const substanceCode = row.fields[BESSHI.substanceCode].trim();
    if (!substanceCode) errors.push(`${input.besshi.name} ${row.lineNumber}行目: 化学物質管理番号が空です。`);
    const siteId = siteByFacility.get(facilityId);
    const sourceRecordHash = sha256(JSON.stringify(row.fields));
    if (!siteId) continue; // crosswalkで選ばれていない全国事業所は取込対象外。

    for (const definition of MEDIUM_COLUMNS) {
      const quantity = parseQuantity(
        row.fields[definition.column],
        row.fields[BESSHI.unitCode].trim(),
        `${input.besshi.name} ${row.lineNumber}行目の${definition.medium}`,
        errors
      );
      const identityHash = sha256(`${input.reportingYear}|${facilityId}|${sheetNumber}|${substanceCode}|${definition.medium}|${sourceRecordHash}`);
      const id = `pir-prtr-${identityHash.slice(0, 24)}`;
      records.push({
        id,
        physicalQuantityId: id,
        siteId,
        reportingYear: input.reportingYear,
        prtrListVersion: input.prtrListVersion.trim(),
        facilityId,
        businessEntityName: facility.businessEntityName,
        facilityName: facility.facilityName,
        prefecture: facility.prefecture,
        municipality: facility.municipality,
        prtrSubstanceCode: substanceCode,
        substanceName: row.fields[BESSHI.substanceName],
        casRns: [],
        releaseMedium: definition.medium,
        quantityKg: quantity.kg,
        originalQuantity: quantity.original,
        originalUnit: quantity.unit,
        measurementStatus: quantity.status,
        calculationEligibility: definition.eligibility,
        sourceKind: input.sourceKind ?? "public_prtr",
        sourceRecordId: `${facilityId}:${sheetNumber}`,
        sourceRecordHash,
        sourceLineNumber: row.lineNumber,
      });
    }
  }

  if (errors.length > 0) return { batch: null, errors };

  const manifests = [honshi.manifest, besshi.manifest, other.manifest, { ...crosswalk.manifest, rowCount: Math.max(0, crosswalk.rows.length - 1) }];
  const batch: PrtrImportBatch = {
    id: `input-batch-${randomUUID()}`,
    category: "pollution",
    sourceKind: input.sourceKind ?? "public_prtr",
    schemaVersion: PRTR_OFFICIAL_SCHEMA_VERSION,
    dataVersion: `PRTR-${input.reportingYear}`,
    reportingYear: input.reportingYear,
    sourceManifest: manifests,
    records,
  };
  return { batch, errors: [] };
}

export type { LoadPrtrDatasetInput, LoadPrtrDatasetResult, PrtrImportBatch, PrtrNormalizedRecord } from "./types";
