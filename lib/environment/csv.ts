import { parseCsvStrict } from "@/lib/intake/prtr/csv";
import { METRICS, METRIC_BY_ID, type EnvironmentalTarget } from "./metrics";
import { parseTargetForm } from "./validation";
import { applyTargetUpdate } from "./projection";

export const TARGET_CSV_MAX_BYTES = 1_000_000;
export const TARGET_CSV_MAX_ROWS = 200;
export const TARGET_CSV_COLUMNS = [
  ["targetId", "管理ID"], ["revision", "版"], ["siteId", "拠点ID"], ["metric", "指標"], ["unit", "単位"],
  ["reportingYear", "対象年"], ["boundary", "測定範囲"], ["current", "実測値"], ["target", "目標値"],
  ["direction", "達成条件"], ["baseline", "比較基準値"], ["measuredOn", "確認日"], ["evidence", "実測根拠"],
  ["targetBasis", "目標根拠"], ["owner", "担当"], ["dueDate", "対応期限"], ["actionPlan", "次の対応"],
] as const;
export type TargetValues = Omit<EnvironmentalTarget, "id" | "revision" | "updatedAt" | "costCase" | "disclosureNote" | "carriedFrom">;
export interface TargetImportRow { line: number; targetId: string; expectedRevision: string | null; value: TargetValues; }
export interface TargetImportPlan { record: EnvironmentalTarget; expectedRevision: string | null; line: number; }

// 一覧共有用と編集用では列が異なる。編集用では先頭の'もエスケープして可逆にする。
function encode(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@'-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function decode(text: string): string {
  return /^'[\s]*[=+@'-]/.test(text) || /^'[\t\r\n]/.test(text) ? text.slice(1) : text;
}
export function editableTargetCsv(records: EnvironmentalTarget[]): string {
  const rows = records.map((record) => ({
    ...record, targetId: record.id, metric: METRIC_BY_ID.get(record.metricId)!.label,
    unit: METRIC_BY_ID.get(record.metricId)!.unit, direction: record.direction === "at_most" ? "以下" : "以上",
  }));
  return "\uFEFF" + [TARGET_CSV_COLUMNS.map(([, label]) => label).map(encode).join(","), ...rows.map((row) => TARGET_CSV_COLUMNS.map(([key]) => encode(row[key])).join(","))].join("\r\n");
}
export function parseTargetCsv(text: string): { rows: TargetImportRow[]; errors: string[] } {
  if (new TextEncoder().encode(text).length > TARGET_CSV_MAX_BYTES) return { rows: [], errors: ["CSVは1MB以内にしてください。"] };
  const parsed = parseCsvStrict(text.replace(/^\uFEFF/, ""), "CSV");
  const errors = [...parsed.errors];
  const [header, ...data] = parsed.rows;
  if (!header || header.fields.length !== TARGET_CSV_COLUMNS.length || TARGET_CSV_COLUMNS.some(([, label], index) => header.fields[index] !== label)) {
    return { rows: [], errors: ["列名と順序が一致しません。この画面の編集用CSVを利用してください。"] };
  }
  if (!data.length || data.length > TARGET_CSV_MAX_ROWS) errors.push("CSVのデータ行は1〜200件にしてください。");
  const rows: TargetImportRow[] = [];
  for (const row of data.slice(0, TARGET_CSV_MAX_ROWS)) {
    if (row.fields.length !== TARGET_CSV_COLUMNS.length) { errors.push(`${row.lineNumber}行目: 列数が一致しません。`); continue; }
    const fields = Object.fromEntries(TARGET_CSV_COLUMNS.map(([key], index) => [key, decode(row.fields[index])]));
    const metric = METRICS.find((item) => item.label === fields.metric);
    if (!metric || fields.unit !== metric.unit) { errors.push(`${row.lineNumber}行目: 指標名または単位が一致しません。単位の自動換算は行いません。`); continue; }
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("metricId", metric.id);
    form.set("direction", fields.direction === "以下" ? "at_most" : fields.direction === "以上" ? "at_least" : "");
    const value = parseTargetForm(form);
    if ("error" in value) { errors.push(`${row.lineNumber}行目: ${value.error}`); continue; }
    const targetId = fields.targetId.trim();
    const expectedRevision = fields.revision.trim() || null;
    if (Boolean(targetId) !== Boolean(expectedRevision)) { errors.push(`${row.lineNumber}行目: 更新には管理IDと版の両方が必要です。新規登録は両方を空欄にしてください。`); continue; }
    rows.push({ line: row.lineNumber, targetId, expectedRevision, value });
  }
  return { rows: errors.length ? [] : rows, errors };
}
export function planTargetImport(rows: TargetImportRow[], current: Map<string, EnvironmentalTarget>, siteIds: Set<string>, makeId: () => string, now: string): TargetImportPlan[] {
  const projected = new Map(current);
  const seen = new Set<string>();
  return rows.map((row) => {
    const existing = row.targetId ? current.get(row.targetId) : undefined;
    if (!siteIds.has(row.value.siteId)) throw new Error(`${row.line}行目: 拠点IDが見つかりません。`);
    if (row.targetId && (!existing || existing.archived)) throw new Error(`${row.line}行目: 更新対象が存在しないか、保管中です。`);
    if (existing && (existing.siteId !== row.value.siteId || existing.metricId !== row.value.metricId || existing.reportingYear !== row.value.reportingYear || existing.boundary !== row.value.boundary)) throw new Error(`${row.line}行目: 拠点・指標・対象年・測定範囲は変更できません。新規登録として追加してください。`);
    const id = row.targetId || `target-${makeId()}`;
    if (seen.has(id)) throw new Error(`${row.line}行目: 同じ管理IDを複数行で更新できません。`);
    seen.add(id);
    const record = { ...existing, ...row.value, id, revision: makeId(), updatedAt: now };
    try { applyTargetUpdate(projected, record, row.expectedRevision); }
    catch (error) { throw new Error(`${row.line}行目: ${(error as Error).message}`); }
    return { record, expectedRevision: row.expectedRevision, line: row.line };
  });
}
