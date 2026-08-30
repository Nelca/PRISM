"use client";

import { useActionState, useState } from "react";
import { importPrtrDatasetAction, type PrtrImportFormState } from "./prtr-actions";

const INITIAL_STATE: PrtrImportFormState = {};

function PrtrFileField({ id, name, label, accept }: { id: string; name: string; label: string; accept: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="file-input">
        <input
          id={id}
          name={name}
          type="file"
          accept={accept}
          className="file-input__control"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
        <label htmlFor={id} className="pill-btn pill-btn--sm file-input__label">
          ファイルを選ぶ
        </label>
        <span className={`file-input__name${fileName ? " file-input__name--set" : ""}`}>{fileName ?? "未選択"}</span>
      </div>
    </div>
  );
}

/** `/sites`から呼ぶ独立パネル。既存の会社データ3ファイル取込とは状態を共有しない。 */
export function PrtrImportForm() {
  const [state, formAction, pending] = useActionState(importPrtrDatasetAction, INITIAL_STATE);

  return (
    <form action={formAction}>
      <p className="tooltip-note" style={{ marginTop: 0 }}>
        環境省の2023年度以降の公式列定義に対応します。全国原本はブラウザの上限を超えるため、運用者が対象施設行へ絞った
        CP932形式の3ファイルを使用してください。原本は保存せず、SHA-256と正規化行だけを保存します。
      </p>
      <p className="tooltip-note">
        架空データの動作確認用: {" "}
        <a href="/api/intake-template?name=prtr-honshi-sample" download className="pill-btn pill-btn--sm" style={{ textDecoration: "none" }}>
          本紙.txt
        </a>{" "}
        <a href="/api/intake-template?name=prtr-besshi-sample" download className="pill-btn pill-btn--sm" style={{ textDecoration: "none" }}>
          別紙.txt
        </a>{" "}
        <a href="/api/intake-template?name=prtr-other-industries-sample" download className="pill-btn pill-btn--sm" style={{ textDecoration: "none" }}>
          他業種.txt
        </a>{" "}
        <a href="/api/intake-template?name=prtr-crosswalk-sample" download className="pill-btn pill-btn--sm" style={{ textDecoration: "none" }}>
          crosswalk.csv
        </a>
        。排出年度・対象物質リスト版はどちらも2023のまま、4ファイルを同時に選択してください。
      </p>
      <div className="grid-2" style={{ gap: 10 }}>
        <div className="field">
          <label htmlFor="prtrReportingYear">排出年度</label>
          <input id="prtrReportingYear" name="reportingYear" inputMode="numeric" pattern="[0-9]{4}" defaultValue="2023" required />
        </div>
        <div className="field">
          <label htmlFor="prtrListVersion">対象物質リスト版</label>
          <input id="prtrListVersion" name="prtrListVersion" defaultValue="2023" required />
        </div>
      </div>
      <PrtrFileField id="prtrHonshi" name="honshiFile" label="本紙.txt（CP932）" accept=".txt,text/plain" />
      <PrtrFileField id="prtrBesshi" name="besshiFile" label="別紙.txt（CP932）" accept=".txt,text/plain" />
      <PrtrFileField id="prtrOtherIndustries" name="otherIndustriesFile" label="他業種.txt（CP932）" accept=".txt,text/plain" />
      <PrtrFileField
        id="prtrCrosswalk"
        name="facilityCrosswalkFile"
        label="facility-crosswalk.csv（UTF-8）"
        accept=".csv,text/csv"
      />
      <p className="tooltip-note">
        crosswalkの列順: <code>reporting_year,facility_id,site_id</code>。指定されていない全国事業所は取り込みません。
      </p>
      <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
        {pending ? "全件を検証しています…" : "検証してPRTRを取り込む"}
      </button>

      {state.errors && state.errors.length > 0 && (
        <div style={{ marginTop: 16 }} aria-live="polite">
          <div className="section-label" style={{ color: "var(--brick)" }}>
            取り込めませんでした（{state.errors.length}件）
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {state.errors.map((error, index) => (
              <li key={`${index}-${error}`} style={{ fontSize: 12.5, color: "var(--brick)" }}>
                {error}
              </li>
            ))}
          </ul>
          <p className="tooltip-note">1件でもエラーがある場合、バッチと正規化行は一件も保存しません。</p>
        </div>
      )}

      {state.importedRecordCount !== undefined && (
        <div style={{ marginTop: 16 }} aria-live="polite">
          <div className="section-label" style={{ color: "var(--accent-ink)" }}>
            PRTR長形式 {state.importedRecordCount}行を取り込みました
          </div>
          <p className="tooltip-note">
            直接排出 {state.eligibleRecordCount}行／移動量 {state.transferOnlyRecordCount}行／未報告 {state.notReportedRecordCount}行。
            移動量は汚染として貨幣化しません。
          </p>
        </div>
      )}
    </form>
  );
}
