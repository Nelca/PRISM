import { parseCsvStrict } from "@/lib/intake/prtr/csv";
import { DIRECTION_LABEL, METRICS, METRIC_BY_ID, changesTargetIdentity, type EnvironmentalTarget, type TargetValues } from "./metrics";
import { parseTargetForm } from "./validation";
import { applyTargetUpdate } from "./projection";

export const TARGET_CSV_MAX_BYTES = 1_000_000;
export const TARGET_CSV_MAX_ROWS = 200;

/** 編集用CSVの列。日本語の列名・順序が一致しないCSVは受け付けない。 */
const TARGET_CSV_COLUMNS = [
  ["targetId", "管理ID"],
  ["revision", "版"],
  ["siteId", "拠点ID"],
  ["metric", "指標"],
  ["unit", "単位"],
  ["reportingYear", "対象年"],
  ["boundary", "測定範囲"],
  ["current", "実測値"],
  ["target", "目標値"],
  ["direction", "達成条件"],
  ["baseline", "比較基準値"],
  ["measuredOn", "確認日"],
  ["evidence", "実測根拠"],
  ["targetBasis", "目標根拠"],
  ["owner", "担当"],
  ["dueDate", "対応期限"],
  ["actionPlan", "次の対応"],
] as const;

export interface TargetImportRow {
  line: number;
  targetId: string;
  expectedRevision: string | null;
  value: TargetValues;
}
export interface TargetImportPlan {
  record: EnvironmentalTarget;
  expectedRevision: string | null;
  line: number;
}

const FORMULA_PREFIX = /^\s*[=+@'-]|^[\t\r\n]/;

/**
 * CSVの1セル。表計算ソフトで数式として解釈される先頭文字には ' を付ける。
 * 先頭の ' 自体もエスケープするため、`decodeCsvCell` で元の文字列へ可逆に戻せる。
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function decodeCsvCell(text: string): string {
  return text.startsWith("'") && FORMULA_PREFIX.test(text.slice(1)) ? text.slice(1) : text;
}

/** Excelで文字化けしないようBOM付き・CRLFで出力する。 */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function editableTargetCsv(records: EnvironmentalTarget[]): string {
  const rows = records.map((record) => {
    const metric = METRIC_BY_ID.get(record.metricId)!;
    const cells: Record<(typeof TARGET_CSV_COLUMNS)[number][0], unknown> = {
      ...record,
      targetId: record.id,
      metric: metric.label,
      unit: metric.unit,
      direction: DIRECTION_LABEL[record.direction],
    };
    return TARGET_CSV_COLUMNS.map(([key]) => cells[key]);
  });
  return toCsv([TARGET_CSV_COLUMNS.map(([, label]) => label), ...rows]);
}

function directionFromLabel(label: string): string {
  return Object.entries(DIRECTION_LABEL).find(([, value]) => value === label)?.[0] ?? "";
}

/** 1行でも不正があれば、どの行も取り込まない(行番号付きのエラーだけを返す)。 */
export function parseTargetCsv(text: string): { rows: TargetImportRow[]; errors: string[] } {
  if (new TextEncoder().encode(text).length > TARGET_CSV_MAX_BYTES) return { rows: [], errors: ["CSVは1MB以内にしてください。"] };
  const parsed = parseCsvStrict(text.replace(/^﻿/, ""), "CSV");
  const errors = [...parsed.errors];
  const [header, ...data] = parsed.rows;
  const headerMatches =
    header?.fields.length === TARGET_CSV_COLUMNS.length &&
    TARGET_CSV_COLUMNS.every(([, label], index) => header.fields[index] === label);
  if (!headerMatches) return { rows: [], errors: ["列名と順序が一致しません。この画面の編集用CSVを利用してください。"] };
  if (!data.length || data.length > TARGET_CSV_MAX_ROWS) errors.push(`CSVのデータ行は1〜${TARGET_CSV_MAX_ROWS}件にしてください。`);

  const rows: TargetImportRow[] = [];
  for (const row of data.slice(0, TARGET_CSV_MAX_ROWS)) {
    const at = `${row.lineNumber}行目`;
    if (row.fields.length !== TARGET_CSV_COLUMNS.length) {
      errors.push(`${at}: 列数が一致しません。`);
      continue;
    }
    const fields = Object.fromEntries(TARGET_CSV_COLUMNS.map(([key], index) => [key, decodeCsvCell(row.fields[index])]));
    const metric = METRICS.find((item) => item.label === fields.metric);
    if (!metric || fields.unit !== metric.unit) {
      errors.push(`${at}: 指標名または単位が一致しません。単位の自動換算は行いません。`);
      continue;
    }
    // 画面のフォームと同じ検証を通すため、FormDataに詰め替える。
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("metricId", metric.id);
    form.set("direction", directionFromLabel(fields.direction));
    const value = parseTargetForm(form);
    if ("error" in value) {
      errors.push(`${at}: ${value.error}`);
      continue;
    }
    const targetId = fields.targetId.trim();
    const expectedRevision = fields.revision.trim() || null;
    if (Boolean(targetId) !== Boolean(expectedRevision)) {
      errors.push(`${at}: 更新には管理IDと版の両方が必要です。新規登録は両方を空欄にしてください。`);
      continue;
    }
    rows.push({ line: row.lineNumber, targetId, expectedRevision, value });
  }
  return { rows: errors.length ? [] : rows, errors };
}

/**
 * 取込行を現在値へ順に適用した結果を作る(DBには書かない)。
 * 拠点不明・保管中・同一性の変更・重複・古い版があれば、行番号付きで例外にする。
 */
export function planTargetImport(
  rows: TargetImportRow[],
  current: Map<string, EnvironmentalTarget>,
  siteIds: Set<string>,
  makeId: () => string,
  now: string
): TargetImportPlan[] {
  const projected = new Map(current);
  const seen = new Set<string>();
  return rows.map((row) => {
    const at = `${row.line}行目`;
    const existing = row.targetId ? current.get(row.targetId) : undefined;
    if (!siteIds.has(row.value.siteId)) throw new Error(`${at}: 拠点IDが見つかりません。`);
    if (row.targetId && (!existing || existing.archived)) throw new Error(`${at}: 更新対象が存在しないか、保管中です。`);
    if (existing && changesTargetIdentity(existing, row.value)) {
      throw new Error(`${at}: 拠点・指標・対象年・測定範囲は変更できません。新規登録として追加してください。`);
    }
    const id = row.targetId || `target-${makeId()}`;
    if (seen.has(id)) throw new Error(`${at}: 同じ管理IDを複数行で更新できません。`);
    seen.add(id);
    // 費用前提・開示文案・引継ぎ元はCSVで変更しない。物理値が変われば指紋で再確認待ちになる。
    const record: EnvironmentalTarget = { ...existing, ...row.value, id, revision: makeId(), updatedAt: now };
    try {
      applyTargetUpdate(projected, record, row.expectedRevision);
    } catch (error) {
      throw new Error(`${at}: ${(error as Error).message}`);
    }
    return { record, expectedRevision: row.expectedRevision, line: row.line };
  });
}
