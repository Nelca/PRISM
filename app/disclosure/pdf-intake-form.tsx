"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { extractDisclosurePdfAction, type PdfIntakeFormState } from "./actions";

const initialState: PdfIntakeFormState = {};

export function PdfIntakeForm() {
  const [state, formAction, pending] = useActionState(extractDisclosurePdfAction, initialState);
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="disclosurePdf">過去の統合報告書・開示PDF</label>
        <input id="disclosurePdf" name="disclosurePdf" type="file" accept=".pdf,application/pdf" required aria-invalid={state.error ? "true" : undefined} onChange={(event) => setHasFile(Boolean(event.target.files?.[0]))} />
        <div className="field-hint">
          AIはPDFから主張(claim)を抽出するだけで、根拠の十分性は判定しません。判定は既存のルールベース処理が行います。
        </div>
      </div>

      <button type="submit" className="pill-btn pill-btn--primary" disabled={pending || !hasFile}>
        {pending ? "抽出しています…" : "PDFから抽出する"}
      </button>

      {state.error && (
        <p className="tooltip-note" style={{ color: "var(--brick)", marginTop: 10 }} role="alert">
          {state.error}
        </p>
      )}

      {state.extractedCount !== undefined && (
        <div style={{ marginTop: 16 }} role="status">
          <div className="section-label" style={{ color: "var(--accent-ink)" }}>
            {state.extractedCount}件の主張を抽出しました
          </div>
          {state.lowConfidenceCount !== undefined && state.lowConfidenceCount > 0 && (
            <p className="tooltip-note" style={{ marginTop: 6 }}>
              うち{state.lowConfidenceCount}件は抽出確信度が低いため、指摘の一覧で内容を確認してください。
            </p>
          )}
          {state.failedPages && state.failedPages.length > 0 && (
            <p className="tooltip-note" style={{ marginTop: 6, color: "var(--brick)" }}>
              抽出できなかったページがあります(ページ {state.failedPages.join(", ")})。スキャン画像等でテキスト層が無い可能性があります。
            </p>
          )}
          <p className="form-ok">
            <Link href="/disclosure">抽出した指摘を確認する →</Link>
          </p>
        </div>
      )}
    </form>
  );
}
