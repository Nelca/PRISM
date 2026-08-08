"use server";

import { revalidatePath } from "next/cache";
import { addActionLogEntry, setDepthOverride, setDisclosureClaimOverrideText, setIntentionalDecision } from "@/lib/demo/interaction-store";

const REVALIDATE_PATHS = ["/", "/sites", "/assessment", "/disclosure", "/ledger"];

export interface DisclosureActionFormState {
  error?: string;
}

export async function weakenClaimAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const newText = String(formData.get("newText") ?? "").trim();
  if (!claimId || !newText) {
    return { error: "修正後の記載内容を入力してください。" };
  }
  setDisclosureClaimOverrideText(claimId, newText);
  addActionLogEntry("宮里", `記載内容を弱める表現に修正(claim: ${claimId})`);
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

export async function acquireEvidenceAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) {
    return { error: "対象拠点を指定してください。" };
  }
  setDepthOverride(`${siteId}-mi-water`, "promote");
  addActionLogEntry("宮里", `開示内容の確認への対応として、${siteId}の評価を詳細評価キューへ追加`);
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

export async function recordIntentionalDecisionAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!claimId || !reason) {
    return { error: "判断の理由を入力してください。" };
  }
  setIntentionalDecision(claimId, reason, new Date().toISOString());
  addActionLogEntry("宮里", `判断の理由を記録(claim: ${claimId}):${reason}`);
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
