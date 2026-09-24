"use client";

import type { BindingMechanism } from "@core/types/decision";
import { useActionState, useState } from "react";
import { BINDING_OPTIONS } from "../components/labels";
import { recordDecisionAction, type RecordDecisionFormState } from "./actions";

const initialState: RecordDecisionFormState = {};

export function BindingForm({ siteId, current }: { siteId: string; current?: BindingMechanism }) {
  const [state, formAction, pending] = useActionState(recordDecisionAction, initialState);
  const [kind, setKind] = useState(current?.kind ?? "");

  return (
    <form action={formAction}>
      <p className="field-hint">社内での使い方を選び、理由とともに記録します。参考値として扱う選択も有効です。外部の稟議・予算・契約システムへの更新は行いません。</p>
      <input type="hidden" name="siteId" value={siteId} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {BINDING_OPTIONS.map((opt) => (
          <label key={opt.value} className={`binding-option${kind === opt.value ? " selected" : ""}`}>
            <input
              type="radio"
              required
              name="bindingKind"
              value={opt.value}
              checked={kind === opt.value}
              onChange={() => setKind(opt.value)}
              style={{ marginTop: 3, width: "auto" }}
            />
            <span>
              <b>{opt.label}</b>
              <br />
              <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {kind === "budget_allocation" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="budgetAmount">予算反映額(円)</label>
          <input id="budgetAmount" name="budgetAmount" type="number" step="any" required defaultValue={current?.kind === "budget_allocation" ? current.amount : ""} />
        </div>
      )}
      {kind === "procurement_contract_clause" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="clauseText">契約条項の内容</label>
          <textarea id="clauseText" name="clauseText" rows={3} required defaultValue={current?.kind === "procurement_contract_clause" ? current.clauseText : ""} />
        </div>
      )}

      {kind && (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="reason">この反映先を選ぶ理由（必須）</label>
          <textarea id="reason" name="reason" rows={3} required minLength={8} placeholder="監査証跡に残ります。第三者が根拠を理解できる内容を記入してください(8文字以上)。" />
        </div>
      )}

      {state?.success && <p className="form-success" role="status">{state.success}</p>}
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}

      <div style={{ marginTop: 12 }}>
        <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
          {pending ? "記録中…" : "決定を記録"}
        </button>
      </div>
    </form>
  );
}
