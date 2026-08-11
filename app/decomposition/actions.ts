"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const ACTOR = "宮里";

const REVALIDATE_PATHS = ["/", "/valuation", "/decomposition", "/financial-bridge", "/decision", "/disclosure", "/ledger"];

export interface ChangeRepresentativeFormState {
  error?: string;
}

export async function changeRepresentativeRecordAction(
  _prevState: ChangeRepresentativeFormState,
  formData: FormData
): Promise<ChangeRepresentativeFormState> {
  const materialIssueId = String(formData.get("materialIssueId") ?? "");
  const recordId = String(formData.get("recordId") ?? "");
  const methodId = String(formData.get("methodId") ?? "");
  const valueConcept = String(formData.get("valueConcept") ?? "");
  const fromLabel = String(formData.get("fromLabel") ?? "");
  const toLabel = String(formData.get("toLabel") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!materialIssueId || !recordId || !methodId) {
    return { error: "対象のレコードを指定してください。" };
  }
  if (!reason) {
    return { error: "変更理由を入力してください。" };
  }

  const tenantId = await getTenantId();

  // 選択と変更理由を1つのイベントとして追記する。現在値と履歴が同じ1つの真実から出る(計画B-1)。
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "representative_selection",
    subjectId: materialIssueId,
    payload: {
      recordId,
      // core側は methodId と価値概念で代表値を受け取る(M4 §7.4)。
      methodId,
      valueConcept,
      fromLabel,
      toLabel,
      reason,
      logMessage: `代表値を「${toLabel}」に変更(理由:${reason})`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
