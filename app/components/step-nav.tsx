/**
 * 画面末尾の「次にやることバー」(指示01の3点目 → 第3版 C-03で状態連動に拡張)。
 *
 * 一本道の工程の順序は、常設ナビの番号やステッパーではなく
 * 「並び順・見出し」と「各画面末尾のこのリンク」で伝える。初見者には道しるべ、
 * 常連には単なる移動手段として働き、どちらにもノイズにならない。
 * 工程の進捗そのもの(どこまで進んだか)はホームだけが担う(指示04)。
 *
 * C-03:前後リンクの上に「この画面でやること」を出す。判定は
 * `lib/pipeline/open-tasks.ts` の `deriveOpenTasks` をそのまま使い、ホームの
 * 「次にやること」と同一ソースを保つ(導出をこちらで再実装しない)。
 * 次リンクには `deriveStepContext` が返す実データの1行を添える。
 */

import Link from "next/link";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { deriveOpenTasks, deriveStepContext } from "@/lib/pipeline/open-tasks";

/** 業務順の6ステップ。ナビ(nav.tsx)の並びと同じ順序を保つこと。 */
const FLOW = [
  { href: "/sites", label: "データと拠点の登録" },
  { href: "/assessment", label: "評価対象の絞り込み" },
  { href: "/valuation", label: "価値の算定と代表値の選択" },
  { href: "/financial-bridge", label: "財務への影響" },
  { href: "/decision", label: "対策と判定" },
  { href: "/disclosure", label: "開示への反映" },
];

export function StepNav({ current, result }: { current: string; result: DemoPipelineResult }) {
  const index = FLOW.findIndex((step) => step.href === current);
  if (index === -1) return null;

  const prev = index > 0 ? FLOW[index - 1] : null;
  const next = index < FLOW.length - 1 ? FLOW[index + 1] : null;

  /**
   * 第4版 D-11-1:タスクの一覧は画面ヘッダー直下の頭出しバナー(task-banner.tsx)へ移した。
   * ここ(画面末尾)は前後リンク+完了/残件の一言だけに簡素化する。同じ一覧を
   * 上下2箇所に出すと、末尾の一覧のほうが古い習慣で「正」と誤解されるため。
   */
  const openTaskCount = deriveOpenTasks(result).filter((task) => task.href === current).length;
  const nextContext = next ? deriveStepContext(result, next.href) : null;

  return (
    <div className="step-bar">
      <div className="step-bar__tasks">
        {openTaskCount > 0 ? (
          <p className="step-bar__done">
            この画面でやることが{openTaskCount}件残っています(内容は画面上部のバナーへ)。
          </p>
        ) : (
          <p className="step-bar__done">この画面での操作は完了しています。</p>
        )}
      </div>

      <nav className="step-nav" aria-label="前後の画面">
        {prev ? (
          <Link href={prev.href} className="step-nav__link">
            ← 前:{prev.label}
          </Link>
        ) : (
          <Link href="/" className="step-nav__link">
            ← ホーム
          </Link>
        )}
        {next ? (
          <Link href={next.href} className="step-nav__link step-nav__link--next">
            次:{next.label} →{nextContext && <small className="step-nav__context">{nextContext}</small>}
          </Link>
        ) : (
          <Link href="/" className="step-nav__link step-nav__link--next">
            ホームへ戻る →<small className="step-nav__context">進捗と分かったことをホームでまとめて確認できます。</small>
          </Link>
        )}
      </nav>
    </div>
  );
}
