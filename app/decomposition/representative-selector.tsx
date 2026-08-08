"use client";

import { ModalForm } from "../components/ui";
import { changeRepresentativeRecordAction, type ChangeRepresentativeFormState } from "./actions";

const initialState: ChangeRepresentativeFormState = {};

export function RepresentativeSelector({
  materialIssueId,
  recordId,
  fromLabel,
  toLabel,
}: {
  materialIssueId: string;
  recordId: string;
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <ModalForm
      triggerLabel="選択に変更"
      title="代表値を変更"
      subtitle={`${toLabel} に切り替える理由を入力してください`}
      action={changeRepresentativeRecordAction}
      initialState={initialState}
      confirmLabel="変更を確定して記録"
      hiddenFields={{ materialIssueId, recordId, fromLabel, toLabel }}
    >
      <div className="field">
        <label htmlFor="reason">変更理由(必須)</label>
        <textarea id="reason" name="reason" rows={4} />
        <div className="field-hint">この理由は記録され、変更履歴でいつでも確認できます。</div>
      </div>
    </ModalForm>
  );
}
