"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { hasValuationSelection } from "@/lib/pipeline/action-targets";

const ACTOR = "宮里";

const REVALIDATE_PATHS = ["/", "/valuation", "/financial-bridge", "/decision", "/disclosure", "/ledger"];

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
  if (reason.length < 8) {
    return { error: "変更理由が短すぎます。監査証跡として第三者が選択の根拠を理解できるように記入してください(8文字以上)。" };
  }

  const tenantId = await getTenantId();
  if (!hasValuationSelection(await getOrCreateLatestResult(tenantId), materialIssueId, recordId, methodId)) {
    return { error: "対象の算定結果が見つかりません。画面を更新してから選び直してください。" };
  }

  // 選択と変更理由を1つのイベントとして追記する。現在値と履歴が同じ1つの真実から出る(計画B-1)。
  // **先に変更後の状態で計算を試し、成功したときだけ追記する**(第4版 D-01-2)。
  const outcome = await tryRunAndPersist(tenantId, {
    label: "代表値の変更",
    events: [
      {
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
      },
    ],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
