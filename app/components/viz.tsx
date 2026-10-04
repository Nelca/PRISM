/**
 * 視覚部品キット(2026-10 視覚化リデザイン)。純粋な表示部品(hooks・イベントなし)で
 * Server Component のまま使える。スタイルは app/styles/viz.css。
 *
 * 参照した見せ方: Stripe Dashboard(KPIタイル)、Linear(状態バッジ・ステッパー)、
 * Watershed / Persefoni(カバレッジ・目標対実績・内訳バー)。
 * 規律: 色だけで意味を伝えない(必ず数値・文言を併記)。件数で形を変えない。
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon, STATUS_ICON, type StatusKey } from "./icons";
import type { TagVariant } from "./tag-utils";

const fmtNum = (n: number) => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(n);

/* ---------- KPI タイル(Stripe) ---------- */

export type Tone = "neutral" | "accent" | "ok" | "warn" | "pending";

export function StatGrid({ children, columns }: { children: ReactNode; columns?: number }) {
  return (
    <div className="stat-grid" style={columns ? ({ "--stat-columns": columns } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  note,
  href,
  tone = "neutral",
  icon,
  visual,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  href?: string;
  tone?: Tone;
  icon?: LucideIcon;
  /** 値の下に置く小さな視覚要素(RatioBar・ProgressRing など)。 */
  visual?: ReactNode;
}) {
  const body = (
    <>
      <span className="stat-tile__label">
        {icon && <Icon icon={icon} size={14} />}
        {label}
      </span>
      <span className={`stat-tile__value num${typeof value === "string" && value.length > 8 ? " stat-tile__value--text" : ""}`}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {visual && <span className="stat-tile__visual">{visual}</span>}
      {note && <span className="stat-tile__note">{note}</span>}
    </>
  );
  const className = `stat-tile stat-tile--${tone}${href ? " stat-tile--link" : ""}`;
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ---------- 状態バッジ(Linear) ---------- */

/** 状態語 → variant(ok=完了/またがない, accent=進行中, warn=要対応/またぐ, pending=保留)。 */
export const STATUS_VARIANT: Record<StatusKey, TagVariant> = {
  done: "ok",
  active: "accent",
  attention: "warn",
  pending: "pending",
};

export function StatusBadge({
  variant,
  status,
  children,
  title,
  icon = false,
}: {
  /** 直接 variant を渡す(Tier等)か、status(done/active/attention/pending)から導く。 */
  variant?: TagVariant;
  status?: StatusKey;
  children: ReactNode;
  title?: string;
  /** true のとき状態アイコンをドットの代わりに表示。 */
  icon?: boolean;
}) {
  const v = variant ?? (status ? STATUS_VARIANT[status] : "neutral");
  return (
    <span className={`status-badge status-badge--${v}`} title={title}>
      {icon && status ? <Icon icon={STATUS_ICON[status]} size={13} /> : <span className="status-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------- 比率バー・リング(Watershed coverage) ---------- */

export function RatioBar({
  value,
  total,
  label,
  tone = "accent",
  showText = true,
  unit = "件",
}: {
  value: number;
  total: number;
  /** aria-label の主語(例: 「代表値の選択」)。 */
  label: string;
  tone?: Tone;
  showText?: boolean;
  unit?: string;
}) {
  const safeTotal = Math.max(total, 0);
  const safeValue = Math.min(Math.max(value, 0), safeTotal);
  const segmented = safeTotal > 0 && safeTotal <= 20;
  const pct = safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;
  return (
    <span className={`ratio ratio--${tone}`} role="img" aria-label={`${label} ${safeValue}/${safeTotal}${unit}`}>
      <span className="ratio__track" aria-hidden="true">
        {segmented
          ? Array.from({ length: safeTotal }, (_, i) => <span key={i} className={`ratio__seg${i < safeValue ? " ratio__seg--on" : ""}`} />)
          : <span className="ratio__fill" style={{ width: `${pct}%` }} />}
      </span>
      {showText && (
        <span className="ratio__text num">
          {safeValue}/{safeTotal}
          <small>{unit}</small>
        </span>
      )}
    </span>
  );
}

export function ProgressRing({
  value,
  total,
  size = 40,
  label,
  tone = "accent",
  text,
  showText = true,
}: {
  value: number;
  total: number;
  size?: number;
  label: string;
  tone?: Tone;
  /** 中央に出す短い文字(既定は value/total)。 */
  text?: ReactNode;
  /** 同じ数値を隣に大きく出している場合(StatTile の visual 等)は false にして重複を避ける。 */
  showText?: boolean;
}) {
  const stroke = Math.max(4, Math.round(size / 8));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  const labelOutside = showText && size < 40;
  return (
    <span
      className={`progress-ring progress-ring--${tone}${labelOutside ? " progress-ring--label-outside" : ""}`}
      role="img"
      aria-label={`${label} ${value}/${total}`}
      style={labelOutside ? undefined : { width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="progress-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="progress-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showText && <span className="progress-ring__text num">{text ?? `${value}/${total}`}</span>}
    </span>
  );
}

/* ---------- 範囲バー(Football の行内版)+ 承認ライン ---------- */

export function RangeBar({
  low,
  mid,
  high,
  min = 0,
  max,
  threshold,
  thresholdLabel = "承認ライン",
  label,
  tone = "accent",
  width = 150,
  format = fmtNum,
}: {
  low: number;
  mid?: number;
  high: number;
  /** 軸の範囲。同じ表の行で揃えること(揃えないと行同士を比べられない)。 */
  min?: number;
  max: number;
  threshold?: number;
  thresholdLabel?: string;
  /** aria-label の主語。 */
  label: string;
  tone?: Tone;
  width?: number;
  format?: (n: number) => string;
}) {
  const span = max - min || 1;
  const x = (v: number) => Math.min(Math.max(((v - min) / span) * 100, 0), 100);
  const crosses = threshold !== undefined && low < threshold && high > threshold;
  const effectiveTone: Tone = threshold === undefined ? tone : crosses ? "warn" : "ok";
  const desc =
    `${label} 下限${format(low)}${mid !== undefined ? ` 中心${format(mid)}` : ""} 上限${format(high)}` +
    (threshold !== undefined ? `。${thresholdLabel}${format(threshold)}を${crosses ? "またぐ" : "またがない"}` : "");
  return (
    <span className={`range range--${effectiveTone}`} role="img" aria-label={desc} title={desc} style={{ width }}>
      <span className="range__track" aria-hidden="true">
        <span className="range__band" style={{ left: `${x(low)}%`, width: `${Math.max(x(high) - x(low), 1)}%` }} />
        {mid !== undefined && <span className="range__mid" style={{ left: `${x(mid)}%` }} />}
        {threshold !== undefined && <span className="range__threshold" style={{ left: `${x(threshold)}%` }} />}
      </span>
    </span>
  );
}

/* ---------- 内訳バー(積み上げ) ---------- */

export interface BreakdownSegment {
  label: string;
  value: number;
  /** 既定はカテゴリ色 1〜6 を順に割り当てる。 */
  color?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function BreakdownBar({
  segments,
  label,
  legend = true,
  format = fmtNum,
  unit = "",
}: {
  segments: BreakdownSegment[];
  label: string;
  legend?: boolean;
  format?: (n: number) => string;
  unit?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  const desc = `${label} ` + segments.map((s) => `${s.label} ${format(s.value)}${unit}`).join("、");
  return (
    <span className="breakdown" role="img" aria-label={desc} title={desc}>
      <span className="breakdown__track" aria-hidden="true">
        {segments.map((s, i) => (
          <span
            key={s.label}
            className={`breakdown__seg breakdown__seg--c${s.color ?? ((i % 6) + 1)}`}
            style={{ width: total > 0 ? `${(Math.max(s.value, 0) / total) * 100}%` : "0%" }}
          />
        ))}
      </span>
      {legend && (
        <span className="breakdown__legend" aria-hidden="true">
          {segments.map((s, i) => (
            <span key={s.label} className="breakdown__key">
              <i className={`breakdown__swatch breakdown__seg--c${s.color ?? ((i % 6) + 1)}`} />
              {s.label}
              <b className="num">{total > 0 ? `${Math.round((Math.max(s.value, 0) / total) * 100)}%` : "—"}</b>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/* ---------- ヒートマップのセル(Watershed data coverage) ---------- */

/** 値を 0〜4 の段階に丸める(0 は「値0」、未登録は level ではなく empty で表す)。 */
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (max <= 0 || value <= 0) return 0;
  const r = value / max;
  if (r >= 0.85) return 4;
  if (r >= 0.6) return 3;
  if (r >= 0.35) return 2;
  return 1;
}

export function HeatCell({
  value,
  max,
  empty = false,
  emptyLabel = "未登録",
  note,
  href,
  label,
}: {
  value: number;
  max: number;
  /** 未登録(値が存在しない)。影響ゼロと区別して斜線で表す。 */
  empty?: boolean;
  emptyLabel?: string;
  /** 件数の下に置く補助(例: 「要確認 1」)。 */
  note?: ReactNode;
  href?: string;
  /** aria-label(例: 「本社工場 × 水」)。 */
  label: string;
}) {
  const level = empty ? null : heatLevel(value, max);
  const className = `heat-cell${empty ? " heat-cell--empty" : ` heat-cell--l${level}`}${href ? " heat-cell--link" : ""}`;
  const content = empty ? (
    <span className="heat-cell__empty">{emptyLabel}</span>
  ) : (
    <>
      <b className="num">{fmtNum(value)}</b>
      {note && <small>{note}</small>}
    </>
  );
  const aria = `${label}: ${empty ? emptyLabel : fmtNum(value)}`;
  return href ? (
    <Link href={href} className={className} aria-label={aria} title={aria}>
      {content}
    </Link>
  ) : (
    <span className={className} role="img" aria-label={aria} title={aria}>
      {content}
    </span>
  );
}

/* ---------- 目標対実績(Watershed targets) ---------- */

export function TargetBar({
  current,
  target,
  baseline,
  direction = "down",
  unit = "",
  label,
  format = fmtNum,
}: {
  current: number | null;
  target: number | null;
  baseline?: number | null;
  /** 目標の向き: down=減らす, up=増やす。 */
  direction?: "down" | "up";
  unit?: string;
  label: string;
  format?: (n: number) => string;
}) {
  const vals = [current, target, baseline].filter((v): v is number => typeof v === "number");
  if (current === null || target === null || vals.length < 2) {
    return (
      <span className="target target--missing" role="img" aria-label={`${label} 実績または目標が未入力`}>
        <span className="target__track" aria-hidden="true" />
        <span className="target__text">未入力</span>
      </span>
    );
  }
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals) * 1.1 || 1;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const met = direction === "down" ? current <= target : current >= target;
  const desc = `${label} 実績${format(current)}${unit} 目標${format(target)}${unit}${typeof baseline === "number" ? ` 基準${format(baseline)}${unit}` : ""}。${met ? "達成" : "未達"}`;
  return (
    <span className={`target target--${met ? "met" : "not-met"}`} role="img" aria-label={desc} title={desc}>
      <span className="target__track" aria-hidden="true">
        <span className="target__fill" style={{ width: `${x(current)}%` }} />
        {typeof baseline === "number" && <span className="target__baseline" style={{ left: `${x(baseline)}%` }} />}
        <span className="target__goal" style={{ left: `${x(target)}%` }} />
      </span>
      <span className="target__text num">
        {format(current)}
        <small>/ 目標 {format(target)}{unit}</small>
      </span>
    </span>
  );
}

/* ---------- 工程ステッパー(Linear / Stripe onboarding) ---------- */

export type StepState = "done" | "current" | "upcoming" | "attention";

export interface StepperStep {
  href: string;
  label: string;
  state: StepState;
  icon?: LucideIcon;
  note?: ReactNode;
}

export function Stepper({ steps, label = "業務工程", compact = false }: { steps: StepperStep[]; label?: string; compact?: boolean }) {
  return (
    <ol className={`stepper${compact ? " stepper--compact" : ""}`} aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.href} className={`stepper__step stepper__step--${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
          <Link href={step.href} className="stepper__link">
            <span className="stepper__node" aria-hidden="true">
              {step.icon ? <Icon icon={step.icon} size={15} /> : <span className="num">{String(i + 1).padStart(2, "0")}</span>}
            </span>
            <span className="stepper__label">
              <b>{step.label}</b>
              {step.note && <small>{step.note}</small>}
            </span>
            <span className="sr-only">
              {step.state === "done" ? "完了" : step.state === "current" ? "進行中" : step.state === "attention" ? "要対応" : "未着手"}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 機能カード(Stripe / Linear docs home) ---------- */

export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className="feature-grid">{children}</div>;
}

export function FeatureCard({
  icon,
  title,
  children,
  href,
  linkLabel,
  tone = "accent",
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  href: string;
  linkLabel?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Link href={href} className={`feature-card feature-card--${tone}`}>
      <span className="feature-card__icon" aria-hidden="true">
        <Icon icon={icon} size={20} />
      </span>
      <span className="feature-card__body">
        <b className="feature-card__title">{title}</b>
        {children && <span className="feature-card__desc">{children}</span>}
        {linkLabel && (
          <span className="feature-card__link">
            {linkLabel} <span aria-hidden="true">→</span>
          </span>
        )}
      </span>
    </Link>
  );
}

/* ---------- 空状態 ---------- */

export function EmptyState({ icon, title, children, action }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-block" role="status">
      {icon && (
        <span className="empty-block__icon" aria-hidden="true">
          <Icon icon={icon} size={28} />
        </span>
      )}
      <b className="empty-block__title">{title}</b>
      {children && <span className="empty-block__desc">{children}</span>}
      {action && <span className="empty-block__action">{action}</span>}
    </div>
  );
}

/* ---------- 操作行 ---------- */

/** ボタン・リンクを横に並べる行。折り返しと間隔を保証し、本文との重なりを防ぐ。 */
export function ActionRow({ children, align = "start" }: { children: ReactNode; align?: "start" | "end" | "between" }) {
  return <div className={`action-row action-row--${align}`}>{children}</div>;
}
