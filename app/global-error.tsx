"use client"; // Error boundaryはClient Componentである必要がある

import { useEffect } from "react";
import Link from "next/link";

/**
 * ルートレイアウト自体が失敗したときの受け皿(第4版 D-16)。
 *
 * `app/error.tsx` は同じ階層の `layout.tsx` を包まない。PRISMのルートレイアウトは
 * 最新runを読んでナビの状態表示を作る(`getNeedsAttentionHrefs`)ため、
 * **レイアウト側で失敗した場合は `error.tsx` では受け止められない。**
 *
 * この画面はルートレイアウトを置き換えるため、自前の `<html>`・`<body>` と
 * 最低限のスタイルを持つ必要がある(globals.cssは適用されない)。
 * 参照: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 *      「Global Error」
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          background: "#f2f3ef",
          color: "#16233a",
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <title>問題が発生しました — PRISM</title>
        <main
          style={{
            background: "#ffffff",
            border: "1px solid #d9dcd2",
            borderRadius: 8,
            padding: "28px 32px",
            maxWidth: 520,
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>問題が発生しました</h1>
          <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.9, color: "#4c5a6e" }}>
            直前の操作は保存されていません。データは変更前の状態のままです。
            もう一度お試しいただくか、ホームに戻って別の画面からお進みください。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                background: "#33564a",
                color: "#ffffff",
                border: "1px solid #33564a",
                borderRadius: 999,
                padding: "7px 16px",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              再試行する
            </button>
            <Link
              href="/"
              style={{
                background: "#ffffff",
                color: "#16233a",
                border: "1px solid #d9dcd2",
                borderRadius: 999,
                padding: "7px 16px",
                fontSize: 12.5,
                textDecoration: "none",
              }}
            >
              ホームへ戻る
            </Link>
          </div>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11.5, color: "#8b95a3" }}>
              サポートへの連絡時にお伝えいただく記録番号:{error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
