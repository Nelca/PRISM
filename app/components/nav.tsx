"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * サイドナビ(指示01)。
 *
 * 番号付きのステッパーも完了マークも置かない。初回にしか情報価値がなく、
 * 複数年・毎四半期の反復利用では視覚ノイズに転じるため。順序は
 * 「業務順の並び」と「動詞のグループ見出し」だけで暗黙に伝える。
 */
const NAV = [
  {
    group: "評価する",
    items: [
      { href: "/sites", label: "拠点データの登録", sub: "CSV一括または1件ずつ" },
      { href: "/assessment", label: "評価対象の絞り込み", sub: "詳細評価に進む課題を決める" },
      { href: "/valuation", label: "価値の算定", sub: "複数の方法を比べて代表値を選ぶ" },
    ],
  },
  {
    group: "判断する",
    items: [
      { href: "/financial-bridge", label: "財務への影響", sub: "利益・リスクへの反映" },
      { href: "/decision", label: "対策と判定", sub: "投資の結論が変わるかを確認" },
    ],
  },
  {
    group: "開示する",
    items: [{ href: "/disclosure", label: "開示への反映", sub: "記載内容と根拠の整合" }],
  },
];

/** 業務フローの外にある参照画面(指示05)。ステップ列と混ぜず、ナビ下部に置く。 */
const REFERENCE = { href: "/ledger", label: "記録(監査証跡)", sub: "誰がいつ何を選んだか" };

interface NavProps {
  /**
   * 未完了の必須判断がある画面のhref集合(指示01-4)。layout.tsx(server)が
   * `deriveOpenTasks` から導出して渡す。この配列はサーバー専用モジュールを
   * 経由しない、ただの文字列配列なのでclient componentへのpropsとして渡せる。
   */
  needsAttentionHrefs: string[];
}

export function Nav({ needsAttentionHrefs }: NavProps) {
  const pathname = usePathname();
  const needsAttention = new Set(needsAttentionHrefs);

  const item = (entry: { href: string; label: string; sub: string }) => (
    <Link
      key={entry.href}
      href={entry.href}
      className={`nav__item${pathname === entry.href ? " active" : ""}`}
    >
      <div className="nav__label">
        {entry.label}
        <small>{entry.sub}</small>
      </div>
      {needsAttention.has(entry.href) && (
        <span className="nav__dot" role="img" aria-label="未完了の判断があります" title="未完了の判断があります" />
      )}
    </Link>
  );

  return (
    <div className="nav">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="nav__section-label">{section.group}</div>
          {section.items.map(item)}
        </div>
      ))}

      <div className="nav__divider" />
      {item(REFERENCE)}

      <div className="nav__divider" />
      {/* IA-04:オリエンテーション層(/guide)への再訪導線。初見者の主導線はホーム冒頭の
          リンクが担うため、ここは参照層としてホームと並べて置くだけに留める。 */}
      <div className="nav__foot">
        <Link href="/">ホーム</Link>
        <span className="nav__foot-sep" aria-hidden="true">
          ・
        </span>
        <Link href="/guide" className={pathname === "/guide" ? "nav__foot-active" : undefined}>
          はじめに(使い方)
        </Link>
      </div>
    </div>
  );
}
