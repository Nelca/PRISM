"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { SITE_ROWS } from "@/lib/demo/company";
import { parseTargetCsv, planTargetImport } from "@/lib/environment/csv";
import { METRIC_BY_ID, TARGET_STATUS, evaluateTarget } from "@/lib/environment/metrics";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
export interface ImportState {
  errors?: string[]; savedCount?: number;
  preview?: { hash: string; rows: { line: number; operation: string; site: string; label: string; boundary: string; year: number; current: number | null; target: number | null; unit: string; direction: string; status: string; owner: string; dueDate: string; evidence: string; targetBasis: string; actionPlan: string; previous?: { current: number | null; target: number | null } }[] };
}
export async function importTargetsAction(form: FormData): Promise<ImportState> {
  const csv = String(form.get("csv") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 8 || reason.length > 2000) return { errors: ["取込理由を8〜2000文字で記入してください。"] };
  const parsed = parseTargetCsv(csv);
  if (parsed.errors.length) return { errors: parsed.errors };
  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const sites = [...SITE_ROWS, ...(await listSiteEntries(tenantId)).map((site) => site.row)];
  const siteIds = new Set(sites.map((site) => site.id));
  let plan;
  try { plan = planTargetImport(parsed.rows, state.environmentalTargets, siteIds, randomUUID, new Date().toISOString()); }
  catch (error) { return { errors: [(error as Error).message] }; }
  const sourceCsvTextHash = createHash("sha256").update(csv).digest("hex");
  const hash = createHash("sha256").update(JSON.stringify([csv, reason])).digest("hex");
  if (form.get("mode") !== "commit") return { preview: { hash, rows: plan.map(({ record, line, expectedRevision }) => ({ line, operation: expectedRevision ? "更新" : "新規", site: sites.find((site) => site.id === record.siteId)!.name, label: METRIC_BY_ID.get(record.metricId)!.label, boundary: record.boundary, year: record.reportingYear, current: record.current, target: record.target, unit: METRIC_BY_ID.get(record.metricId)!.unit, direction: record.direction === "at_most" ? "以下" : "以上", status: TARGET_STATUS[evaluateTarget(record)], owner: record.owner, dueDate: record.dueDate, evidence: record.evidence, targetBasis: record.targetBasis, actionPlan: record.actionPlan, previous: expectedRevision ? { current: state.environmentalTargets.get(record.id)!.current, target: state.environmentalTargets.get(record.id)!.target } : undefined })) } };
  if (form.get("previewHash") !== hash || form.get("confirmed") !== "on") return { errors: ["取込内容を再確認してください。"] };
  const result = await tryRunAndPersist(tenantId, {
    label: "環境指標の一括取込",
    userSites: (currentSites) => {
      const valid = new Set([...SITE_ROWS, ...currentSites.map((site) => site.row)].map((site) => site.id));
      if (plan.some(({ record }) => !valid.has(record.siteId))) throw new Error("拠点が変更されました。");
      return currentSites;
    },
    events: plan.map(({ record, expectedRevision, line }) => ({ actor: "宮里", kind: "environmental_target_update", subjectId: record.id, payload: { record, expectedRevision, reason, sourceCsvTextHash, sourceLine: line, logMessage: `環境指標CSV ${line}行目を${expectedRevision ? "更新" : "登録"}。理由: ${reason}` } })),
  });
  if (!result.ok) return { errors: [result.message + " 最新の編集用CSVを取得し直してください。"] };
  revalidatePath("/", "layout");
  return { savedCount: plan.length };
}
