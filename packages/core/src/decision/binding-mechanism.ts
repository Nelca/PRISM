/**
 * M6 D-6:拘束方式ごとの出力整形 + D-9:変更履歴の記録。
 * 参照元: docs/requirements/m6-decision-record.md §6・§9
 */

import type { ExchangeAmount } from "../types/common";
import type { BindingMechanism, BindingMechanismChangeEntry } from "../types/decision";

export type BindingMechanismOutput =
  | { kind: "weak_reference"; verdictLabel: string }
  | { kind: "npv_formula_replacement"; natureAdjustedNpv: ExchangeAmount }
  | { kind: "budget_allocation"; targetSiteId: string; amount: ExchangeAmount }
  | { kind: "procurement_contract_clause"; clauseText: string };

const VERDICT_LABELS: Record<"does_not_cross" | "crosses" | "pending", string> = {
  does_not_cross: "またがない(does_not_cross)",
  crosses: "またぐ(crosses)",
  pending: "未確定(pending)",
};

export interface BindingMechanismContext {
  verdict: "does_not_cross" | "crosses" | "pending";
  natureAdjustedNpvCentral: ExchangeAmount;
}

/** D-6の表(kind別に渡すもの)をそのまま実装する。「強」系もPRISM内で完結する出力に留め、外部連携は行わない。 */
export function formatBindingMechanismOutput(
  mechanism: BindingMechanism,
  context: BindingMechanismContext
): BindingMechanismOutput {
  switch (mechanism.kind) {
    case "weak_reference":
      return { kind: "weak_reference", verdictLabel: VERDICT_LABELS[context.verdict] };
    case "npv_formula_replacement":
      return { kind: "npv_formula_replacement", natureAdjustedNpv: context.natureAdjustedNpvCentral };
    case "budget_allocation":
      return { kind: "budget_allocation", targetSiteId: mechanism.targetSiteId, amount: mechanism.amount };
    case "procurement_contract_clause":
      return { kind: "procurement_contract_clause", clauseText: mechanism.clauseText };
  }
}

/**
 * D-9:拘束方式の変更にはデフォルト値を設けず、明示選択と変更理由の記録を必須とする。
 * changedAtは呼び出し側から渡す(この関数を時刻に依存しない純粋関数にするため)。
 */
export function appendBindingMechanismChange(
  history: BindingMechanismChangeEntry[],
  change: { changedAt: string; previousMechanism: BindingMechanism; newMechanism: BindingMechanism; reason: string }
): BindingMechanismChangeEntry[] {
  if (!change.reason.trim()) {
    throw new Error("M6 D-9: 拘束方式の変更理由(reason)は必須です。空文字列は許容しません。");
  }
  return [...history, change];
}
