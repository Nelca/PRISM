"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { importTargetsAction, type ImportState } from "./actions";
import { TARGET_CSV_MAX_BYTES } from "@/lib/environment/csv";
export function ImportForm({ initialCsv = "" }: { initialCsv?: string }) {
  const [csv, setCsv] = useState(initialCsv);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ImportState>({});
  const [pending, startTransition] = useTransition();
  function submit(form: FormData) {
    startTransition(async () => {
      try { setState(await importTargetsAction(form)); }
      catch { setState({ errors: ["通信が完了しませんでした。最新の編集用CSVで保存状態を確認してから、再度お試しください。"] }); }
    });
  }
  if (state.savedCount) return <div role="status"><p>{state.savedCount}件を保存し、判定しました。</p><Link href="/portfolio" className="pill-btn pill-btn--accent">統合管理で確認する →</Link><button className="pill-btn" onClick={() => { setCsv(""); setState({}); }}>続けて取り込む</button></div>;
  return <form action={submit}>
    <fieldset disabled={pending} className="portfolio-import-fields">
      <div className="field"><label htmlFor="target-csv-file">CSVファイル（UTF-8・1MBまで）</label><input id="target-csv-file" type="file" accept=".csv,text/csv" onChange={async (event) => {
        setState({});
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > TARGET_CSV_MAX_BYTES) { setCsv(""); setState({ errors: ["CSVは1MB以内にしてください。"] }); return; }
        try { setCsv(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())); }
        catch { setCsv(""); setState({ errors: ["UTF-8のCSVとして保存し直してください。"] }); }
      }} /></div>
      <div className="field"><label htmlFor="target-csv">CSVの内容（直接貼り付けもできます）</label><textarea id="target-csv" name="csv" rows={8} value={csv} required onChange={(event) => { setCsv(event.target.value); setState({}); }} /></div>
      <div className="field"><label htmlFor="target-import-reason">取込理由</label><textarea id="target-import-reason" name="reason" rows={2} minLength={8} maxLength={2000} required value={reason} onChange={(event) => { setReason(event.target.value); setState({}); }} /></div>
      {state.preview && <section aria-label="取込内容の確認">
        <h2 className="portfolio-heading">{state.preview.rows.length}件の取込内容</h2>
        <p>更新行は空欄も反映します。1件でも不正・競合があれば、全件を保存しません。</p>
        <div className="portfolio-table-scroll"><table className="data-table"><thead><tr><th>行・操作</th><th>拠点・指標・範囲</th><th>実測 / 目標</th><th>保存後の状態</th></tr></thead><tbody>{state.preview.rows.map((row) => <tr key={row.line}><td>{row.line}行目 · {row.operation}</td><td>{row.site} / {row.label}<span className="cell-note">{row.year}年 · {row.boundary}</span></td><td>{row.previous && <span className="cell-note">変更前 {row.previous.current ?? "未入力"} / 目標 {row.previous.target ?? "未入力"} {row.unit}</span>}{row.current ?? "未入力"} {row.unit}<span className="cell-note">目標 {row.target ?? "未入力"} {row.unit} {row.direction}</span></td><td>{row.status}<details className="foldout"><summary>根拠・担当・期限</summary><p>実測根拠: {row.evidence || "未入力"}</p><p>目標根拠: {row.targetBasis || "未入力"}</p><p>担当: {row.owner || "未設定"} / 期限: {row.dueDate || "未設定"}</p><p>対応: {row.actionPlan || "未入力"}</p></details></td></tr>)}</tbody></table></div>
        <input type="hidden" name="previewHash" value={state.preview.hash} />
        <label className="site-form-checkbox"><input type="checkbox" name="confirmed" required />拠点・期間・範囲と、CSV内の値・根拠・担当・期限の変更内容を確認しました</label>
      </section>}
      {state.errors && <div role="alert"><ul>{state.errors.slice(0, 30).map((error, index) => <li key={index}>{error}</li>)}</ul>{state.errors.length > 30 && <p>ほか{state.errors.length - 30}件。修正後に再確認してください。</p>}</div>}
      <button name="mode" value={state.preview ? "commit" : "preview"} className="pill-btn pill-btn--accent" disabled={pending}>{pending ? "処理中…" : state.preview ? `${state.preview.rows.length}件をまとめて保存する` : "取込内容を確認する"}</button>
    </fieldset>
  </form>;
}
