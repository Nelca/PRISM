"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Nav } from "./nav";

const ROUTE_TITLES = [
  ["/portfolio", "環境・資源の統合管理"],
  ["/sites", "拠点とデータ"],
  ["/assessment", "評価対象"],
  ["/valuation", "価値算定"],
  ["/analysis", "算定結果の比較"],
  ["/evidence", "算定根拠"],
  ["/financial-bridge", "財務影響"],
  ["/decision", "対策と判定"],
  ["/disclosure", "開示"],
  ["/ledger", "記録"],
  ["/guide", "PRISMとは・使い方"],
] as const;

export function AppShell({
  companyName,
  needsAttentionHrefs,
  children,
}: {
  companyName: string;
  needsAttentionHrefs: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const routeTitle = ROUTE_TITLES.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "ダッシュボード";

  useEffect(() => {
    if (!navigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigationRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !navigationRef.current) return;
      const focusable = Array.from(
        navigationRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navigationOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>

      <div className="demo-banner"><span className="demo-banner__dot" aria-hidden="true" /> デモワークスペース <span>架空企業のデータで操作を試せます</span></div>

      <header className="app-header">
        <button
          ref={menuButtonRef}
          type="button"
          className="menu-button"
          aria-label="メニューを開く"
          aria-controls="primary-navigation"
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen(true)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        <Link href="/" className="mobile-brand" aria-label="PRISM ホーム">
          <span className="brand-symbol" aria-hidden="true">P</span>
          <span>PRISM</span>
        </Link>

        <div className="header-context">
          <span className="header-context__mark" aria-hidden="true" />
          <span className="header-context__title">{routeTitle}</span>
        </div>
        <div className="header-meta">
          <span>{companyName}</span>
          <span className="header-context__period">FY2027</span>
        </div>
        <div className="user-chip" aria-label="利用者 宮里様 サステナビリティ推進室">
          <span className="user-chip__avatar" aria-hidden="true">宮</span>
          <span className="user-chip__label">宮里 様</span>
        </div>
      </header>

      {navigationOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="メニューを閉じる"
          onClick={() => {
            setNavigationOpen(false);
            menuButtonRef.current?.focus();
          }}
        />
      )}

      <aside
        ref={navigationRef}
        id="primary-navigation"
        className={`app-sidebar${navigationOpen ? " app-sidebar--open" : ""}`}
        aria-label="アプリケーションナビゲーション"
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a")) setNavigationOpen(false);
        }}
      >
        <div className="sidebar-head">
          <Link href="/" className="brand" aria-label="PRISM ホーム">
            <span className="brand-symbol" aria-hidden="true">P</span>
            <span>
              <strong className="brand__name">PRISM</strong>
              <small className="brand__tag">自然関連財務評価</small>
            </span>
          </Link>
          <button
            type="button"
            className="sidebar-close"
            aria-label="メニューを閉じる"
            onClick={() => {
              setNavigationOpen(false);
              menuButtonRef.current?.focus();
            }}
          >
            ×
          </button>
        </div>
        <Nav needsAttentionHrefs={needsAttentionHrefs} />
      </aside>

      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
