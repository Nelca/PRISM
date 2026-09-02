import { Children, isValidElement, type ReactNode } from "react";
import type { TagVariant } from "./tag-utils";

/**
 * 純粋な表示専用の部品(hooks・イベントハンドラを使わない)。Server Componentのまま保つ。
 *
 * 2026-08-17レビュー第5版:以前はこのファイル全体に"use client"が付いており、Card等の
 * 表示専用部品までクライアント境界に押し出されていた。Server Componentから
 * `<Card><A/><B/></Card>`のように複数の子要素を直に渡すと、RSCのシリアライズで
 * children配列化が起き、Reactが「Each child in a list should have a unique key prop」
 * という(実害のない)警告をコンソールに出し続けていた。hooksを必要とする部品
 * (GuideBox・GuideButton・ModalForm・PillButton)は `./ui-client` に分離し、
 * ここでは再エクスポートするだけにする(既存のimport元は変更不要)。
 */
export { GuideBox, GuideButton, ModalForm, PillButton } from "./ui-client";

function containsUnwrappedDataTable(node: ReactNode): boolean {
  return Children.toArray(node).some((child) => {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) return false;
    if (child.type === TableScroll || child.props.className?.split(" ").includes("table-scroll")) return false;
    if (child.type === "table" && child.props.className?.split(" ").includes("data-table")) return true;
    return containsUnwrappedDataTable(child.props.children);
  });
}

export function Card({
  id,
  title,
  subtitle,
  headExtra,
  foot,
  children,
  padBody = true,
}: {
  /** ページ内アンカー(頭出しバナーや比較ペア切替のリンク先。第4版 D-07・D-11)。 */
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  headExtra?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  padBody?: boolean;
}) {
  const titleId = id && title ? `${id}-title` : undefined;
  const hasDataTable = containsUnwrappedDataTable(children);
  return (
    <section className="card" id={id} aria-labelledby={titleId}>
      {(title || headExtra) && (
        <div className="card__head">
          <h2 className="card__title" id={titleId}>
            {title}
            {subtitle && <small>{subtitle}</small>}
          </h2>
          {headExtra}
        </div>
      )}
      <div
        className="card__body"
        style={padBody ? undefined : { padding: 0 }}
        role={hasDataTable ? "region" : undefined}
        aria-label={hasDataTable ? `${typeof title === "string" ? title : "データ"}の表（横スクロールできます）` : undefined}
        tabIndex={hasDataTable ? 0 : undefined}
      >
        {children}
      </div>
      {foot && (
        <details className="card__foot">
          <summary>補足</summary>
          <div>{foot}</div>
        </details>
      )}
    </section>
  );
}

export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function Tag({ variant, title, children }: { variant: TagVariant; title?: string; children: ReactNode }) {
  return (
    <span className={`tag tag--${variant}`} title={title}>
      {children}
    </span>
  );
}

/** 画面タイトル直下に常時表示する「この画面ですること」一文(指示10)。 */
export function ScreenLead({ children }: { children: ReactNode }) {
  return <p className="screen__lead">{children}</p>;
}

/**
 * 一行説明つきの用語(第4版 D-12)。点線下線+titleで、hoverすると説明が読める。
 * 説明文は app/components/labels.ts の FINANCIAL_TERM_NOTE 等の辞書から渡すこと
 * (その場で文章を発明しない)。
 */
export function Term({ children, note }: { children: ReactNode; note: string }) {
  return (
    <span
      className="term"
      title={note}
      data-note={note}
      tabIndex={0}
      aria-label={typeof children === "string" ? `${children}: ${note}` : note}
    >
      {children}
    </span>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className="kv__v">{v}</span>
    </div>
  );
}

export function Stat({ label, value, unit }: { label: ReactNode; value: ReactNode; unit?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value num">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}
