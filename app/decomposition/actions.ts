"use server";

import { revalidatePath } from "next/cache";
import { addActionLogEntry, setM4ChangeLog, setRepresentativeRecordId } from "@/lib/demo/interaction-store";

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
  const fromLabel = String(formData.get("fromLabel") ?? "");
  const toLabel = String(formData.get("toLabel") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!materialIssueId || !recordId) {
    return { error: "対象のレコードを指定してください。" };
  }
  if (!reason) {
    return { error: "変更理由を入力してください。" };
  }

  setRepresentativeRecordId(materialIssueId, recordId);
  setM4ChangeLog(materialIssueId, { from: fromLabel, to: toLabel, reason });
  addActionLogEntry("宮里", `代表値を「${toLabel}」に変更(理由:${reason})`);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
