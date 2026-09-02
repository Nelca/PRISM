"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import type { CompanyFinancialsInput } from "@/lib/demo/interaction-state";
import { parseRequiredNumber } from "@/lib/forms/number";

const ACTOR = "宮里";

export interface CompanyFinancialsFormState {
  error?: string;
  saved?: boolean;
}

const FIELDS: { name: keyof CompanyFinancialsInput; label: string }[] = [
  { name: "reportedOperatingProfit", label: "営業利益(決算値)" },
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
    const parsed = parseRequiredNumber(formData.get(field.name), { label: field.label });
    if ("error" in parsed) return parsed;
    values[field.name] = parsed.value;
  }

  const tenantId = await getTenantId();
  const outcome = await tryRunAndPersist(tenantId, {
    label: "企業全体の財務データの入力",
    events: [
      {
        actor: ACTOR,
        kind: "company_financials",
        subjectId: "company",
        payload: { financials: values, logMessage: "企業単位の財務データを更新" },
      },
    ],
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  revalidatePath("/", "layout");
  return { saved: true };
}
