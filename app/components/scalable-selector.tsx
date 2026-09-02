"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * 対象切替セレクタ(第4版 D-06 → 第6版 D-21で全面改稿)。
 *
 * ③の課題切替が使う。第4版の実装は「8件以下はピル・9件以上は検索リスト」という
 * **閾値でUIの形が変わる設計**だったが、これは (a)デモの件数では切替後の形を検証できない、
 * (b)閾値を跨ぐと操作の習熟が引き継がれない、(c)閾値付近で画面が安定しない、という点で
 * 原則(「N件になっても成立するUIだけを残す」)の実装として不十分だった(第6版§0の原因1)。
 *
 * 本版では**件数に関わらず常に同じ形**にする:
 *   - 閉:選択中の対象を示すトリガーボタン1つ(全件数と要対応件数を併記)
 *   - 開:検索ボックス+スクロールする選択リスト
 * 3件でも100件でも操作は同一。要対応ドット(C-05:代表値未選択など)は
 * トリガーとリスト行の両方に出す。
 *
 * 遷移はすべて<Link>(URLのクエリで対象を切り替える既存方式)。選択状態を
 * このコンポーネントが持たないため、サーバー側の描画とズレない。
 */

export interface SelectorItem {
  id: string;
  label: string;
  href: string;
  active: boolean;
  /** 要対応ドットを出すか(未選択・残タスクなど)。 */
  attention?: boolean;
  /** ドットのaria-label / title(例「代表値が未選択です」)。 */
  attentionLabel?: string;
}

function AttentionDot({ label }: { label?: string }) {
  return <span className="pill-btn__dot" role="img" aria-label={label ?? "要対応"} title={label ?? "要対応"} />;
}

export function ScalableSelector({
  items,
  searchPlaceholder = "拠点名・カテゴリで絞り込み",
}: {
  items: SelectorItem[];
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // 外側クリック・Escで閉じる(開いている間だけリスナーを張る)。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length <= 1) return null;

  const active = items.find((item) => item.active);
  const attentionCount = items.filter((item) => item.attention).length;
  const normalized = query.trim().toLowerCase();
  const filtered = normalized === "" ? items : items.filter((item) => item.label.toLowerCase().includes(normalized));

  return (
    <div className="combo" ref={rootRef}>
      <button
        type="button"
        className="combo__trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="combo__value">
          {active?.label ?? "対象を選択"}
          {active?.attention && <AttentionDot label={active.attentionLabel} />}
        </span>
        <span className="combo__meta">
          全{items.length}件
          {attentionCount > 0 && (
            <span className="combo__attention">
              <AttentionDot />
              要対応{attentionCount}件
            </span>
          )}
          <span aria-hidden="true"> {open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="combo__panel">
          <input
            type="search"
            className="combo__search"
            // 開いた直後に絞り込みを打ち始められるようにする(件数が多いときの主動線)。
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <div className="combo__count">
            {filtered.length}/{items.length}件
          </div>
          <ul className="combo__list">
            {filtered.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`combo__item${item.active ? " combo__item--active" : ""}`}
                  aria-current={item.active ? "page" : undefined}
                  title={item.id}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                  {item.attention && <AttentionDot label={item.attentionLabel} />}
                </Link>
              </li>
            ))}
            {filtered.length === 0 && <li className="combo__empty">「{query}」に一致する対象はありません</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
