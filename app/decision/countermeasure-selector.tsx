"use client";

import { useActionState } from "react";
import { selectCountermeasureAction, type SelectCountermeasureFormState } from "./actions";

const initialState: SelectCountermeasureFormState = {};

export function CountermeasureSelector({ siteId, candidateKey, selected }: { siteId: string; candidateKey: string; selected: boolean }) {
  const [state, formAction, pending] = useActionState(selectCountermeasureAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="key" value={candidateKey} />
      <button type="submit" disabled={pending || selected} className="pill-btn pill-btn--sm">
        {selected ? "選択中" : "この案で判定"}
      </button>
      {state?.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}
