import type { ReactNode } from "react";
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
  return (
    <div className="card" id={id}>
      {(title || headExtra) && (
        <div className="card__head">
          <div className="card__title">
            {title}
            {subtitle && <small>{subtitle}</small>}
          </div>
          {headExtra}
        </div>
      )}
      <div className="card__body" style={padBody ? undefined : { padding: 0 }}>
        {children}
      </div>
      {foot && <div className="card__foot">{foot}</div>}
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
    <span className="term" title={note}>
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
