"use server";

import { revalidatePath } from "next/cache";
import { getDefaultTenantId } from "@/lib/db/client";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const ACTOR = "宮里";

const REVALIDATE_PATHS = ["/", "/sites", "/assessment", "/valuation", "/decomposition", "/financial-bridge", "/decision", "/disclosure", "/ledger"];

export interface DepthOverrideFormState {
  error?: string;
}

export async function setDepthOverrideAction(
  _prevState: DepthOverrideFormState,
  formData: FormData
): Promise<DepthOverrideFormState> {
  const materialIssueId = String(formData.get("materialIssueId") ?? "");
  const mode = String(formData.get("mode") ?? "");

  if (!materialIssueId) {
    return { error: "対象の課題を指定してください。" };
  }
  if (mode !== "promote" && mode !== "demote" && mode !== "auto") {
    return { error: "評価深度を指定してください。" };
  }

  const label = mode === "promote" ? "詳細評価" : mode === "demote" ? "概算評価" : "自動判定";
  const tenantId = getDefaultTenantId();

  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "depth_override",
    subjectId: materialIssueId,
    payload: { mode, logMessage: `評価対象「${materialIssueId}」の深度を${label}に変更` },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
