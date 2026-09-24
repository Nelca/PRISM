"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { SITE_ROWS } from "@/lib/demo/company";
import { parseTargetForm } from "@/lib/environment/validation";
import { applyTargetUpdate } from "@/lib/environment/projection";
import { METRIC_BY_ID, type EnvironmentalTarget } from "@/lib/environment/metrics";

export interface TargetFormState { error?: string; savedId?: string; }
export async function saveTargetAction(_state: TargetFormState, form: FormData): Promise<TargetFormState> {
  const parsed = parseTargetForm(form);
  if ("error" in parsed) return parsed;
  const id = String(form.get("targetId") ?? "").trim() || `target-${randomUUID()}`;
  const expectedRevision = String(form.get("revision") ?? "").trim() || null;
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 8 || reason.length > 2000) return { error: "登録・変更理由を8〜2000文字で記入してください。" };
  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const existing = state.environmentalTargets.get(id);
  if (expectedRevision && !existing) return { error: "対象が見つかりません。画面を再読込してください。" };
  if (existing && (existing.siteId !== parsed.siteId || existing.metricId !== parsed.metricId || existing.reportingYear !== parsed.reportingYear || existing.boundary !== parsed.boundary)) {
    return { error: "拠点・指標・対象年・測定範囲は変更できません。別の対象として登録してください。" };
  }
  const sourceId = String(form.get("sourceTargetId") ?? "");
  const source = sourceId ? state.environmentalTargets.get(sourceId) : undefined;
  if (sourceId && (!source || source.archived || existing || source.revision !== form.get("sourceRevision") || parsed.reportingYear <= source.reportingYear || parsed.siteId !== source.siteId || parsed.metricId !== source.metricId || parsed.boundary !== source.boundary)) return { error: "引継ぎ元が更新されたか、対象年が正しくありません。元の指標から引き継ぎをやり直してください。" };
  const record: EnvironmentalTarget = { ...existing, ...parsed, ...(source ? { carriedFrom: { id: source.id, revision: source.revision, year: source.reportingYear } } : {}), id, revision: randomUUID(), updatedAt: new Date().toISOString() };
  try { applyTargetUpdate(state.environmentalTargets, record, expectedRevision); }
  catch (error) { return { error: error instanceof Error ? error.message : "登録内容を確認してください。" }; }
  const outcome = await tryRunAndPersist(tenantId, {
    label: "環境指標の保存",
    userSites: (sites) => {
      if (!(existing && record.archived) && ![...SITE_ROWS, ...sites.map((site) => site.row)].some((site) => site.id === record.siteId)) throw new Error("対象拠点が存在しません。");
      return sites;
    },
    events: [{ actor: "宮里", kind: "environmental_target_update", subjectId: id, payload: { record, expectedRevision, reason, logMessage: `${METRIC_BY_ID.get(record.metricId)!.label}（${record.reportingYear}年・${record.boundary}）を${record.archived ? "保管" : existing ? "更新" : "登録"}。理由: ${reason}` } }],
  });
  if (!outcome.ok) return { error: outcome.message + " 他の担当者が更新した場合は画面を再読込してください。" };
  revalidatePath("/", "layout");
  return { savedId: id };
}
