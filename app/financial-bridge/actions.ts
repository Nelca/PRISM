"use server";

import { revalidatePath } from "next/cache";
import { getDefaultTenantId } from "@/lib/db/client";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import type { CompanyFinancialsInput } from "@/lib/demo/interaction-state";

const REVALIDATE_PATHS = ["/", "/financial-bridge", "/decision", "/ledger"];
const ACTOR = "宮里";

export interface CompanyFinancialsFormState {
  error?: string;
  saved?: boolean;
}

const FIELDS: { name: keyof CompanyFinancialsInput; label: string }[] = [
  { name: "reportedOperatingProfit", label: "報告営業利益" },
  { name: "currentlyInternalizedCost", label: "内部化済みコスト" },
  { name: "existingImpairmentThreshold", label: "減損テスト前提の閾値" },
  { name: "netDebt", label: "純有利子負債" },
  { name: "ebitda", label: "EBITDA" },
  { name: "interestExpense", label: "支払利息" },
];

/**
 * 企業単位の財務データを記録する(M5 D-1:企業提供・PRISMは検証しない)。
 *
 * **空欄を0で埋めない。**未入力は入力エラーとして返す。0は「支払利息が0円」という
 * 意味のある値であり、「まだ聞けていない」とは区別されなければならない(D-15)。
 */
export async function saveCompanyFinancialsAction(
  _prevState: CompanyFinancialsFormState,
  formData: FormData
): Promise<CompanyFinancialsFormState> {
  const values = {} as CompanyFinancialsInput;

  for (const field of FIELDS) {
    const raw = String(formData.get(field.name) ?? "").trim();
    if (raw === "") {
      return { error: `${field.label}を入力してください(未入力を0として扱いません)。` };
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return { error: `${field.label}は数値で入力してください。` };
    }
    values[field.name] = value;
  }

  const tenantId = getDefaultTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "company_financials",
    subjectId: "company",
    payload: { financials: values, logMessage: "企業単位の財務データを更新" },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { saved: true };
}
