"use client";

import { ModalForm } from "../components/ui";
import { saveDecisionParametersAction, type DecisionParametersFormState } from "./actions";
import type { DecisionParametersInput } from "@/lib/demo/interaction-state";

const initialState: DecisionParametersFormState = {};

export function DecisionParametersForm({ siteId, current }: { siteId: string; current?: DecisionParametersInput }) {
  return (
    <ModalForm
      triggerLabel={current ? "投資判断の前提を更新" : "投資判断の前提を入力"}
      title="投資判断の前提"
      subtitle="経営企画・経理に確認する項目です。承認閾値は後から入力できます"
      action={saveDecisionParametersAction}
      initialState={initialState}
      confirmLabel="保存して再計算"
      hiddenFields={{ siteId }}
    >
      <div className="field">
        <label htmlFor="baselineNpvValue">通常NPV(円)</label>
        <input
          id="baselineNpvValue"
          name="baselineNpvValue"
          type="number"
          step="any"
          defaultValue={current?.baselineNpvValue}
        />
        <div className="field-hint">既存の投資評価プロセスの出力。PRISMは計算方法を検証しません。</div>
      </div>

      <div className="field">
        <label htmlFor="discountRate">割引率(例:0.05)</label>
        <input id="discountRate" name="discountRate" type="number" step="any" defaultValue={current?.discountRate} />
        <div className="field-hint">通常NPVの算出に使ったWACC・ハードルレート。対策の割引にも同じ値を使います。</div>
      </div>

      <div className="field">
        <label htmlFor="horizon">評価期間(年)</label>
        <input id="horizon" name="horizon" type="number" step="1" defaultValue={current?.horizon} />
      </div>

      <div className="field">
        <label htmlFor="approvalThresholdValue">承認閾値(円)—— 未定なら空欄のまま</label>
        <input
          id="approvalThresholdValue"
          name="approvalThresholdValue"
          type="number"
          step="any"
          defaultValue={current?.approvalThresholdValue ?? ""}
        />
        <div className="field-hint">
          稟議の承認ライン。経理・経営企画の管轄で、すぐには分からないことがあります。
        </div>
      </div>

      <p className="tooltip-note">
        承認閾値が未入力でも、自然調整後NPVのレンジと自然関連コストは表示されます。判定(またぐ/またがない)だけが
        保留になります。**業界標準値で仮置きすることはしません。**
      </p>
    </ModalForm>
  );
}
