"use client";

import { useActionState, useState, useId } from "react";
import Link from "next/link";
import { METRICS, METRIC_BY_ID, TARGET_CATEGORIES, type TargetCategory, type EnvironmentalTarget } from "@/lib/environment/metrics";
import { saveTargetAction, type TargetFormState } from "./actions";

export function TargetForm({ sites, record, initial, source, initialCategory = "biological_resources" }: {
  sites: { id: string; name: string }[]; record?: EnvironmentalTarget; initial?: Omit<EnvironmentalTarget, "id" | "revision" | "updatedAt">; source?: EnvironmentalTarget; initialCategory?: TargetCategory;
}) {
  const uid = useId();
  const values = record ?? initial;
  const fixedIdentity = Boolean(record || source);
  const [category, setCategory] = useState<TargetCategory>(values ? METRIC_BY_ID.get(values.metricId)!.category : initialCategory);
  const [metricId, setMetricId] = useState(values?.metricId ?? METRICS.find((metric) => metric.category === initialCategory)!.id);
  const metric = METRIC_BY_ID.get(metricId)!;
  const [state, action, pending] = useActionState<TargetFormState, FormData>(saveTargetAction, {});
  const field = (name: string) => `${uid}-${name}`;
  if (state.savedId) return <div role="status"><p className="form-success">環境指標を保存し、目標との関係を判定しました。</p><Link href={`/portfolio/${state.savedId}`} className="pill-btn pill-btn--accent">保存した指標を確認する →</Link> <Link href="/portfolio" className="pill-btn">統合管理へ</Link></div>;
  return <form action={action} className="target-form">
    {source && <><input type="hidden" name="sourceTargetId" value={source.id} /><input type="hidden" name="sourceRevision" value={source.revision} /><p className="field-hint">{source.reportingYear}年の指標を引き継ぎます。当年の実測値・目標・期限は空欄です。比較基準の根拠と当年の目標を確認してから登録してください。</p></>}
    <input type="hidden" name="targetId" value={record?.id ?? ""} />
    <input type="hidden" name="revision" value={record?.revision ?? ""} />
    <div className="field-row">
      <div className="field"><label htmlFor={field("site")}>拠点</label><select id={field("site")} name="siteId" defaultValue={values?.siteId ?? ""} required disabled={fixedIdentity}><option value="">拠点を選択</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>{fixedIdentity && <input type="hidden" name="siteId" value={values!.siteId} />}</div>
      <div className="field"><label htmlFor={field("category")}>判定対象の種類</label><select id={field("category")} value={category} disabled={fixedIdentity} onChange={(event) => { const next = event.target.value as TargetCategory; setCategory(next); setMetricId(METRICS.find((item) => item.category === next)!.id); }}>{Object.entries(TARGET_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    </div>
    <div className="field"><label htmlFor={field("metric")}>管理する指標</label><select id={field("metric")} name="metricId" value={metricId} disabled={fixedIdentity} onChange={(event) => setMetricId(event.target.value)}>{METRICS.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.label}（{item.unit}）</option>)}</select>{fixedIdentity && <input type="hidden" name="metricId" value={values!.metricId} />}<p className="field-hint">{metric.hint}</p></div>
    <div className="field-row">
      <div className="field"><label htmlFor={field("year")}>対象年</label><input id={field("year")} name="reportingYear" type="number" min="1900" max="2200" step="1" required readOnly={Boolean(record)} defaultValue={values?.reportingYear ?? ""} placeholder="例: 2027" /></div>
      <div className="field"><label htmlFor={field("boundary")}>測定範囲・対象資源</label><input id={field("boundary")} name="boundary" required maxLength={250} readOnly={fixedIdentity} defaultValue={values?.boundary ?? ""} placeholder="例: 国内調達の認証木材／敷地北側の湿地" /></div>
    </div>
    <fieldset key={metricId} className="target-numbers"><legend>実測値と目標（{metric.unit}）</legend><p className="field-hint">まだ値がなくても担当と期限を登録できます。空欄は未入力、0は実測値のゼロとして扱います。</p>
      <div className="field-row">{([ ["current", "実測値"], ["target", "目標値"], ["baseline", "比較基準値（任意）"] ] as const).map(([name, label]) => <div className="field" key={name}><label htmlFor={field(name)}>{label}</label><input id={field(name)} name={name} type="number" min="0" max={metric.maximum} step="any" defaultValue={values?.[name] ?? ""} /></div>)}</div>
      <div className="field"><label htmlFor={field("direction")}>目標の向き</label><select id={field("direction")} name="direction" required defaultValue={values?.direction ?? ""}><option value="">達成とする条件を選択</option><option value="at_most">目標値以下に抑える</option><option value="at_least">目標値以上を確保する</option></select></div>
    </fieldset>
    <div className="field"><label htmlFor={field("measuredOn")}>値を確認した日</label><input id={field("measuredOn")} name="measuredOn" type="date" defaultValue={values?.measuredOn ?? ""} /></div>
    <div className="field"><label htmlFor={field("evidence")}>実測値・比較基準値の根拠</label><textarea id={field("evidence")} name="evidence" rows={3} maxLength={4000} defaultValue={values?.evidence ?? ""} placeholder="資料名・対象期間・集計方法・所在。比較基準値を入れた場合はその期間と範囲も記載" /></div>
    <div className="field"><label htmlFor={field("targetBasis")}>目標値の根拠</label><textarea id={field("targetBasis")} name="targetBasis" rows={2} maxLength={4000} defaultValue={values?.targetBasis ?? ""} placeholder="社内方針・承認した目標・適用期間など。法令への適合は自動判定しません" /></div>
    <div className="field-row"><div className="field"><label htmlFor={field("owner")}>担当（任意）</label><input id={field("owner")} name="owner" maxLength={100} defaultValue={values?.owner ?? ""} /></div><div className="field"><label htmlFor={field("dueDate")}>確認・対応期限（任意）</label><input id={field("dueDate")} name="dueDate" type="date" defaultValue={values?.dueDate ?? ""} /></div></div>
    <div className="field"><label htmlFor={field("actionPlan")}>次の対応・メモ（任意）</label><textarea id={field("actionPlan")} name="actionPlan" rows={2} maxLength={4000} defaultValue={values?.actionPlan ?? ""} /></div>
    {record && <label className="site-form-checkbox"><input type="checkbox" name="archived" defaultChecked={record.archived} />保管に移す（履歴を残し、通常の一覧から外す。後から戻せます）</label>}
    <div className="field"><label htmlFor={field("reason")}>{record ? "変更" : "登録"}理由</label><textarea id={field("reason")} name="reason" required minLength={8} maxLength={2000} rows={2} placeholder="第三者が内容を理解できる理由を8文字以上で記入" /></div>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="pill-btn pill-btn--accent" disabled={pending || sites.length === 0}>{pending ? "保存・判定中…" : record ? "変更を保存して判定する" : "指標を登録して判定する"}</button>
  </form>;
}
