"use server";

import { revalidatePath } from "next/cache";
import { exchangeAmount } from "@core/types/common";
import type { BindingMechanism, CountermeasureType } from "@core/types/decision";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { parseOptionalNumber, parseRequiredNumber } from "@/lib/forms/number";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { hasDecisionSite } from "@/lib/pipeline/action-targets";

const ACTOR = "宮里";

const BINDING_LABELS: Record<BindingMechanism["kind"], string> = {
  weak_reference: "稟議書に参考値として記載する",
  npv_formula_replacement: "投資判断の計算式そのものに組み込む",
  budget_allocation: "拠点の予算に実際に反映する",
  procurement_contract_clause: "調達契約の更新条件に組み込む",
};
const COUNTERMEASURE_TYPES: CountermeasureType[] = ["reduction", "transfer", "avoidance", "acceptance"];

function isBindingKind(value: string): value is BindingMechanism["kind"] {
  return Object.hasOwn(BINDING_LABELS, value);
}

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
    const parsed = parseRequiredNumber(formData.get(field.name), {
      label: field.label,
      ...(field.name === "horizon" ? { integer: true, min: 1 } : {}),
    });
    if ("error" in parsed) return parsed;
    values[field.name] = parsed.value;
  }

  // 承認閾値だけは空欄を許す(段階的開示。未入力は "pending" として扱う)
  const threshold = parseOptionalNumber(formData.get("approvalThresholdValue"), { label: "投資の承認ライン" });
  if ("error" in threshold) return threshold;
  const approvalThresholdValue = threshold.value;

  const tenantId = await getTenantId();
  if (!hasDecisionSite(await getOrCreateLatestResult(tenantId), siteId)) return { error: "対象拠点が見つかりません。" };
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

  revalidatePath("/", "layout");
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
  const key = String(formData.get("key") ?? "");
  if (!siteId || !COUNTERMEASURE_TYPES.includes(key as CountermeasureType)) {
    return { error: "対策案を指定してください。" };
  }
  const tenantId = await getTenantId();
  if (!hasDecisionSite(await getOrCreateLatestResult(tenantId), siteId)) return { error: "対象拠点が見つかりません。" };
  const outcome = await tryRunAndPersist(tenantId, {
    label: "対策案の選択",
    events: [{ actor: ACTOR, kind: "countermeasure_selection", subjectId: siteId, payload: { key: key as CountermeasureType } }],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  revalidatePath("/", "layout");
  return {};
}

export interface RecordDecisionFormState {
  error?: string;
  success?: string;
}

export async function recordDecisionAction(
  _prevState: RecordDecisionFormState,
  formData: FormData
): Promise<RecordDecisionFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  const kind = String(formData.get("bindingKind") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const budgetAmount = formData.get("budgetAmount");
  const clauseText = String(formData.get("clauseText") ?? "").trim();

  if (!siteId || !isBindingKind(kind)) {
    return { error: "反映先を選択してください。" };
  }

  let mechanism: BindingMechanism;
  if (kind === "budget_allocation") {
    const amount = parseRequiredNumber(budgetAmount, { label: "予算反映額", min: 0 });
    if ("error" in amount) return amount;
    mechanism = { kind, targetSiteId: siteId, amount: exchangeAmount(amount.value) };
  } else if (kind === "procurement_contract_clause") {
    if (!clauseText) {
      return { error: "契約条項の内容を入力してください。" };
    }
    mechanism = { kind, clauseText };
  } else {
    mechanism = { kind };
  }

  const tenantId = await getTenantId();
  if (!hasDecisionSite(await getOrCreateLatestResult(tenantId), siteId)) return { error: "対象拠点が見つかりません。" };
  const state = await loadInteractionState(tenantId);
  const current = state.bindingMechanismState.get(siteId);
  const previousMechanism = current?.mechanism ?? { kind: "weak_reference" };
  const mechanismChanged = JSON.stringify(previousMechanism) !== JSON.stringify(mechanism);

  // 同じ内容の再送信は記録しない。
  if (current && !mechanismChanged) {
    return { success: "反映先に変更はありません。" };
  }
  // 初回の選択・変更時は理由を必須にする(M6 D-9:デフォルト値を設けず、明示選択と変更履歴の記録を必須とする)。
  if (!reason) {
    return { error: current ? "反映先を変更する場合は理由を入力してください。" : "この反映先を選ぶ理由を入力してください。" };
  }
  if (reason.length < 8) {
    return { error: "理由が短すぎます。監査証跡として第三者が選択の根拠を理解できるように記入してください(8文字以上)。" };
  }

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

  revalidatePath("/", "layout");
  return { success: "結果の反映先を記録しました。" };
}
