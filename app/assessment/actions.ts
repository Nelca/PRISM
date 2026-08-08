"use server";

import { revalidatePath } from "next/cache";
import { addActionLogEntry, setDepthOverride } from "@/lib/demo/interaction-store";

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

  setDepthOverride(materialIssueId, mode);
  const label = mode === "promote" ? "詳細評価" : mode === "demote" ? "概算評価" : "自動判定";
  addActionLogEntry("宮里", `評価対象「${materialIssueId}」の深度を${label}に変更`);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
