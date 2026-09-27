"use client";

import Link from "next/link";
import { useActionState, useId, useState, type ReactNode } from "react";
import type { DecisionRecord } from "@core/types/decision";
import type { DisclosureClaim } from "@core/types/disclosure";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { claimFingerprint, decisionFingerprint, suggestedPhysicalDisclosure } from "@/lib/environment/review";
import { saveTargetReviewAction } from "./review-actions";

const COST_FIELDS = [
  ["baselineUnitCost", "現在の単価（円/t）"],
  ["alternativeQuantity", "対策後の年間数量（t）"],
  ["alternativeUnitCost", "対策後の単価（円/t）"],
  ["additionalAnnualCost", "追加年間費用（円/年）"],
  ["initialInvestment", "初期費用（円）"],
] as const;

const INVESTMENT_FIELDS = [
  ["horizon", "評価期間（年）", 1, 50, "1"],
  ["discountRatePercent", "割引率（%）", 0, 100, "any"],
  ["approvalThreshold", "対策単体のNPV承認ライン（円）", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "any"],
] as const;

/** 費用前提・開示文案の確認フォームに共通する、対象の版・確認欄・理由・送信ボタン。 */
function ReviewFormShell({
  record,
  kind,
  confirmLabel,
  submitLabel,
  children,
}: {
  record: EnvironmentalTarget;
  kind: "cost" | "disclosure";
  confirmLabel: string;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveTargetReviewAction, {});
  const reasonId = useId();
  return (
    <form action={action} className="target-form">
      <input type="hidden" name="targetId" value={record.id} />
      <input type="hidden" name="revision" value={record.revision} />
      <input type="hidden" name="kind" value={kind} />
      {children}
      <label className="site-form-checkbox">
        <input type="checkbox" name="confirmed" required />
        {confirmLabel}
      </label>
      <div className="field">
        <label htmlFor={reasonId}>確認理由</label>
        <textarea id={reasonId} name="reason" rows={2} minLength={8} maxLength={2000} required />
      </div>
      {state.error && <p role="alert" className="form-error">{state.error}</p>}
      {state.saved && <p role="status">確認内容を保存しました。</p>}
      <button className="pill-btn pill-btn--accent" disabled={pending}>{pending ? "保存中…" : submitLabel}</button>
    </form>
  );
}

