"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { allSiteRows } from "@/lib/demo/company";
import { parseTargetForm } from "@/lib/environment/validation";
import { applyTargetUpdate } from "@/lib/environment/projection";
import { METRIC_BY_ID, changesTargetIdentity, type EnvironmentalTarget, type TargetValues } from "@/lib/environment/metrics";
import { ACTOR, parseReason } from "./action-support";

export interface TargetFormState {
  error?: string;
  savedId?: string;
}

/** 翌年への引継ぎ元として使えるか(同じ拠点・指標・範囲で、より後の年度の新規登録に限る)。 */
function validCarrySource(source: EnvironmentalTarget | undefined, sourceRevision: string, next: TargetValues, isNew: boolean): boolean {
  return (
    source !== undefined &&
    isNew &&
    !source.archived &&
    source.revision === sourceRevision &&
    next.reportingYear > source.reportingYear &&
    next.siteId === source.siteId &&
    next.metricId === source.metricId &&
    next.boundary === source.boundary
  );
}

export async function saveTargetAction(_state: TargetFormState, form: FormData): Promise<TargetFormState> {
  const parsed = parseTargetForm(form);
  if ("error" in parsed) return parsed;
  const reason = parseReason(form, "登録・変更理由");
  if ("error" in reason) return reason;

  const id = String(form.get("targetId") ?? "").trim() || `target-${randomUUID()}`;
  const expectedRevision = String(form.get("revision") ?? "").trim() || null;
  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const existing = state.environmentalTargets.get(id);
  if (expectedRevision && !existing) return { error: "対象が見つかりません。画面を再読込してください。" };
  if (existing && changesTargetIdentity(existing, parsed)) {
    return { error: "拠点・指標・対象年・測定範囲は変更できません。別の対象として登録してください。" };
  }

  const sourceId = String(form.get("sourceTargetId") ?? "");
  const source = sourceId ? state.environmentalTargets.get(sourceId) : undefined;
  if (sourceId && !validCarrySource(source, String(form.get("sourceRevision") ?? ""), parsed, !existing)) {
    return { error: "引継ぎ元が更新されたか、対象年が正しくありません。元の指標から引き継ぎをやり直してください。" };
  }

  const record: EnvironmentalTarget = {
    ...existing,
    ...parsed,
    ...(source ? { carriedFrom: { id: source.id, revision: source.revision, year: source.reportingYear } } : {}),
    id,
    revision: randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  // 利用者に具体的な理由を返すための事前確認。確定の検証は下のトランザクション内で再生して行う。
  try {
    applyTargetUpdate(state.environmentalTargets, record, expectedRevision);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "登録内容を確認してください。" };
  }

  const operation = record.archived ? "保管" : existing ? "更新" : "登録";
  const metric = METRIC_BY_ID.get(record.metricId)!;
  const outcome = await tryRunAndPersist(tenantId, {
    label: "環境指標の保存",
    userSites: (sites) => {
      // 拠点を削除した後でも、既存の指標を保管することはできる。
      const archivingExisting = existing !== undefined && record.archived;
      if (!archivingExisting && !allSiteRows(sites).some((site) => site.id === record.siteId)) {
        throw new Error("対象拠点が存在しません。");
      }
      return sites;
    },
    events: [
      {
        actor: ACTOR,
        kind: "environmental_target_update",
        subjectId: id,
        payload: {
          record,
          expectedRevision,
          reason: reason.value,
          logMessage: `${metric.label}（${record.reportingYear}年・${record.boundary}）を${operation}。理由: ${reason.value}`,
        },
      },
    ],
  });
  if (!outcome.ok) return { error: `${outcome.message} 他の担当者が更新した場合は画面を再読込してください。` };

  revalidatePath("/", "layout");
  return { savedId: id };
}
