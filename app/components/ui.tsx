"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { TagVariant } from "./tag-utils";

/**
 * Guideの開閉状態はlocalStorage(Reactの外側にある状態)に保存する。setStateをuseEffect内から
 * 直接呼ぶと「calling setState synchronously within an effect」でlintに引っかかる上、
 * そもそもReact外部の値を読むための正攻法ではない。useSyncExternalStoreを使うと、
 * サーバーでは常に既定値を返し、クライアントの実際の値と食い違う場合はhydration後に
 * 安全に補正される(hydrationエラーにはならない)。
 */
type GuideStoreListener = () => void;
const guideStoreListeners = new Set<GuideStoreListener>();

function readGuideOpen(storageKey: string): boolean {
  try {
    // 値が "1"(=閉じたことがある)でなければ開く。未設定(初回訪問)は常に開く。
    return window.localStorage.getItem(storageKey) !== "1";
  } catch {
    // localStorageが使えない環境(プライベートモード等)では、開いた状態のままにする。
    return true;
  }
}

function subscribeGuideStore(listener: GuideStoreListener): () => void {
  guideStoreListeners.add(listener);
  return () => guideStoreListeners.delete(listener);
}

function setGuideOpen(storageKey: string, open: boolean) {
  try {
    if (open) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, "1");
    }
  } catch {
    // 記憶できなくても動作は継続する(次回もまた開いた状態で表示されるだけ)。
  }
  guideStoreListeners.forEach((listener) => listener());
}

export function Card({
  title,
  subtitle,
  headExtra,
  foot,
  children,
  padBody = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  headExtra?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  padBody?: boolean;
}) {
  return (
    <div className="card">
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

export function PillButton({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent"; size?: "sm" }) {
  const classes = ["pill-btn"];
  if (variant) classes.push(`pill-btn--${variant}`);
  if (size) classes.push(`pill-btn--${size}`);
  if (className) classes.push(className);
  return <button {...props} className={classes.join(" ")} />;
}

/**
 * 画面ガイド(指示10・B-01で構造を分離)。
 *
 * 初回訪問時は開いた状態で見せ、閉じたらlocalStorageに記憶する(キーは画面別=pathname)。
 * 2回目以降の訪問では、閉じた記憶があれば閉のまま・なければまた開いた状態で見せる。
 *
 * サーバーでは常に「開」を返し(初回訪問の既定値と一致)、クライアントの実際の値が
 * それと食い違う場合(=以前この画面で閉じたことがある)はhydration後にReactが
 * 安全に補正する。useSyncExternalStoreはこの種のReact外部状態の同期のために
 * React自身が用意している仕組みで、useEffect+setStateのように追加の再レンダーの
 * 原因になったり、lintの set-state-in-effect に触れたりしない。
 *
 * B-01:以前は「iボタン」と「開いたガイドボックス」を1つのフラグメントで返し、
 * `.screen__title-row`(display:flex)の子として両方が並んでいた。ガイドが開くと
 * (初回訪問時は必ず開く)ボックスがタイトルと同じ行に入り、h1が圧縮されて縦折れする
 * 構造欠陥があった。GuideButton(トリガー)とGuideBox(ボックス)に分離し、
 * 呼び出し側で「title-rowの中にButtonだけ・ScreenLeadの下にBoxだけ」を全幅で
 * 描画できるようにする。両者は同じpathname由来のstorageKeyを見るため、
 * 状態はprops経由の受け渡しなしに自然に同期する。
 */
function useGuideOpenState(): [boolean, (open: boolean) => void] {
  const pathname = usePathname();
  const storageKey = `prism:guide-closed:${pathname}`;
  const open = useSyncExternalStore(
    subscribeGuideStore,
    () => readGuideOpen(storageKey),
    () => true
  );
  return [open, (next: boolean) => setGuideOpen(storageKey, next)];
}

/** ガイドの開閉トリガー(iボタン)。`.screen__title-row` の中でh1と並べて置く。 */
export function GuideButton() {
  const [open, setOpen] = useGuideOpenState();
  return (
    <button
      type="button"
      className={`info-btn${open ? " active" : ""}`}
      onClick={() => setOpen(!open)}
      aria-label="この画面について"
      aria-expanded={open}
    >
      i
    </button>
  );
}

/** ガイドの本文ボックス。`.screen__title-row` の外(ScreenLeadの下)に全幅で置く。 */
export function GuideBox({ children }: { children: ReactNode }) {
  const [open] = useGuideOpenState();
  if (!open) return null;
  return (
    <div className="guide">
      <div className="guide__icon">i</div>
      <div className="guide__body">
        <div className="guide__label">この画面について</div>
        {children}
      </div>
    </div>
  );
}

/** 画面タイトル直下に常時表示する「この画面ですること」一文(指示10)。 */
export function ScreenLead({ children }: { children: ReactNode }) {
  return <p className="screen__lead">{children}</p>;
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

/**
 * トリガーボタン+モーダル+Server Action呼び出しフォームを1つにまとめた汎用コンポーネント。
 * 送信が成功(error未設定)したらモーダルを自動で閉じる。M4/M6/M7の「理由必須」モーダル群で使う。
 */
interface FormActionState {
  error?: string;
}

export function ModalForm({
  triggerLabel,
  triggerVariant,
  title,
  subtitle,
  action,
  initialState,
  confirmLabel = "確定する",
  hiddenFields,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: "primary" | "accent";
  title: string;
  subtitle?: string;
  action: (prevState: FormActionState, formData: FormData) => Promise<FormActionState>;
  initialState: FormActionState;
  confirmLabel?: string;
  hiddenFields?: Record<string, string>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <PillButton type="button" variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </PillButton>
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <h3>{title}</h3>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <form action={formAction}>
              {hiddenFields &&
                Object.entries(hiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <div className="modal-body">
                {children}
                {state?.error && <p className="form-error">{state.error}</p>}
              </div>
              <div className="modal-foot">
                <button type="button" className="pill-btn" onClick={() => setOpen(false)}>
                  キャンセル
                </button>
                <PillButton type="submit" variant="accent" disabled={pending}>
                  {pending ? "処理中…" : confirmLabel}
                </PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
