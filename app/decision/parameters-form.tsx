"use client";

import { ModalForm } from "../components/ui";
import { saveDecisionParametersAction, type DecisionParametersFormState } from "./actions";
import type { DecisionParametersInput } from "@/lib/demo/interaction-state";

const initialState: DecisionParametersFormState = {};

/**
 * `emphasis`:C-06。投資の承認ラインが未入力で判定が保留の拠点では、このフォームが
 * 「この画面の最初の仕事」になるため、判定結果カードの本文先頭に主要ボタン
 * (pill-btn--primary)として置く。確定後は見出し脇の小さなボタンのまま。
 */
export function DecisionParametersForm({
  siteId,
  current,
  emphasis,
}: {
  siteId: string;
  current?: DecisionParametersInput;
  emphasis?: boolean;
}) {
  return (
    <ModalForm
      triggerLabel={current ? "投資判断の前提を更新" : "投資判断の前提を入力"}
      triggerVariant={emphasis ? "primary" : undefined}
      title="投資判断の前提"
      subtitle="経営企画・経理に確認する項目です。投資の承認ラインは後から入力できます"
      action={saveDecisionParametersAction}
      initialState={initialState}
      confirmLabel="保存して再計算"
      hiddenFields={{ siteId }}
    >
      <div className="field">
        <label htmlFor="baselineNpvValue">投資価値NPV(円)・自然コストを含まない値</label>
        <input
          id="baselineNpvValue"
          name="baselineNpvValue"
          type="number"
          step="any"
          defaultValue={current?.baselineNpvValue}
        />
        <div className="field-hint">NPV=投資が生む将来の利益を現在の金額に換算した合計。既存の投資評価プロセスの出力で、PRISMは計算方法を検証しません。</div>
      </div>

      <div className="field">
        <label htmlFor="discountRate">割引率(例:0.05)</label>
        <input id="discountRate" name="discountRate" type="number" step="any" defaultValue={current?.discountRate} />
        <div className="field-hint">投資価値(NPV)の算出に使った率。対策の割引にも同じ値を使います。</div>
      </div>

      <div className="field">
        <label htmlFor="horizon">評価期間(年)</label>
        <input id="horizon" name="horizon" type="number" step="1" defaultValue={current?.horizon} />
      </div>

      <div className="field">
        <label htmlFor="approvalThresholdValue">投資の承認ライン(円)—— 未定なら空欄のまま</label>
        <input
          id="approvalThresholdValue"
          name="approvalThresholdValue"
          type="number"
          step="any"
          defaultValue={current?.approvalThresholdValue ?? ""}
        />
        <div className="field-hint">
          社内で投資が承認される基準の金額。経理・経営企画の管轄で、すぐには分からないことがあります。
        </div>
      </div>

      <p className="tooltip-note">
        承認ラインが未入力でも、自然コスト反映後の投資価値の幅と自然関連コストは表示されます。判定(結論が変わるか)だけが
        保留になります。**業界標準値で仮置きすることはしません。**
      </p>
    </ModalForm>
  );
}
