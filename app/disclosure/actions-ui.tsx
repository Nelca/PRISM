"use client";

import { useActionState } from "react";
import { ModalForm } from "../components/ui";
import { acquireEvidenceAction, recordIntentionalDecisionAction, weakenClaimAction, type DisclosureActionFormState } from "./actions";

const initialState: DisclosureActionFormState = {};

export function WeakenClaimAction({ claimId, currentText }: { claimId: string; currentText: string }) {
  return (
    <ModalForm
      triggerLabel="① 記載内容を弱める"
      title="記載内容を弱める"
      subtitle="根拠がやや弱い記載への対応案"
      action={weakenClaimAction}
      initialState={initialState}
      confirmLabel="この表現に修正して記録"
      hiddenFields={{ claimId }}
    >
      <div className="field">
        <label>現在の記載</label>
        <div style={{ border: "1px solid var(--brick-line)", background: "var(--brick-soft)", borderRadius: 6, padding: "10px 12px", fontSize: 12.5 }}>
          {currentText}
        </div>
      </div>
      <div className="field">
        <label htmlFor="newText">修正後の記載内容(必須)</label>
        <textarea id="newText" name="newText" rows={4} defaultValue={currentText} />
      </div>
    </ModalForm>
  );
}

export function AcquireEvidenceAction({ materialIssueId }: { materialIssueId: string }) {
  const [state, formAction, pending] = useActionState(acquireEvidenceAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="materialIssueId" value={materialIssueId} />
      <button type="submit" className="pill-btn pill-btn--accent" disabled={pending}>
        {pending ? "追加しています…" : "② 根拠を追加で取得する"}
      </button>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
    </form>
  );
}

export function RecordIntentionalDecisionAction({ claimId }: { claimId: string }) {
  return (
    <ModalForm
      triggerLabel="③ 判断の理由を記録する"
      title="判断の理由を記録する"
      subtitle="現状の根拠水準で開示を続ける理由を入力してください"
      action={recordIntentionalDecisionAction}
      initialState={initialState}
      confirmLabel="記録する"
      hiddenFields={{ claimId }}
    >
      <div className="field">
        <label htmlFor="reason">理由(必須)</label>
        <textarea id="reason" name="reason" rows={4} minLength={8} placeholder="監査証跡に残ります。第三者が根拠を理解できる内容を記入してください(8文字以上)。" />
        <div className="field-hint">この理由は記録され、変更履歴でいつでも確認できます。</div>
      </div>
    </ModalForm>
  );
}
