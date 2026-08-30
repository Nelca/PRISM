"use client";

import { useActionState, useState } from "react";
import {
  importLandUseCsvAction,
  importWasteCsvAction,
  type CategoryInputImportState,
} from "./category-input-actions";

const INITIAL_STATE: CategoryInputImportState = {};

function CategoryCsvForm({ category }: { category: "waste" | "land-use" }) {
  const action = category === "waste" ? importWasteCsvAction : importLandUseCsvAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [fileName, setFileName] = useState<string | null>(null);
  const title = category === "waste" ? "廃棄物" : "土地利用・改変";
  const inputId = `${category}-csv`;
  return (
    <form action={formAction}>
      <div className="section-label">{title}</div>
      <p className="tooltip-note">
        <a href={`/api/intake-template?name=${category}`} download className="pill-btn pill-btn--sm" style={{ textDecoration: "none" }}>
          サンプル兼テンプレート
        </a>{" "}
        をUTF-8で編集してください。原本は保存せず、SHA-256と正規化行だけを保存します。
        {category === "waste" && " PRTR移動量を結び付ける場合は、物理入力IDまたは source_record_id:sewer/offsite_waste を指定します。"}
      </p>
      <div className="file-input">
        <input
          id={inputId}
          name="categoryFile"
          type="file"
          accept=".csv,text/csv"
          className="file-input__control"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
        <label htmlFor={inputId} className="pill-btn pill-btn--sm file-input__label">ファイルを選ぶ</label>
        <span className={`file-input__name${fileName ? " file-input__name--set" : ""}`}>{fileName ?? "未選択"}</span>
      </div>
      <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
        {pending ? "検証・算定しています…" : `${title}CSVを取り込む`}
      </button>
      {state.errors && (
        <div aria-live="polite" style={{ marginTop: 12 }}>
          <div className="section-label" style={{ color: "var(--brick)" }}>取り込めませんでした（{state.errors.length}件）</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {state.errors.map((error, index) => <li key={`${index}-${error}`} style={{ fontSize: 12.5, color: "var(--brick)" }}>{error}</li>)}
          </ul>
        </div>
      )}
      {state.importedRecordCount !== undefined && (
        <p aria-live="polite" className="tooltip-note" style={{ color: "var(--accent-ink)" }}>
          {state.importedRecordCount}行を取り込み、LIME3単独パイロットを再計算しました。
        </p>
      )}
    </form>
  );
}

export function CategoryInputImportForms() {
  return (
    <div className="grid-2">
      <CategoryCsvForm category="waste" />
      <CategoryCsvForm category="land-use" />
    </div>
  );
}
