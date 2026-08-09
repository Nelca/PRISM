"use client";

import { useActionState } from "react";
import { importCompanyDatasetAction, type ImportFormState } from "./actions";

const initialState: ImportFormState = {};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCompanyDatasetAction, initialState);

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="sitesCsv">① 拠点一覧(sites.csv)</label>
        <input id="sitesCsv" name="sitesCsv" type="file" accept=".csv,text/csv" />
        <div className="field-hint">顧客のサステナビリティ/IR部門が記入します。</div>
      </div>

      <div className="field">
        <label htmlFor="natureInterfacesCsv">② 自然との接点の調査結果(nature-interfaces.csv)</label>
        <input id="natureInterfacesCsv" name="natureInterfacesCsv" type="file" accept=".csv,text/csv" />
        <div className="field-hint">PRISM運用チームが外部データベースを照会して記入します。</div>
      </div>

      <div className="field">
        <label htmlFor="engagementConfigJson">③ 評価・判断の設定(engagement-config.json)</label>
        <input id="engagementConfigJson" name="engagementConfigJson" type="file" accept=".json,application/json" />
        <div className="field-hint">深掘り対象・投資判断の前提など。財務部門への確認が必要な項目を含みます。</div>
      </div>

      <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
        {pending ? "検証しています…" : "検証して取り込む"}
      </button>

      {state.errors && state.errors.length > 0 && (
        <div style={{ marginTop: 16 }}>
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
        <div style={{ marginTop: 16 }}>
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
