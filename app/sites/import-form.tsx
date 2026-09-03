"use client";

import { useActionState, useState } from "react";
import { importCompanyDatasetAction, type ImportFormState } from "./actions";

const initialState: ImportFormState = {};

/**
 * カスタムfile入力(B-08)。
 *
 * ブラウザ標準の「ファイルを選択 選択されていません」表示のままだったため、
 * `.pill-btn` 風のラベルに選択ファイル名の表示を添える形に置き換える。
 * input自体は `display:none` にせず、視覚的に隠すだけ(`.file-input__control`、
 * clipによる隠蔽)にとどめる。これによりTab移動・Enter/Spaceでのダイアログ起動・
 * フォーカスリング表示といったキーボード操作性がそのまま維持される。
 */
function FileField({
  id,
  name,
  accept,
  label,
  hint,
  onSelectedChange,
}: {
  id: string;
  name: string;
  accept: string;
  label: string;
  hint: string;
  onSelectedChange: (selected: boolean) => void;
}) {
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
          onChange={(e) => {
            const nextName = e.target.files?.[0]?.name ?? null;
            setFileName(nextName);
            onSelectedChange(Boolean(nextName));
          }}
        />
        <label htmlFor={id} className="pill-btn pill-btn--sm file-input__label">
          ファイルを選ぶ
        </label>
        <span className={`file-input__name${fileName ? " file-input__name--set" : ""}`}>{fileName ?? "未選択"}</span>
      </div>
      <div className="field-hint">{hint}</div>
    </div>
  );
}

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCompanyDatasetAction, initialState);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const trackFile = (name: string) => (selected: boolean) => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (selected) next.add(name); else next.delete(name);
      return next;
    });
  };

  return (
    <form action={formAction}>
      <FileField
        id="sitesCsv"
        name="sitesCsv"
        accept=".csv,text/csv"
        label="① 拠点一覧(sites.csv)"
        hint="拠点名・業種・所在地を記入したCSVです。"
        onSelectedChange={trackFile("sitesCsv")}
      />

      <FileField
        id="natureInterfacesCsv"
        name="natureInterfacesCsv"
        accept=".csv,text/csv"
        label="② 自然との接点の調査結果(nature-interfaces.csv)"
        hint="拠点ごとの外部データベース照会結果を記入したCSVです。"
        onSelectedChange={trackFile("natureInterfacesCsv")}
      />

      <FileField
        id="engagementConfigJson"
        name="engagementConfigJson"
        accept=".json,application/json"
        label="③ 評価・判断の設定(engagement-config.json)"
        hint="詳細評価の対象・投資判断の前提を記入したJSONです。"
        onSelectedChange={trackFile("engagementConfigJson")}
      />

      <button type="submit" className="pill-btn pill-btn--primary" disabled={pending || selectedFiles.size < 3}>
        {pending ? "検証しています…" : "検証して取り込む"}
      </button>

      {state.errors && state.errors.length > 0 && (
        <div style={{ marginTop: 16 }} role="alert">
          <div className="section-label" style={{ color: "var(--brick)" }}>
            取り込めませんでした({state.errors.length}件)
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {state.errors.map((error) => (
              <li key={error} style={{ fontSize: 12.5, color: "var(--brick)" }}>
                {error}
              </li>
            ))}
          </ul>
          <p className="tooltip-note">
            1件でもエラーがあると取り込みません。どこまで入ったか分からない状態を作らないためです。
          </p>
        </div>
      )}

      {state.importedSiteCount !== undefined && (
        <div style={{ marginTop: 16 }} role="status">
          <div className="section-label" style={{ color: "var(--accent-ink)" }}>
            拠点{state.importedSiteCount}件を取り込みました
          </div>
          {state.unmapped && state.unmapped.length > 0 && (
            <>
              <p className="tooltip-note" style={{ marginTop: 8 }}>
                以下は取り込みましたが、まだ計算に反映していません。反映されていることを前提に読まないでください。
              </p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {state.unmapped.map((field) => (
                  <li key={field} style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                    {field}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