export function CostReviewForm({ record, decisions }: { record: EnvironmentalTarget; decisions: DecisionRecord[] }) {
  const uid = useId();
  const field = (key: string) => `${uid}-${key}`;
  const cost = record.costCase;
  const [investmentEnabled, setInvestmentEnabled] = useState(Boolean(cost?.investment));
  const [decisionId, setDecisionId] = useState(cost?.investment?.linkedDecision?.id ?? "");
  const selectedDecision = decisions.find((item) => item.id === decisionId);

  return (
    <ReviewFormShell
      record={record}
      kind="cost"
      confirmLabel="実測値は1年間の数量で、単価・対策後数量・費用も同じ期間・範囲であることを確認しました"
      submitLabel="前提を保存して費用差を試算する"
    >
      <div className="field">
        <label htmlFor={field("name")}>対策案名</label>
        <input id={field("name")} name="name" required maxLength={200} defaultValue={cost?.name ?? ""} placeholder="例: 原材料の歩留まり改善" />
      </div>
      <div className="field-row">
        {COST_FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={field(key)}>{label}</label>
            <input id={field(key)} name={key} type="number" min="0" step="any" required defaultValue={cost?.[key] ?? ""} />
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor={field("evidence")}>単価・数量・費用の根拠</label>
        <textarea
          id={field("evidence")}
          name="evidence"
          rows={3}
          minLength={8}
          maxLength={4000}
          required
          defaultValue={cost?.evidence ?? ""}
          placeholder="見積書・対象品目・供給地域・適用期間・費用に含めた範囲を記載"
        />
      </div>

      <label className="site-form-checkbox">
        <input type="checkbox" name="investmentEnabled" checked={investmentEnabled} onChange={(event) => setInvestmentEnabled(event.target.checked)} />
        複数年の費用削減で初期費用を回収できるか判定する
      </label>
      {investmentEnabled && (
        <>
          <div className="field-row">
            {INVESTMENT_FIELDS.map(([key, label, min, max, step]) => (
              <div className="field" key={key}>
                <label htmlFor={field(key)}>{label}</label>
                <input id={field(key)} name={key} type="number" required min={min} max={max} step={step} defaultValue={cost?.investment?.[key] ?? ""} />
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor={field("decisionId")}>対応する同じ拠点の投資案件（任意）</label>
            <select id={field("decisionId")} name="decisionId" value={decisionId} onChange={(event) => setDecisionId(event.target.value)}>
              <option value="">対策単体で管理</option>
              {decisionId && !selectedDecision && <option value={decisionId}>案件を選び直してください</option>}
              {decisions.map((item) => <option key={item.id} value={item.id}>この拠点の投資判断（{item.decisionDate}）</option>)}
            </select>
            {selectedDecision && (
              <>
                <input type="hidden" name="decisionFingerprint" value={decisionFingerprint(selectedDecision)} />
                <p><Link href={`/decision?site=${encodeURIComponent(record.siteId)}`}>案件の現在の前提を確認 →</Link></p>
                <label className="site-form-checkbox">
                  <input type="checkbox" name="decisionConfirmed" required />
                  案件の年度・対象範囲との関係、費用の重複を確認し、下の根拠に記録しました
                </label>
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor={field("investmentRationale")}>期間・割引率・承認ラインの根拠</label>
            <textarea
              id={field("investmentRationale")}
              name="investmentRationale"
              required
              minLength={8}
              maxLength={4000}
              defaultValue={cost?.investment?.rationale ?? ""}
            />
          </div>
          <label className="site-form-checkbox">
            <input type="checkbox" name="investmentConfirmed" required />
            費用削減は毎年末に同額発生し、追加年間費用と初期費用に重複がないことを確認しました
          </label>
          <p className="field-hint">
            初期費用は開始時に支払い、年間の費用削減を割り引きます。税・残存価値・価格変動は含みません。この対策単体の判定として「対策と判定」画面でも確認できます。
          </p>
        </>
      )}
      <p className="field-hint">
        現在の年間数量はこの指標の実測値を使います。年度途中の累計量は年間数量として扱わないでください。同じ対象範囲・期間の単価で比較してください。追加費用がない場合は0を入力します。
      </p>
    </ReviewFormShell>
  );
}

function periodText(claim: DisclosureClaim): string {
  const period = claim.extractedMetadata.periodMentioned;
  return period ? `${period.startYear}〜${period.endYear}` : "不明";
}

function quantityText(claim: DisclosureClaim): string {
  const quantity = claim.extractedMetadata.quantityMentioned;
  return quantity ? `${quantity.value} ${quantity.unit}` : "不明";
}

export function DisclosureReviewForm({ record, siteName, claims }: { record: EnvironmentalTarget; siteName: string; claims: DisclosureClaim[] }) {
  const uid = useId();
  const field = (key: string) => `${uid}-${key}`;
  const [disclosureText, setDisclosureText] = useState(record.disclosureNote?.text ?? suggestedPhysicalDisclosure(record, siteName));
  const [claimId, setClaimId] = useState(record.disclosureNote?.linkedClaim?.id ?? "");
  const selectedClaim = claims.find((claim) => claim.id === claimId);

  return (
    <ReviewFormShell
      record={record}
      kind="disclosure"
      confirmLabel="対象期間・範囲・入力値と根拠の対応を確認しました"
      submitLabel="根拠との対応を確認して文案を保存する"
    >
      <div className="field">
        <label htmlFor={field("disclosureText")}>物理指標に基づく開示文案</label>
        <textarea
          id={field("disclosureText")}
          name="disclosureText"
          rows={5}
          minLength={8}
          maxLength={4000}
          required
          value={disclosureText}
          onChange={(event) => setDisclosureText(event.target.value)}
        />
        <button className="pill-btn" type="button" onClick={() => setDisclosureText(suggestedPhysicalDisclosure(record, siteName))}>
          現在の入力値で文案を作り直す
        </button>
        <p className="field-hint">期間・測定範囲・数値・根拠と文案の一致を確認してください。入力値が変わった場合は再確認が必要になります。</p>
      </div>
      <div className="field">
        <label htmlFor={field("claimId")}>対応を確認する既存主張（任意）</label>
        <select id={field("claimId")} name="claimId" value={claimId} onChange={(event) => setClaimId(event.target.value)}>
          <option value="">紐付けなし</option>
          {claimId && !selectedClaim && <option value={claimId}>削除・変更された主張 — 選び直してください</option>}
          {claims.map((claim) => (
            <option key={claim.id} value={claim.id}>
              {claim.sourceDocument} · {claim.sourcePageOrSection} · {claim.rawText.slice(0, 60)}
            </option>
          ))}
        </select>
        {selectedClaim && (
          <>
            <blockquote>{selectedClaim.rawText}</blockquote>
            <p>
              抽出された期間: {periodText(selectedClaim)} / 範囲: {selectedClaim.extractedMetadata.scopeMentioned ?? "不明"} / 数量: {quantityText(selectedClaim)}
            </p>
            <input type="hidden" name="claimFingerprint" value={claimFingerprint(selectedClaim)} />
            <label className="site-form-checkbox">
              <input type="checkbox" name="claimConfirmed" required />
              原文と指標の年度・範囲・単位を照合しました。不明項目や差異への対応は確認理由に記録します
            </label>
          </>
        )}
        <p className="field-hint">PDFから取り込んだ主張も選べます。主張が変更されると再確認が必要です。この記録だけでは開示の自動指摘は解消されません。</p>
      </div>
    </ReviewFormShell>
  );
}
