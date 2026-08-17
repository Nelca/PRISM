"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { setDepthOverrideAction, type DepthOverrideFormState } from "./actions";

const initialState: DepthOverrideFormState = {};

/**
 * 評価の深さの切替(B-02、第3版 C-02で成功時の確認を追加)。
 *
 * 以前は独立した2つのボタンで、(1)ボタンに見えない、(2)セル幅不足で文字が縦折れする、
 * (3)非選択側が単なるラベルに見える、という3つの問題があった。`.seg-control` で
 * 1つに結合し、選択側をaccent塗りで示す。送信中はクリックした側にだけ処理中表示を出し、
 * 二度押しを防ぐ(以前はopacityのみで見た目の変化に乏しかった)。
 *
 * C-02:切替後は再レンダリングで行の背景色が変わるだけで、「操作が効いたのか」も
 * 「その結果どこで何が見られるのか」も分からなかった。Server Actionの戻り値
 * (`state.applied`)を受けて、コントロール直下にインライン確認と次の行き先を出す。
 *
 * この確認が消えない理由:`revalidatePath` をServer Function内で呼ぶと、Next.jsは
 * 1つのレスポンスに「アクションの戻り値」と「再レンダリング済みのRSC Payload」の
 * 両方を載せる(node_modules/next/dist/docs/01-app/02-guides/server-actions.md
 * 「A single response carries data and UI」)。戻り値は useActionState の state として
 * 保持され、サーバー側の再レンダリングでは client component の state は破棄されない。
 * 一覧の各行は materialIssueId をkeyにしており並び順も優先度で安定しているため、
 * 再レンダリング後もこのコンポーネントは同じ位置で再利用され、stateが残る。
 */
export function DepthToggle({ materialIssueId, currentDepth }: { materialIssueId: string; currentDepth: "deep_dive" | "screening" }) {
  const [state, formAction, pending] = useActionState(setDepthOverrideAction, initialState);
  // どちらのボタンが押されたか(pendingの間だけ「処理中…」を出す側の判定に使う)。
  const [pendingMode, setPendingMode] = useState<"demote" | "promote" | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setPendingMode(null);
    }
    wasPending.current = pending;
  }, [pending]);

  // 別の行の操作で state が混ざることはないが、念のため自分の行の結果だけを出す。
  const applied = !pending && state?.applied?.materialIssueId === materialIssueId ? state.applied : null;

  return (
    <div>
      <form action={formAction} className="seg-control">
        <input type="hidden" name="materialIssueId" value={materialIssueId} />
        <button
          type="submit"
          name="mode"
          value="demote"
          disabled={pending}
          aria-pressed={currentDepth === "screening"}
          onClick={() => setPendingMode("demote")}
          className={`seg-control__btn${currentDepth === "screening" ? " seg-control__btn--active" : ""}`}
        >
          {pending && pendingMode === "demote" ? "処理中…" : "概算評価"}
        </button>
        <button
          type="submit"
          name="mode"
          value="promote"
          disabled={pending}
          aria-pressed={currentDepth === "deep_dive"}
          onClick={() => setPendingMode("promote")}
          className={`seg-control__btn${currentDepth === "deep_dive" ? " seg-control__btn--active" : ""}`}
        >
          {pending && pendingMode === "promote" ? "処理中…" : "詳細評価"}
        </button>
      </form>

      {applied && (
        <p className="form-ok" role="status">
          {applied.mode === "promote" ? (
            <>
              詳細評価に切り替えました。この課題は貨幣価値の算定〜投資判断への反映の対象になります。算定結果は
              <Link href="/valuation">価値の算定と代表値の選択</Link>
              で確認できます →
            </>
          ) : applied.mode === "demote" ? (
            <>
              概算評価に戻しました。この課題は自動の優先度づけまでとなり、
              <Link href="/valuation">価値の算定</Link>
              以降の対象から外れます。
            </>
          ) : (
            <>自動判定に戻しました。優先度の算定結果に従って評価の深さが決まります。</>
          )}
        </p>
      )}
      {state?.error && <span className="form-error">{state.error}</span>}
    </div>
  );
}
