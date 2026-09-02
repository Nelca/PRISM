"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { hasMaterialIssue } from "@/lib/pipeline/action-targets";

const ACTOR = "宮里";

export interface DepthOverrideFormState {
  error?: string;
  /**
   * C-02:切替が成功したことと、その結果どこで何が見られるようになったかを
   * 行内で返すための成功情報。`DepthToggle` がこれを見てインライン確認を出す。
   * 画面には文言だけを出し、この値(内部モード)自体は表示しない。
   */
  applied?: {
    mode: "promote" | "demote" | "auto";
    materialIssueId: string;
  };
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
  const tenantId = await getTenantId();
  if (!hasMaterialIssue(await getOrCreateLatestResult(tenantId), materialIssueId)) {
    return { error: "対象の課題が見つかりません。画面を更新してください。" };
  }

  const outcome = await tryRunAndPersist(tenantId, {
    label: `評価の深さの${label}への切替`,
    events: [
      {
        actor: ACTOR,
        kind: "depth_override",
        subjectId: materialIssueId,
        payload: { mode, logMessage: `評価対象「${materialIssueId}」の深度を${label}に変更` },
      },
    ],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  /**
   * revalidatePath はServer Function内で呼ぶと、同じレスポンスに
   * 「アクションの戻り値」と「再レンダリング済みのRSC Payload」の両方を載せる。
   * したがって、戻り値(下の applied)は再レンダリング後もそのまま useActionState の
   * state として残り、更新後の画面にインライン確認を出せる。
   * 参照: node_modules/next/dist/docs/01-app/02-guides/server-actions.md
   *      「A single response carries data and UI」
   */
  revalidatePath("/", "layout");
  return { applied: { mode, materialIssueId } };
}
