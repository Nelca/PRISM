/**
 * アイコンの単一辞書(2026-10 視覚化リデザイン)。
 *
 * 画面側は lucide-react を直接 import せず、必ずこの辞書を通す。工程・影響カテゴリ・状態の
 * アイコンがプロダクト全体で同じ記号に揃うようにするため。
 * lucide-react は副作用なし(sideEffects:false)で、名前付き import だけがバンドルされる。
 */
import {
  ArrowRight,
  Archive,
  Calculator,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  ClipboardClock,
  Cloud,
  Compass,
  Download,
  Droplet,
  Factory,
  FileSearch,
  FileText,
  Gavel,
  Inbox,
  Leaf,
  ListChecks,
  Mountain,
  Plus,
  Scale,
  Search,
  Target,
  TrendingDown,
  Trash,
  TriangleAlert,
  Upload,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** 業務工程(nav.tsx・StepNav・ホームと同じ順序)。 */
export const STAGE_ICON = {
  sites: Factory,
  assessment: ListChecks,
  valuation: Calculator,
  "financial-bridge": TrendingDown,
  decision: Gavel,
  disclosure: FileText,
} as const satisfies Record<string, LucideIcon>;
export type StageKey = keyof typeof STAGE_ICON;

/** 工程外の画面。 */
export const SCREEN_ICON = {
  home: Compass,
  portfolio: Target,
  ledger: ClipboardClock,
  guide: Compass,
  research: FileSearch,
  evidence: Archive,
} as const satisfies Record<string, LucideIcon>;
export type ScreenKey = keyof typeof SCREEN_ICON;

/** 影響カテゴリ(labels.ts の CATEGORY_LABEL と同じキー)+ 資源・生態系。 */
export const CATEGORY_ICON = {
  water: Droplet,
  climate: Cloud,
  pollution: TriangleAlert,
  waste: Trash,
  land_use: Mountain,
  biodiversity: Leaf,
} as const satisfies Record<string, LucideIcon>;
export type CategoryKey = keyof typeof CATEGORY_ICON;

/** 状態(StatusBadge と同じ語彙)。 */
export const STATUS_ICON = {
  done: CircleCheck,
  active: CircleDot,
  attention: CircleAlert,
  pending: CirclePause,
} as const satisfies Record<string, LucideIcon>;
export type StatusKey = keyof typeof STATUS_ICON;

/** 操作(ボタン・空状態)。 */
export const ACTION_ICON = {
  next: ArrowRight,
  add: Plus,
  upload: Upload,
  download: Download,
  search: Search,
  inbox: Inbox,
  balance: Scale,
} as const satisfies Record<string, LucideIcon>;
export type ActionKey = keyof typeof ACTION_ICON;

/** href から工程/画面アイコンを引く(ナビ・ステッパー用)。 */
export function iconForHref(href: string): LucideIcon {
  const seg = href.replace(/^\//, "").split("/")[0];
  if (seg === "") return SCREEN_ICON.home;
  if (seg in STAGE_ICON) return STAGE_ICON[seg as StageKey];
  if (seg in SCREEN_ICON) return SCREEN_ICON[seg as ScreenKey];
  return SCREEN_ICON.guide;
}

/** 共通の描画。装飾用途が既定(aria-hidden)。意味を持たせる場合は label を渡す。 */
export function Icon({ icon: Cmp, size = 16, label, className, ...rest }: { icon: LucideIcon; label?: string; size?: number; className?: string } & Omit<LucideProps, "ref" | "size">) {
  return (
    <Cmp
      size={size}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={className ? `icon ${className}` : "icon"}
      {...rest}
    />
  );
}
