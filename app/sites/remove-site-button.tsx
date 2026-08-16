"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <button type="button" className="pill-btn pill-btn--sm" onClick={() => setOpen(true)}>
        削除
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <h3>拠点を削除しますか</h3>
                <p>評価の対象から外れます</p>
              </div>
              <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setOpen(false)}>
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
                {state?.error && <p className="form-error">{state.error}</p>}
              </div>
              <div className="modal-foot">
                <button type="button" className="pill-btn" onClick={() => setOpen(false)}>
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
