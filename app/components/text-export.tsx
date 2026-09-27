"use client";

import { useState } from "react";

/** テキスト・CSVをクリップボードへコピー、またはファイルとして保存する。操作結果は近くに通知する。 */
export function TextExport({
  text,
  filename,
  copyLabel = "下書きをコピー",
  downloadLabel = "テキストで保存",
}: {
  text: string;
  filename: string;
  copyLabel?: string;
  downloadLabel?: string;
}) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("コピーしました。");
    } catch {
      setStatus("コピーできませんでした。ファイル保存をご利用ください。");
    }
  }

  function download() {
    const type = filename.endsWith(".csv") ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("ファイルの保存を開始しました。");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="pill-btn pill-btn--accent" onClick={copy}>{copyLabel}</button>
        <button type="button" className="pill-btn" onClick={download}>{downloadLabel}</button>
      </div>
      <p role="status" className="field-hint">{status}</p>
    </div>
  );
}
