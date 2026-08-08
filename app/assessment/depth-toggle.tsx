"use client";

import { useActionState } from "react";
import { setDepthOverrideAction, type DepthOverrideFormState } from "./actions";

const initialState: DepthOverrideFormState = {};

export function DepthToggle({ materialIssueId, currentDepth }: { materialIssueId: string; currentDepth: "deep_dive" | "screening" }) {
  const [state, formAction, pending] = useActionState(setDepthOverrideAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", gap: 6 }}>
      <input type="hidden" name="materialIssueId" value={materialIssueId} />
      <button
        type="submit"
        name="mode"
        value="demote"
        disabled={pending}
        className={`pill-btn pill-btn--sm${currentDepth === "screening" ? " pill-btn--accent" : ""}`}
      >
        概算評価
      </button>
      <button
        type="submit"
        name="mode"
        value="promote"
        disabled={pending}
        className={`pill-btn pill-btn--sm${currentDepth === "deep_dive" ? " pill-btn--accent" : ""}`}
      >
        詳細評価
      </button>
      {state?.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}
