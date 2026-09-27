"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { allSiteRows } from "@/lib/demo/company";
import { parseTargetCsv, planTargetImport, type TargetImportPlan } from "@/lib/environment/csv";
import { DIRECTION_LABEL, METRIC_BY_ID, TARGET_STATUS, evaluateTarget, type EnvironmentalTarget } from "@/lib/environment/metrics";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { ACTOR, listAllSiteRows, parseReason } from "../action-support";

export interface ImportPreviewRow {
  line: number;
  operation: "新規" | "更新";
  site: string;
  label: string;
  boundary: string;
  year: number;
  current: number | null;
  target: number | null;
  unit: string;
  direction: string;
  status: string;
  owner: string;
  dueDate: string;
  evidence: string;
  targetBasis: string;
  actionPlan: string;
  previous?: { current: number | null; target: number | null };
}

export interface ImportState {
  errors?: string[];
  savedCount?: number;
  preview?: { hash: string; rows: ImportPreviewRow[] };
}

function previewRow({ record, line, expectedRevision }: TargetImportPlan, siteName: string, previous: EnvironmentalTarget | undefined): ImportPreviewRow {
  const metric = METRIC_BY_ID.get(record.metricId)!;
  return {
    line,
    operation: expectedRevision ? "更新" : "新規",
    site: siteName,
    label: metric.label,
    boundary: record.boundary,
    year: record.reportingYear,
    current: record.current,
    target: record.target,
    unit: metric.unit,
    direction: DIRECTION_LABEL[record.direction],
    status: TARGET_STATUS[evaluateTarget(record)],
    owner: record.owner,
    dueDate: record.dueDate,
    evidence: record.evidence,
    targetBasis: record.targetBasis,
    actionPlan: record.actionPlan,
    previous: previous && { current: previous.current, target: previous.target },
  };
}

/**
 * 1回目(mode≠commit)は検証とプレビューだけを返し、DBに書かない。
 * 2回目は同じCSV・理由であることをハッシュで確かめ、テナントのロック下で全件を検証し直してから保存する。
 */
export async function importTargetsAction(form: FormData): Promise<ImportState> {
  const csv = String(form.get("csv") ?? "");
  const reason = parseReason(form, "取込理由");
  if ("error" in reason) return { errors: [reason.error] };
  const parsed = parseTargetCsv(csv);
  if (parsed.errors.length) return { errors: parsed.errors };

  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const sites = await listAllSiteRows(tenantId);
  let plan: TargetImportPlan[];
  try {
    plan = planTargetImport(parsed.rows, state.environmentalTargets, new Set(sites.map((site) => site.id)), randomUUID, new Date().toISOString());
  } catch (error) {
    return { errors: [(error as Error).message] };
  }

  const hash = createHash("sha256").update(JSON.stringify([csv, reason.value])).digest("hex");
  if (form.get("mode") !== "commit") {
    const siteName = (siteId: string) => sites.find((site) => site.id === siteId)!.name;
    const rows = plan.map((entry) =>
      previewRow(entry, siteName(entry.record.siteId), entry.expectedRevision ? state.environmentalTargets.get(entry.record.id) : undefined)
    );
    return { preview: { hash, rows } };
  }
  if (form.get("previewHash") !== hash || form.get("confirmed") !== "on") return { errors: ["取込内容を再確認してください。"] };

  // 原本ファイルは保存せず、検証したCSVテキストのハッシュと行番号を監査用に残す。
  const sourceCsvTextHash = createHash("sha256").update(csv).digest("hex");
  const outcome = await tryRunAndPersist(tenantId, {
    label: "環境指標の一括取込",
    userSites: (currentSites) => {
      const valid = new Set(allSiteRows(currentSites).map((site) => site.id));
      if (plan.some(({ record }) => !valid.has(record.siteId))) throw new Error("拠点が変更されました。");
      return currentSites;
    },
    events: plan.map(({ record, expectedRevision, line }) => ({
      actor: ACTOR,
      kind: "environmental_target_update" as const,
      subjectId: record.id,
      payload: {
        record,
        expectedRevision,
        reason: reason.value,
        sourceCsvTextHash,
        sourceLine: line,
        logMessage: `環境指標CSV ${line}行目を${expectedRevision ? "更新" : "登録"}。理由: ${reason.value}`,
      },
    })),
  });
  if (!outcome.ok) return { errors: [`${outcome.message} 最新の編集用CSVを取得し直してください。`] };

  revalidatePath("/", "layout");
  return { savedCount: plan.length };
}
