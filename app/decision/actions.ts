"use server";

import { revalidatePath } from "next/cache";
import { exchangeAmount } from "@core/types/common";
import type { BindingMechanism, CountermeasureType } from "@core/types/decision";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";

const REVALIDATE_PATHS = ["/", "/financial-bridge", "/decision", "/disclosure", "/ledger"];

const ACTOR = "宮里";

const BINDING_LABELS: Record<BindingMechanism["kind"], string> = {
  weak_reference: "稟議書に参考値として記載する",
  npv_formula_replacement: "投資判断の計算式そのものに組み込む",
  budget_allocation: "拠点の予算に実際に反映する",
  procurement_contract_clause: "調達契約の更新条件に組み込む",
};

export interface DecisionParametersFormState {
  error?: string;
  saved?: boolean;
}

/**
 * 決定単位の入力(M6 D-4・D-10)。通常NPV・割引率・期間・承認閾値。
 *
 * **承認閾値は空欄のまま保存できる。**その場合★判定は `pending` のままで、
 * 判定件数にも計上されない(D-45)。業界標準値で仮置きしない —— 仮の判定を
 * 実際の判断材料として誤用されるリスクがあるため(M6 D-10のC案却下理由)。
 */
export async function saveDecisionParametersAction(
  _prevState: DecisionParametersFormState,
  formData: FormData
): Promise<DecisionParametersFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) {
    return { error: "対象拠点を指定してください。" };
  }

  const required: { name: string; label: string }[] = [
    { name: "baselineNpvValue", label: "投資価値(NPV)" },
    { name: "discountRate", label: "割引率" },
    { name: "horizon", label: "評価期間" },
  ];

  const values: Record<string, number> = {};
  for (const field of required) {
    const raw = String(formData.get(field.name) ?? "").trim();
    if (raw === "") {
      return { error: `${field.label}を入力してください。` };
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return { error: `${field.label}は数値で入力してください。` };
    }
    values[field.name] = value;
  }

  // 承認閾値だけは空欄を許す(段階的開示。未入力は "pending" として扱う)
  const thresholdRaw = String(formData.get("approvalThresholdValue") ?? "").trim();
  let approvalThresholdValue: number | null = null;
  if (thresholdRaw !== "") {
    const parsed = Number(thresholdRaw);
    if (Number.isNaN(parsed)) {
      return { error: "投資の承認ラインは数値で入力してください(未定の場合は空欄のままにしてください)。" };
    }
    approvalThresholdValue = parsed;
  }

  const tenantId = await getTenantId();
  const outcome = await tryRunAndPersist(tenantId, {
    label: "投資判断の前提の入力",
    events: [
      {
        actor: ACTOR,
        kind: "decision_parameters",
        subjectId: siteId,
        payload: {
          parameters: {
            baselineNpvValue: values.baselineNpvValue,
            discountRate: values.discountRate,
            horizon: values.horizon,
            approvalThresholdValue,
          },
          logMessage:
            approvalThresholdValue === null
              ? `${siteId}の投資判断の前提を更新(承認ラインは未入力のため判定は保留)`
              : `${siteId}の投資判断の前提と承認ラインを更新`,
        },
      },
    ],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { saved: true };
}

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
  const tenantId = await getTenantId();
  const outcome = await tryRunAndPersist(tenantId, {
    label: "対策案の選択",
    events: [{ actor: ACTOR, kind: "countermeasure_selection", subjectId: siteId, payload: { key } }],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

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

  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const current = state.bindingMechanismState.get(siteId);
  const previousMechanism = current?.mechanism ?? { kind: "weak_reference" };
  const mechanismChanged = JSON.stringify(previousMechanism) !== JSON.stringify(mechanism);

  // 変更時は理由を必須にする(M6 D-9:デフォルト値を設けず、明示選択と変更履歴の記録を必須とする)。
  if (mechanismChanged && !reason) {
    return { error: "反映先を変更する場合は理由を入力してください。" };
  }
  if (mechanismChanged && reason.length < 8) {
    return { error: "変更理由が短すぎます。監査証跡として第三者が選択の根拠を理解できるように記入してください(8文字以上)。" };
  }

  if (mechanismChanged || !current) {
    const outcome = await tryRunAndPersist(tenantId, {
      label: "反映先の記録",
      events: [
        {
          actor: ACTOR,
          kind: "binding_mechanism_change",
          subjectId: siteId,
          payload: { mechanism, reason, logMessage: `対策の判定結果を「${BINDING_LABELS[kind]}」で選択・記録` },
        },
      ],
    });
    if (!outcome.ok) {
      return { error: outcome.message };
    }
  }

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
