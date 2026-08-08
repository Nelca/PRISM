"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { TagVariant } from "./tag-utils";

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

export function Tag({ variant, children }: { variant: TagVariant; children: ReactNode }) {
  return <span className={`tag tag--${variant}`}>{children}</span>;
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

export function Guide({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`info-btn${open ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="この画面について"
      >
        i
      </button>
      {open && (
        <div className="guide" style={{ marginTop: 12 }}>
          <div className="guide__icon">i</div>
          <div className="guide__body">
            <div className="guide__label">この画面について</div>
            {children}
          </div>
        </div>
      )}
    </>
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
