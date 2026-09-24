"use client";
import type { DecisionRecord } from "@core/types/decision";
import type { DisclosureClaim } from "@core/types/disclosure";
import { useActionState, useId, useState } from "react";
import Link from "next/link";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { decisionFingerprint, claimFingerprint, claimLinkCurrent, resourceCostComparison, resourceInvestmentComparison, supportsResourceCosts, suggestedPhysicalDisclosure, targetFingerprint } from "@/lib/environment/review";
import { saveTargetReviewAction } from "./review-actions";

function ReviewForm({ record, kind, siteName, claims = [], decisions = [] }: { record: EnvironmentalTarget; kind: "cost" | "disclosure"; siteName: string; claims?: DisclosureClaim[]; decisions?: DecisionRecord[] }) {
  const [state, action, pending] = useActionState(saveTargetReviewAction, {});
  const uid = useId();
  const [claimId, setClaimId] = useState(record.disclosureNote?.linkedClaim?.id ?? "");
  const [decisionId, setDecisionId] = useState(record.costCase?.investment?.linkedDecision?.id ?? "");
  const selectedDecision = decisions.find((item) => item.id === decisionId);
  const selectedClaim = claims.find((claim) => claim.id === claimId);
  const [disclosureText, setDisclosureText] = useState(record.disclosureNote?.text ?? suggestedPhysicalDisclosure(record, siteName));
  const field = (key: string) => `${uid}-${key}`;
  const cost = record.costCase;
  const [investmentEnabled, setInvestmentEnabled] = useState(Boolean(cost?.investment));
  return <form action={action} className="target-form">
    <input type="hidden" name="targetId" value={record.id} /><input type="hidden" name="revision" value={record.revision} /><input type="hidden" name="kind" value={kind} />
    {kind === "cost" ? <>
      <div className="field"><label htmlFor={field("name")}>対策案名</label><input id={field("name")} name="name" required maxLength={200} defaultValue={cost?.name ?? ""} placeholder="例: 原材料の歩留まり改善" /></div>
      <div className="field-row">{([
        ["baselineUnitCost", "現在の単価（円/t）"], ["alternativeQuantity", "対策後の年間数量（t）"], ["alternativeUnitCost", "対策後の単価（円/t）"], ["additionalAnnualCost", "追加年間費用（円/年）"], ["initialInvestment", "初期費用（円）"],
      ] as const).map(([key, label]) => <div className="field" key={key}><label htmlFor={field(key)}>{label}</label><input id={field(key)} name={key} type="number" min="0" step="any" required defaultValue={cost?.[key] ?? ""} /></div>)}</div>
      <div className="field"><label htmlFor={field("evidence")}>単価・数量・費用の根拠</label><textarea id={field("evidence")} name="evidence" rows={3} minLength={8} maxLength={4000} required defaultValue={cost?.evidence ?? ""} placeholder="見積書・対象品目・供給地域・適用期間・費用に含めた範囲を記載" /></div>
      <label className="site-form-checkbox"><input type="checkbox" name="investmentEnabled" checked={investmentEnabled} onChange={(event) => setInvestmentEnabled(event.target.checked)} />複数年の費用削減で初期費用を回収できるか判定する</label>
      {investmentEnabled && <>
        <div className="field-row">{([ ["horizon", "評価期間（年）", 1, 50], ["discountRatePercent", "割引率（%）", 0, 100], ["approvalThreshold", "対策単体のNPV承認ライン（円）", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] ] as const).map(([key, label, min, max]) => <div className="field" key={key}><label htmlFor={field(key)}>{label}</label><input id={field(key)} name={key} type="number" required min={min} max={max} step={key === "horizon" ? "1" : "any"} defaultValue={cost?.investment?.[key] ?? ""} /></div>)}</div>
        <div className="field"><label htmlFor={field("decisionId")}>対応する同じ拠点の投資案件（任意）</label><select id={field("decisionId")} name="decisionId" value={decisionId} onChange={(event) => setDecisionId(event.target.value)}><option value="">対策単体で管理</option>{decisionId && !selectedDecision && <option value={decisionId}>案件を選び直してください</option>}{decisions.map((item) => <option key={item.id} value={item.id}>この拠点の投資判断（{item.decisionDate}）</option>)}</select>{selectedDecision && <><input type="hidden" name="decisionFingerprint" value={decisionFingerprint(selectedDecision)} /><p><Link href={`/decision?site=${encodeURIComponent(record.siteId)}`}>案件の現在の前提を確認 →</Link></p><label className="site-form-checkbox"><input type="checkbox" name="decisionConfirmed" required />案件の年度・対象範囲との関係、費用の重複を確認し、下の根拠に記録しました</label></>}</div>
        <div className="field"><label htmlFor={field("investmentRationale")}>期間・割引率・承認ラインの根拠</label><textarea id={field("investmentRationale")} name="investmentRationale" required minLength={8} maxLength={4000} defaultValue={cost?.investment?.rationale ?? ""} /></div>
        <label className="site-form-checkbox"><input type="checkbox" name="investmentConfirmed" required />費用削減は毎年末に同額発生し、追加年間費用と初期費用に重複がないことを確認しました</label>
        <p className="field-hint">初期費用は開始時に支払い、年間の費用削減を割り引きます。税・残存価値・価格変動は含みません。この対策単体の判定として「対策と判定」画面でも確認できます。</p>
      </>}
      <p className="field-hint">現在の年間数量はこの指標の実測値を使います。年度途中の累計量は年間数量として扱わないでください。同じ対象範囲・期間の単価で比較してください。追加費用がない場合は0を入力します。</p>
    </> : <div className="field"><label htmlFor={field("disclosureText")}>物理指標に基づく開示文案</label><textarea id={field("disclosureText")} name="disclosureText" rows={5} minLength={8} maxLength={4000} required value={disclosureText} onChange={(event) => setDisclosureText(event.target.value)} /><button className="pill-btn" type="button" onClick={() => setDisclosureText(suggestedPhysicalDisclosure(record, siteName))}>現在の入力値で文案を作り直す</button><p className="field-hint">期間・測定範囲・数値・根拠と文案の一致を確認してください。入力値が変わった場合は再確認が必要になります。</p></div>}
    {kind === "disclosure" && <div className="field"><label htmlFor={field("claimId")}>対応を確認する既存主張（任意）</label><select id={field("claimId")} name="claimId" value={claimId} onChange={(event) => setClaimId(event.target.value)}><option value="">紐付けなし</option>{claimId && !selectedClaim && <option value={claimId}>削除・変更された主張 — 選び直してください</option>}{claims.map((claim) => <option key={claim.id} value={claim.id}>{claim.sourceDocument} · {claim.sourcePageOrSection} · {claim.rawText.slice(0, 60)}</option>)}</select>
      {selectedClaim && <><blockquote>{selectedClaim.rawText}</blockquote><p>抽出された期間: {selectedClaim.extractedMetadata.periodMentioned ? `${selectedClaim.extractedMetadata.periodMentioned.startYear}〜${selectedClaim.extractedMetadata.periodMentioned.endYear}` : "不明"} / 範囲: {selectedClaim.extractedMetadata.scopeMentioned ?? "不明"} / 数量: {selectedClaim.extractedMetadata.quantityMentioned ? `${selectedClaim.extractedMetadata.quantityMentioned.value} ${selectedClaim.extractedMetadata.quantityMentioned.unit}` : "不明"}</p><input type="hidden" name="claimFingerprint" value={claimFingerprint(selectedClaim)} /><label className="site-form-checkbox"><input type="checkbox" name="claimConfirmed" required />原文と指標の年度・範囲・単位を照合しました。不明項目や差異への対応は確認理由に記録します</label></>}
      <p className="field-hint">PDFから取り込んだ主張も選べます。主張が変更されると再確認が必要です。この記録だけでは開示の自動指摘は解消されません。</p>
    </div>}
    <label className="site-form-checkbox"><input type="checkbox" name="confirmed" required />{kind === "cost" ? "実測値は1年間の数量で、単価・対策後数量・費用も同じ期間・範囲であることを確認しました" : "対象期間・範囲・入力値と根拠の対応を確認しました"}</label>
    <div className="field"><label htmlFor={field("reason")}>確認理由</label><textarea id={field("reason")} name="reason" rows={2} minLength={8} maxLength={2000} required /></div>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    {state.saved && <p role="status">確認内容を保存しました。</p>}
    <button className="pill-btn pill-btn--accent" disabled={pending}>{pending ? "保存中…" : kind === "cost" ? "前提を保存して費用差を試算する" : "根拠との対応を確認して文案を保存する"}</button>
  </form>;
}
export function TargetReviewPanels({ record, siteName, claims = [], decisions = [] }: { record: EnvironmentalTarget; siteName: string; claims?: DisclosureClaim[]; decisions?: DecisionRecord[] }) {
  const signature = targetFingerprint(record);
  const costs = record.costCase ? resourceCostComparison(record, record.costCase) : null;
  const investment = record.costCase ? resourceInvestmentComparison(record, record.costCase, decisions) : null;
  const currentCost = record.costCase?.sourceFingerprint === signature;
  const money = (value: number) => `${new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value)}円`;
  return <>
    {supportsResourceCosts(record) && <section className="card"><div className="card__body"><h2 className="portfolio-heading">資源の対策案と費用差</h2><p>調達量・投入量と自社の単価を使って、現在と対策後の年間費用を比較します。評価期間・割引率を追加すると、この対策単体のNPVも確認できます。</p>
      {costs && currentCost ? <div className="portfolio-detail-values"><div><span>現在の年間費用</span><strong>{money(costs.currentAnnualCost)}</strong></div><div><span>対策後の年間費用</span><strong>{money(costs.alternativeAnnualCost)}</strong></div><div><span>年間の費用削減（マイナスは増額）</span><strong>{money(costs.annualSavings)}</strong></div><div><span>初期費用を含む初年度の差</span><strong>{money(costs.firstYearSavings)}</strong></div></div> : record.costCase && <p role="status">実測値・根拠が更新されています。以前の費用前提を再確認してください。</p>}
      {record.costCase?.investment?.linkedDecision && !investment && <p role="status">関連案件または入力が変更されています。投資の前提と案件との対応を再確認してください。</p>}
      {investment && <div><p><strong>対策単体のNPV: {money(investment.npv)} · {investment.meetsThreshold ? "承認ライン以上" : "承認ライン未満"}</strong></p><p>{record.costCase!.investment!.horizon}年間・割引率{record.costCase!.investment!.discountRatePercent}% / 承認ライン{money(record.costCase!.investment!.approvalThreshold)}</p><details className="foldout"><summary>各年の費用削減と現在価値</summary><p>開始時: −{money(record.costCase!.initialInvestment)}</p><ul>{investment.cashflows.map((row) => <li key={row.year}>{row.year}年後: {money(row.savings)} / 現在価値 {money(row.presentValue)}</li>)}</ul></details><p><Link href="/decision">対策と判定で他の対策も確認する →</Link></p></div>}
      <p className="field-hint">現在＝実測数量×現在単価。対策後＝対策後数量×対策後単価＋追加年間費用。年間費用差には割引を適用しません。自然債務・既存案件のNPVには自動合算しません。</p>
      {!record.archived && record.current !== null ? <details className="foldout"><summary>{record.costCase ? "費用前提と根拠を確認・更新" : "対策案の数量・単価を入力"}</summary><ReviewForm record={record} kind="cost" siteName={siteName} decisions={decisions} /></details> : <p>有効な指標に実測値を登録すると試算できます。</p>}
    </div></section>}
    <section className="card"><div className="card__body"><h2 className="portfolio-heading">開示文案と根拠の関連付け</h2>
      <p>{record.disclosureNote ? record.disclosureNote.sourceFingerprint === signature && record.disclosureNote.siteName === siteName && claimLinkCurrent(record.disclosureNote, claims) ? "現在の入力値との対応を確認済みです。" : "入力値・目標・根拠・拠点名または既存主張が変わりました。文案を再確認するまで下書きへの出力を止めています。" : "文案を確認して保存すると、根拠と一緒に開示の下書きへ反映されます。"}</p>
      {!record.archived && record.current !== null ? <details className="foldout"><summary>文案と根拠を確認・更新</summary><ReviewForm record={record} kind="disclosure" siteName={siteName} claims={claims} /></details> : <p>有効な指標に実測値を登録してから、文案を確認してください。</p>}
      <p><Link href="/disclosure/draft">開示文の下書きで確認する →</Link></p>
    </div></section>
  </>;
}
