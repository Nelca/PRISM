import { createHash } from "node:crypto";
import { parseCsv } from "../csv";

export interface CategoryInputParseOptions {
  sourceRegion?: string;
  targetRegion?: string;
}

export interface ParsedCategoryCsv {
  rows: string[][];
  columns: Map<string, number>;
  errors: string[];
}

export function parseCategoryCsv(
  text: string,
  fileName: string,
  requiredHeaders: readonly string[],
  headerAliases: Readonly<Record<string, string>> = {}
): ParsedCategoryCsv {
  const rows = parseCsv(text.replace(/^\uFEFF/, "")).filter(
    (row) => row.some((cell) => cell.trim() !== "") && !row[0]?.trim().startsWith("#")
  );
  if (rows.length === 0) return { rows: [], columns: new Map(), errors: [`${fileName}が空です。`] };

  const [header, ...dataRows] = rows;
  const normalizedHeader = header.map((cell) => headerAliases[cell.trim()] ?? cell.trim());
  const columns = new Map(normalizedHeader.map((name, index) => [name, index]));
  const errors: string[] = [];
  if (columns.size !== normalizedHeader.length) errors.push(`${fileName}のヘッダーが重複しています。`);
  for (const required of requiredHeaders) {
    if (!columns.has(required)) errors.push(`${fileName}に必須列 "${required}" がありません。`);
  }
  if (dataRows.length === 0) errors.push(`${fileName}にデータ行がありません。`);
  dataRows.forEach((row, index) => {
    if (row.length !== header.length) errors.push(`${fileName} ${index + 2}行目: 列数がヘッダーと一致しません。`);
  });
  return { rows: dataRows, columns, errors };
}

export function cell(row: string[], columns: Map<string, number>, name: string): string {
  const index = columns.get(name);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

export function hashNormalizedRow(row: object): string {
  return createHash("sha256").update(stableJson(row), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseFiniteNonNegative(raw: string, label: string, errors: string[]): number | null {
  if (raw === "") {
    errors.push(`${label}が空です。`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push(`${label}が有限の数値ではありません("${raw}")。`);
    return null;
  }
  if (value < 0) {
    errors.push(`${label}に負値は指定できません("${raw}")。`);
    return null;
  }
  return value;
}

export function parseOptionalFiniteNonNegative(raw: string, label: string, errors: string[]): number | undefined {
  if (raw === "") return undefined;
  return parseFiniteNonNegative(raw, label, errors) ?? undefined;
}

export function requireText(raw: string, label: string, errors: string[]): string | null {
  if (raw !== "") return raw;
  errors.push(`${label}が空です。`);
  return null;
}
