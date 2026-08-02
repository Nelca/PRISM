/**
 * M7 D-4:③意図的判断として記録する場合のIntentionalDecisionRecord組み立て。
 * 参照元: docs/requirements/m7-disclosure-verification.md §4
 *
 * 理由の入力を必須とする(デフォルトなし)。M6 D-9のappendBindingMechanismChangeと同じ検証パターン。
 */

import type { IntentionalDecisionRecord } from "../types/disclosure";

export function buildIntentionalDecisionRecord(
  gapFindingId: string,
  reason: string,
  recordedBy: string,
  recordedAt: string
): IntentionalDecisionRecord {
  if (!reason.trim()) {
    throw new Error("M7 D-4: 意図的判断として記録する場合、理由(reason)の入力は必須です。");
  }

  return { gapFindingId, reason, recordedAt, recordedBy };
}
