"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { removeSiteAction, type AddSiteFormState } from "./actions";

const initialState: AddSiteFormState = {};

/**
 * 登録済み拠点の削除(指示B-03)。
 *
 * 一覧の行から直接消えると誤操作が取り返しのつかない印象を与えるため、確認モーダルを挟む。
 * 実際には過去のrun・台帳・監査証跡は追記のみで残るので、その事実を確認文に明記する
 * (「何が消えて何が残るのか」が分からないまま押させない)。
 */
export function RemoveSiteButton({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(removeSiteAction, initialState);
  const wasPending = useRef(false);
  const pendingRef = useRef(pending);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    pendingRef.current = pending;
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingRef.current) return;
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className="pill-btn pill-btn--sm" onClick={() => setOpen(true)}>
        削除
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => !pending && e.target === e.currentTarget && setOpen(false)}>
          <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-description`}>
            <div className="modal-head">
              <div>
                <h3 id={`${uid}-title`}>拠点を削除しますか</h3>
                <p id={`${uid}-description`}>評価の対象から外れます</p>
              </div>
              <button type="button" className="modal-close" aria-label="閉じる" disabled={pending} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <form action={formAction}>
              <input type="hidden" name="siteId" value={siteId} />
              {/* 確認済みであることをサーバー側でも確かめる(画面を経由しない送信を受け付けない)。 */}
              <input type="hidden" name="confirmed" value="yes" />
              <div className="modal-body">
                <p style={{ margin: 0, fontSize: 13 }}>
                  「<b>{siteName}</b>」を評価対象の一覧から削除します。
                </p>
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>
                  削除後は、この拠点は次回以降の評価に含まれません。
                  <b>過去の計算結果・監査証跡は消えません。</b>
                  いつ誰が何を根拠に判定したかの記録は残り、削除したこと自体も記録に残ります。
                </p>
                {state?.error && <p className="form-error" role="alert">{state.error}</p>}
              </div>
              <div className="modal-foot">
                <button type="button" className="pill-btn" disabled={pending} onClick={() => setOpen(false)}>
                  キャンセル
                </button>
                <button type="submit" className="pill-btn pill-btn--primary" disabled={pending}>
                  {pending ? "削除中…" : "削除する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
