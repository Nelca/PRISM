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
    group: "評価",
    items: [
      { href: "/sites", label: "拠点とデータ" },
      { href: "/assessment", label: "評価対象" },
      { href: "/valuation", label: "価値算定" },
    ],
  },
  {
    group: "判断",
    items: [
      { href: "/financial-bridge", label: "財務影響" },
      { href: "/decision", label: "対策と判定" },
    ],
  },
  {
    group: "開示",
    items: [{ href: "/disclosure", label: "開示" }],
  },
];

/** 業務フローの外にある参照画面(指示05)。ステップ列と混ぜず、ナビ下部に置く。 */
const REFERENCE = { href: "/ledger", label: "記録" };

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
  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/" && pathname.startsWith(`${href}/`)) ||
    (href === "/valuation" && (pathname === "/analysis" || pathname === "/evidence"));

  const item = (entry: { href: string; label: string }) => (
    <Link
      key={entry.href}
      href={entry.href}
      className={`nav__item${isActive(entry.href) ? " active" : ""}`}
      aria-current={isActive(entry.href) ? "page" : undefined}
    >
      <div className="nav__label">{entry.label}</div>
      {needsAttention.has(entry.href) && (
        <span className="nav__dot" role="img" aria-label="未完了の判断があります" title="未完了の判断があります" />
      )}
      <span className="nav__chevron" aria-hidden="true">›</span>
    </Link>
  );

  return (
    <nav className="nav" aria-label="主要ナビゲーション">
      <div className="nav__primary">
        {item({ href: "/", label: "ダッシュボード" })}
      </div>

      {NAV.map((section, index) => (
        <div className="nav__group" role="group" aria-labelledby={`nav-group-${index}`} key={section.group}>
          <div className="nav__section-label" id={`nav-group-${index}`}>{section.group}</div>
          {section.items.map(item)}
        </div>
      ))}

      <div className="nav__group" role="group" aria-labelledby="nav-group-management">
        <div className="nav__section-label" id="nav-group-management">管理</div>
        {item(REFERENCE)}
      </div>

      <div className="nav__group nav__group--support" role="group" aria-labelledby="nav-group-support">
        <div className="nav__section-label" id="nav-group-support">サポート</div>
        {item({ href: "/guide", label: "PRISMとは・使い方" })}
      </div>
    </nav>
  );
}
