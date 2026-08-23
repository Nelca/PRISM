"use client";

import { ModalForm } from "../components/ui";
import { saveCompanyFinancialsAction, type CompanyFinancialsFormState } from "./actions";
import type { CompanyFinancialsInput } from "@/lib/demo/interaction-state";

const initialState: CompanyFinancialsFormState = {};

const FIELDS: { name: keyof CompanyFinancialsInput; label: string; hint?: string }[] = [
  { name: "reportedOperatingProfit", label: "営業利益・決算値(円)", hint: "決算書(監査済み)の営業利益。PRISMは検証しません" },
  { name: "currentlyInternalizedCost", label: "内部化済みコスト(円)", hint: "炭素税・水利用料等として既に支払っている額" },
  { name: "existingImpairmentThreshold", label: "減損の目安額(円)", hint: "既存の減損テストで前提としている金額。自然関連の損失見込みがこれを超えると前提の見直しが必要になりえます" },
  { name: "netDebt", label: "純有利子負債(円)" },
  { name: "ebitda", label: "EBITDA(円)" },
  { name: "interestExpense", label: "支払利息(円)" },
];

export function CompanyFinancialsForm({ current }: { current?: CompanyFinancialsInput }) {
  return (
    <ModalForm
      triggerLabel={current ? "財務データを更新" : "財務データを入力"}
      title="企業単位の財務データ"
      subtitle="財務・経理部門に確認する項目です。入力するとこの画面の数値が実データで再計算されます"
      action={saveCompanyFinancialsAction}
      initialState={initialState}
      confirmLabel="保存して再計算"
    >
      {FIELDS.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input id={field.name} name={field.name} type="number" step="any" defaultValue={current?.[field.name]} />
          {field.hint && <div className="field-hint">{field.hint}</div>}
        </div>
      ))}
      <p className="tooltip-note">未入力の項目は0として扱いません。分からない値は、分かってから入力してください。</p>
    </ModalForm>
  );
}
