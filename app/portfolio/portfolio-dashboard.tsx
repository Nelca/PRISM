"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { DIRECTION_LABEL, TARGET_CATEGORIES, TARGET_STATUS, type TargetCategory } from "@/lib/environment/metrics";
import { EMPTY_PORTFOLIO_FILTER, filterPortfolio, portfolioCsv, type PortfolioFilter, type PortfolioRow } from "@/lib/environment/portfolio";
import { CATEGORY_ICON, Icon, SCREEN_ICON } from "../components/icons";
import { formatExactNumber } from "../components/numeric";
import type { TagVariant } from "../components/tag-utils";
import { TextExport } from "../components/text-export";
import { ActionRow, HeatCell, ProgressRing, StatusBadge, TargetBar, type Tone } from "../components/viz";

type Site = { id: string; name: string };

const STATE_OPTIONS = [
  ["", "すべての有効対象"],
  ["attention", "確認・対応が必要"],
  ["review", "費用・文案の再確認"],
  ["not_met", "物理目標が未達"],
  ["missing", "データ・設定待ち"],
  ["overdue", "対応期限を超過"],
  ["archived", "保管中"],
] as const;

export function PortfolioDashboard({ rows, sites }: { rows: PortfolioRow[]; sites: Site[] }) {
  const [filter, setFilter] = useState<PortfolioFilter>(EMPTY_PORTFOLIO_FILTER);
  const update = (key: keyof PortfolioFilter, value: string) => setFilter((previous) => ({ ...previous, [key]: value }));
  const filtered = filterPortfolio(rows, filter);
  const active = rows.filter((row) => !row.archived);
  const years = [...new Set(rows.flatMap((row) => (row.year === null ? [] : [row.year])))].sort((a, b) => b - a);

  const summary: { state: string; count: number; label: string; tone: Tone }[] = [
    { state: "", count: active.length, label: "管理対象", tone: "neutral" },
    { state: "attention", count: active.filter((row) => row.attention).length, label: "確認・対応が必要", tone: "warn" },
    { state: "not_met", count: active.filter((row) => row.status === TARGET_STATUS.not_met).length, label: "物理目標が未達", tone: "warn" },
    { state: "overdue", count: active.filter((row) => row.overdue).length, label: "対応期限を超過", tone: "warn" },
  ];

  return (
    <>
      <div className="portfolio-summary pf-summary">
        {summary.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`stat-tile stat-tile--${item.tone} pf-summary__tile`}
            onClick={() => setFilter({ ...EMPTY_PORTFOLIO_FILTER, state: item.state })}
          >
            <span className="stat-tile__label">{item.label}</span>
            <span className="stat-tile__value num">
              {item.count}
              <small>件</small>
            </span>
            <span className="stat-tile__visual">
              <ProgressRing value={item.count} total={active.length} size={32} label={item.label} tone={item.tone} />
            </span>
          </button>
        ))}
      </div>

      <CoverageMatrix sites={sites} rows={active} onSelect={(site, category) => setFilter({ ...EMPTY_PORTFOLIO_FILTER, site, category })} />

      <section className="card">
        <div className="card__body">
          <h2 className="portfolio-heading">管理対象の一覧</h2>
          <div className="portfolio-filters">
            <div className="field">
              <label htmlFor="portfolio-site">拠点</label>
              <select id="portfolio-site" value={filter.site} onChange={(event) => update("site", event.target.value)}>
                <option value="">すべて</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="portfolio-category">種類</label>
              <select id="portfolio-category" value={filter.category} onChange={(event) => update("category", event.target.value)}>
                <option value="">すべて</option>
                {Object.entries(TARGET_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="portfolio-state">状態</label>
              <select id="portfolio-state" value={filter.state} onChange={(event) => update("state", event.target.value)}>
                {STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="portfolio-year">物理指標の対象年</label>
              <select id="portfolio-year" value={filter.year} onChange={(event) => update("year", event.target.value)}>
                <option value="">すべて（貨幣化を含む）</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="portfolio-query">指標・範囲・担当を検索</label>
              <input id="portfolio-query" value={filter.query} onChange={(event) => update("query", event.target.value)} placeholder="例: 木材、環境管理室" />
            </div>
          </div>
          <div className="portfolio-list-head">
            <p role="status">{filtered.length}件を表示</p>
            <button className="pill-btn" type="button" onClick={() => setFilter(EMPTY_PORTFOLIO_FILTER)}>絞り込みを解除</button>
          </div>
          <TextExport
            text={portfolioCsv(filtered)}
            filename="prism-environment-portfolio.csv"
            copyLabel="表示中の一覧をコピー"
            downloadLabel="表示中の一覧をCSV保存"
          />
          {filtered.length === 0 ? (
            <div className="portfolio-empty">
              <p>この条件に一致する管理対象はありません。</p>
              <ActionRow>
                <Link href={`/portfolio/new${filter.category ? `?category=${filter.category}` : ""}`} className="pill-btn pill-btn--accent">
                  管理する指標を追加する
                </Link>
              </ActionRow>
            </div>
          ) : (
            <TargetTable rows={filtered} />
          )}
        </div>
      </section>
    </>
  );
}

function categoryIcon(category: TargetCategory): LucideIcon {
  return (CATEGORY_ICON as Partial<Record<TargetCategory, LucideIcon>>)[category] ?? SCREEN_ICON.portfolio;
}

/** 拠点×種類の件数。「未登録」はゼロ影響と区別して表示する。 */
function CoverageMatrix({ sites, rows, onSelect }: { sites: Site[]; rows: PortfolioRow[]; onSelect: (siteId: string, category: string) => void }) {
  const categories = Object.entries(TARGET_CATEGORIES) as [TargetCategory, string][];
  const counts = sites.flatMap((site) => categories.map(([category]) => rows.filter((row) => row.siteId === site.id && row.category === category).length));
  const maxCount = Math.max(1, ...counts);
  return (
    <section className="card">
      <div className="card__body">
        <h2 className="portfolio-heading">拠点別のカバー状況</h2>
        <p className="field-hint">「未登録」は影響ゼロを意味しません。セルを選ぶと対象を絞り込めます。異なる単位の総合点・合計金額は作りません。</p>
        <div className="portfolio-table-scroll">
          <table className="data-table portfolio-matrix">
            <thead>
              <tr>
                <th className="pf-row-head">拠点</th>
                {categories.map(([key, label]) => (
                  <th key={key}>
                    <Icon icon={categoryIcon(key)} size={14} /> {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <th className="pf-row-head" title={site.name}>{site.name}</th>
                  {categories.map(([category, label]) => {
                    const cell = rows.filter((row) => row.siteId === site.id && row.category === category);
                    const attention = cell.filter((row) => row.attention).length;
                    return (
                      <td key={category}>
                        <button
                          type="button"
                          className="pf-heat-btn"
                          onClick={() => onSelect(site.id, category)}
                          aria-label={`${site.name}・${label}: ${cell.length ? `${cell.length}件、要確認${attention}件` : "未登録"}`}
                        >
                          <HeatCell
                            value={cell.length}
                            max={maxCount}
                            empty={cell.length === 0}
                            note={attention > 0 ? `要確認 ${attention}` : undefined}
                            label={`${site.name}・${label}`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** 行の状態語 → バッジの色。保管中=neutral、達成=ok、未達=warn、未入力/未算定/代表値未選択=pending、対象外=neutral。 */
const ROW_STATUS_VARIANT: Record<string, TagVariant> = {
  [TARGET_STATUS.met]: "ok",
  [TARGET_STATUS.not_met]: "warn",
  [TARGET_STATUS.missing_measurement]: "pending",
  [TARGET_STATUS.missing_target]: "pending",
  算定済み: "ok",
  未算定: "pending",
  代表値未選択: "pending",
  対象外: "neutral",
};

function rowStatusVariant(row: PortfolioRow): TagVariant {
  return row.archived ? "neutral" : ROW_STATUS_VARIANT[row.status] ?? "neutral";
}

/** DIRECTION_LABELの表記から TargetBar の向きを引き直す(新しい判定は作らない)。 */
function targetBarDirection(row: PortfolioRow): "down" | "up" {
  return row.direction === DIRECTION_LABEL.at_least ? "up" : "down";
}

function TargetTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <div className="portfolio-table-scroll">
      <table className="data-table portfolio-table-fixed">
        <thead>
          <tr>
            <th>拠点・対象</th>
            <th className="pf-col-status">状態</th>
            <th className="pf-col-target">実測 / 目標</th>
            <th>担当・期限</th>
            <th className="pf-col-action">次の操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const physical = row.kind === "physical";
            return (
              <tr key={row.id}>
                <td>
                  <strong>{row.siteName}</strong>
                  <span className="cell-note">{TARGET_CATEGORIES[row.category]} · {row.label}</span>
                  <span className="cell-note">{row.boundary}{row.year ? ` / ${row.year}年` : ""}</span>
                </td>
                <td>
                  <StatusBadge variant={rowStatusVariant(row)}>{row.archived ? "保管中" : row.status}</StatusBadge>
                  {row.reviewNeeds.length > 0 && <span className="cell-note">要再確認: {row.reviewNeeds.join("・")}</span>}
                  {row.overdue && (
                    <span className="cell-note">
                      <StatusBadge status="attention">期限超過</StatusBadge>
                    </span>
                  )}
                </td>
                <td>
                  {physical ? (
                    <TargetBar
                      current={row.current}
                      target={row.target}
                      direction={targetBarDirection(row)}
                      unit={row.unit}
                      label={`${row.siteName}・${row.label}`}
                      format={formatExactNumber}
                    />
                  ) : (
                    <span className="cell-note">金額・前提は評価画面で確認</span>
                  )}
                </td>
                <td>
                  {physical ? (
                    <>
                      {row.owner || "担当未設定"}
                      <span className="cell-note">{row.dueDate || "期限未設定"}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <Link href={row.href} className="pill-btn pill-btn--sm">{physical ? "確認・更新" : "評価を確認"} →</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
