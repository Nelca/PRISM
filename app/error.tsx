"use client"; // Error boundaryはClient Componentである必要がある

import { useEffect } from "react";
import Link from "next/link";

/**
 * クラッシュ時の回復動線(第4版 D-16)。
 *
 * サーバー側で想定外の例外が起きたとき、Next.jsの素のエラー画面ではなく、
 * 既存のデザイントークンで「何が起きたか/操作は保存されていないこと/次にできること」を出す。
 *
 * **通常操作でここに落ちることは無い前提の最後の受け皿である。**
 * 利用者の入力が原因で計算が通らない場合は、Server Action側の事前検証(D-01)が
 * DBに何も書かずにフォーム内のエラーとして返す。ここに来るのはそれ以外の想定外の障害。
 *
 * `unstable_retry()` は、このセグメントの再取得・再レンダリングを試みる
 * (`reset()` は再取得せず状態だけを消すため、サーバー起因の障害には効かない)。
 * 参照: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 */
export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // 例外の中身は画面に出さず、サーバー/ブラウザのログにだけ残す。
    console.error(error);
  }, [error]);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">問題が発生しました</h1>
        </div>
        <p className="screen__lead">この画面を表示できませんでした</p>
      </div>

      <div className="card">
        <div className="card__body">
          <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.9 }}>
            直前の操作は保存されていません。データは変更前の状態のままです。
            もう一度お試しいただくか、ホームに戻って別の画面からお進みください。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="pill-btn pill-btn--primary" onClick={() => unstable_retry()}>
              再試行する
            </button>
            <Link href="/" className="pill-btn">
              ホームへ戻る
            </Link>
          </div>
          {error.digest && (
            <p className="id-note" style={{ marginTop: 12 }}>
              サポートへの連絡時にお伝えいただく記録番号:{error.digest}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
