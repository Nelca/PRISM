import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { LicenseMode, ValueFactorRecord } from "@/packages/core/src/types";
import { rowsAsObjects } from "./csv";

export const LIME3_METHOD_VERSION = "3.0.0";
export const LIME3_LICENSE_VALID_UNTIL = "2027-06-30";
export const LIME3_PRODUCTION_JAPAN_INTEGRATED_COLUMN =
  "利子率2%、生産国、日本 / 統合化 / US$";

const REQUIRED_COLUMNS = [
  "基本フローコード",
  "基本フロー名",
  "分類1/分類2",
  "評価領域",
  LIME3_PRODUCTION_JAPAN_INTEGRATED_COLUMN,
] as const;

export interface Lime3CoefficientRow {
  sourceFlowId: string;
  sourceFlowName: string;
  classification: string;
  unit: string;
  /** 空欄はundefinedのまま保持し、0とは区別する。 */
  productionJapanIntegratedUsd: number | undefined;
}

export interface LoadedLime3Table {
  rows: Lime3CoefficientRow[];
  sourceHash: string;
}

function parseOptionalNumber(raw: string, rowNumber: number): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`LIME3 CSV ${rowNumber}行目の統合化係数が数値ではありません。`);
  return value;
}

export function loadLime3CoefficientTable(csvText: string): LoadedLime3Table {
  const objects = rowsAsObjects(csvText);
  if (objects.length === 0) throw new Error("LIME3 CSVにデータ行がありません。");
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in objects[0])) throw new Error(`LIME3 CSVに必須列「${column}」がありません。`);
  }

  const seen = new Set<string>();
  const rows = objects.map((object, index): Lime3CoefficientRow => {
    const sourceFlowId = object["基本フローコード"].trim();
    if (!sourceFlowId) throw new Error(`LIME3 CSV ${index + 2}行目の基本フローコードが空です。`);
    if (seen.has(sourceFlowId)) throw new Error(`LIME3基本フローコードが重複しています: ${sourceFlowId}`);
    seen.add(sourceFlowId);
    return {
      sourceFlowId,
      sourceFlowName: object["基本フロー名"].trim(),
      classification: object["分類1/分類2"].trim(),
      unit: object["評価領域"].trim(),
      productionJapanIntegratedUsd: parseOptionalNumber(
        object[LIME3_PRODUCTION_JAPAN_INTEGRATED_COLUMN],
        index + 2
      ),
    };
  });

  return {
    rows,
    sourceHash: createHash("sha256").update(csvText, "utf8").digest("hex"),
  };
}

export async function loadLime3CoefficientTableFromFile(path: string): Promise<LoadedLime3Table> {
  return loadLime3CoefficientTable(await readFile(path, "utf8"));
}

export function buildLime3ValueFactor(
  row: Lime3CoefficientRow,
  sourceHash: string,
  methodId: string,
  licenseMode: LicenseMode = "bring_your_own_license"
): ValueFactorRecord {
  const denominatorUnit = row.unit === "m²" ? "m2" : row.unit === "m²year" ? "m2year" : row.unit;
  if (denominatorUnit !== "kg" && denominatorUnit !== "m2" && denominatorUnit !== "m2year") {
    throw new Error(`LIME3基本フロー ${row.sourceFlowId} の単位「${row.unit}」は追加カテゴリで未対応です。`);
  }
  if (row.productionJapanIntegratedUsd === undefined) {
    throw new Error(`LIME3基本フロー ${row.sourceFlowId} の日本・生産国・統合化係数は空欄です。`);
  }
  return {
    factorId: `lime3-v4:${row.sourceFlowId}:production-japan-integrated`,
    methodId,
    methodVersion: LIME3_METHOD_VERSION,
    sourceFlowId: row.sourceFlowId,
    sourceFlowName: row.sourceFlowName,
    valuePerUnit: row.productionJapanIntegratedUsd,
    denominatorUnit,
    currency: "USD",
    priceYear: null,
    geographicPerspective: LIME3_PRODUCTION_JAPAN_INTEGRATED_COLUMN,
    sourceRegion: "JP",
    sourceHash,
    licenseMode,
    licenseValidUntil: LIME3_LICENSE_VALID_UNTIL,
  };
}
