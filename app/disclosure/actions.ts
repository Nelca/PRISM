"use server";

import { revalidatePath } from "next/cache";
import { getDefaultTenantId } from "@/lib/db/client";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const REVALIDATE_PATHS = ["/", "/sites", "/assessment", "/disclosure", "/ledger"];

const ACTOR = "宮里";

export interface DisclosureActionFormState {
  error?: string;
}

/** ①主張を弱める(M7 D-4)。 */
export async function weakenClaimAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const newText = String(formData.get("newText") ?? "").trim();
  if (!claimId || !newText) {
    return { error: "修正後の記載内容を入力してください。" };
  }

  const tenantId = getDefaultTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "disclosure_claim_override",
    subjectId: claimId,
    payload: { text: newText, logMessage: `記載内容を弱める表現に修正(claim: ${claimId})` },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/** ②根拠を追加取得する(深掘りへの導線)。M2の深度を手動昇格させる。 */
export async function acquireEvidenceAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) {
    return { error: "対象拠点を指定してください。" };
  }

  const tenantId = getDefaultTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "depth_override",
    subjectId: `${siteId}-mi-water`,
    payload: {
      mode: "promote",
      logMessage: `開示内容の確認への対応として、${siteId}の評価を詳細評価キューへ追加`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/** ③意図的判断として記録する(理由は必須。デフォルトを設けない。M7 D-4)。 */
export async function recordIntentionalDecisionAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!claimId || !reason) {
    return { error: "判断の理由を入力してください。" };
  }

  const tenantId = getDefaultTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "intentional_decision",
    subjectId: claimId,
    payload: { reason, logMessage: `判断の理由を記録(claim: ${claimId}):${reason}` },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
