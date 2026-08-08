"use server";

import { revalidatePath } from "next/cache";
import { exchangeAmount } from "@core/types/common";
import type { BindingMechanism, CountermeasureType } from "@core/types/decision";
import {
  addActionLogEntry,
  getBindingMechanismState,
  setBindingMechanismState,
  setSelectedCountermeasureKey,
} from "@/lib/demo/interaction-store";

const REVALIDATE_PATHS = ["/", "/financial-bridge", "/decision", "/disclosure", "/ledger"];

const BINDING_LABELS: Record<BindingMechanism["kind"], string> = {
  weak_reference: "稟議書に参考値として記載する",
  npv_formula_replacement: "投資判断の計算式そのものに組み込む",
  budget_allocation: "拠点の予算に実際に反映する",
  procurement_contract_clause: "調達契約の更新条件に組み込む",
};

export interface SelectCountermeasureFormState {
  error?: string;
}

export async function selectCountermeasureAction(
  _prevState: SelectCountermeasureFormState,
  formData: FormData
): Promise<SelectCountermeasureFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  const key = String(formData.get("key") ?? "") as CountermeasureType;
  if (!siteId || !key) {
    return { error: "対策案を指定してください。" };
  }
  setSelectedCountermeasureKey(siteId, key);
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

export interface RecordDecisionFormState {
  error?: string;
}

export async function recordDecisionAction(
  _prevState: RecordDecisionFormState,
  formData: FormData
): Promise<RecordDecisionFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  const kind = String(formData.get("bindingKind") ?? "") as BindingMechanism["kind"];
  const reason = String(formData.get("reason") ?? "").trim();
  const budgetAmount = formData.get("budgetAmount");
  const clauseText = String(formData.get("clauseText") ?? "").trim();

  if (!siteId || !kind) {
    return { error: "反映先を選択してください。" };
  }

  let mechanism: BindingMechanism;
  if (kind === "budget_allocation") {
    const amount = Number(budgetAmount);
    if (Number.isNaN(amount)) {
      return { error: "予算反映額を数値で入力してください。" };
    }
    mechanism = { kind, targetSiteId: siteId, amount: exchangeAmount(amount) };
  } else if (kind === "procurement_contract_clause") {
    if (!clauseText) {
      return { error: "契約条項の内容を入力してください。" };
    }
    mechanism = { kind, clauseText };
  } else {
    mechanism = { kind };
  }

  const current = getBindingMechanismState(siteId);
  const previousMechanism = current?.mechanism ?? { kind: "weak_reference" };
  const mechanismChanged = JSON.stringify(previousMechanism) !== JSON.stringify(mechanism);

  if (mechanismChanged) {
    if (!reason) {
      return { error: "反映先を変更する場合は理由を入力してください。" };
    }
    setBindingMechanismState(siteId, {
      mechanism,
      history: [...(current?.history ?? []), { previousMechanism, reason, changedAt: new Date().toISOString() }],
    });
  } else if (!current) {
    setBindingMechanismState(siteId, { mechanism, history: [] });
  }

  addActionLogEntry("宮里", `対策の判定結果を「${BINDING_LABELS[kind]}」で選択・記録`);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
