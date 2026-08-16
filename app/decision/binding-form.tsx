"use client";

import { useActionState, useState } from "react";
import { BINDING_OPTIONS } from "../components/labels";
import { recordDecisionAction, type RecordDecisionFormState } from "./actions";

const initialState: RecordDecisionFormState = {};

export function BindingForm({ siteId, currentKind }: { siteId: string; currentKind: string }) {
  const [state, formAction, pending] = useActionState(recordDecisionAction, initialState);
  const [kind, setKind] = useState(currentKind);

  return (
    <form action={formAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {BINDING_OPTIONS.map((opt) => (
          <label key={opt.value} className={`binding-option${kind === opt.value ? " selected" : ""}`}>
            <input
              type="radio"
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
          <input id="budgetAmount" name="budgetAmount" type="number" step="any" />
        </div>
      )}
      {kind === "procurement_contract_clause" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="clauseText">契約条項の内容</label>
          <textarea id="clauseText" name="clauseText" rows={3} />
        </div>
      )}

      {kind !== currentKind && (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="reason">反映先の変更理由(必須)</label>
          <textarea id="reason" name="reason" rows={3} />
        </div>
      )}

      {state?.error && <p className="form-error">{state.error}</p>}

      <div style={{ marginTop: 12 }}>
        <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
          {pending ? "記録中…" : "決定を記録"}
        </button>
      </div>
    </form>
  );
}
