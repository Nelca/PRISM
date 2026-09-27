"use client";

import Link from "next/link";
import { useState } from "react";
import { TARGET_CATEGORIES, TARGET_STATUS, type TargetCategory } from "@/lib/environment/metrics";
import { EMPTY_PORTFOLIO_FILTER, filterPortfolio, portfolioCsv, type PortfolioFilter, type PortfolioRow } from "@/lib/environment/portfolio";
import { formatQuantity } from "../components/numeric";
import { TextExport } from "../components/text-export";

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

  const summary = [
    { state: "", count: active.length, label: "管理対象" },
    { state: "attention", count: active.filter((row) => row.attention).length, label: "確認・対応が必要" },
    { state: "not_met", count: active.filter((row) => row.status === TARGET_STATUS.not_met).length, label: "物理目標が未達" },
    { state: "overdue", count: active.filter((row) => row.overdue).length, label: "対応期限を超過" },
  ];

  return (
    <>
      <div className="portfolio-summary">
        {summary.map((item) => (
          <button key={item.label} type="button" onClick={() => setFilter({ ...EMPTY_PORTFOLIO_FILTER, state: item.state })}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
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
              <Link href={`/portfolio/new${filter.category ? `?category=${filter.category}` : ""}`} className="pill-btn pill-btn--accent">
                管理する指標を追加する
              </Link>
            </div>
          ) : (
            <TargetTable rows={filtered} />
          )}
        </div>
      </section>
    </>
  );
}

/** 拠点×種類の件数。「未登録」はゼロ影響と区別して表示する。 */
function CoverageMatrix({ sites, rows, onSelect }: { sites: Site[]; rows: PortfolioRow[]; onSelect: (siteId: string, category: string) => void }) {
  const categories = Object.entries(TARGET_CATEGORIES) as [TargetCategory, string][];
  return (
    <section className="card">
      <div className="card__body">
        <h2 className="portfolio-heading">拠点別のカバー状況</h2>
        <p className="field-hint">「未登録」は影響ゼロを意味しません。セルを選ぶと対象を絞り込めます。異なる単位の総合点・合計金額は作りません。</p>
        <div className="portfolio-table-scroll">
          <table className="data-table portfolio-matrix">
            <thead>
              <tr>
                <th>拠点</th>
                {categories.map(([key, label]) => <th key={key}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <th>{site.name}</th>
                  {categories.map(([category, label]) => {
                    const cell = rows.filter((row) => row.siteId === site.id && row.category === category);
                    const attention = cell.filter((row) => row.attention).length;
                    return (
                      <td key={category}>
                        <button
                          type="button"
                          className={`portfolio-cell${attention ? " portfolio-cell--attention" : ""}`}
                          onClick={() => onSelect(site.id, category)}
                          aria-label={`${site.name}・${label}: ${cell.length}件、要確認${attention}件`}
                        >
                          {cell.length ? `${cell.length}件` : "未登録"}
                          {attention > 0 && <small>要確認 {attention}</small>}
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

function TargetTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <div className="portfolio-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>拠点・対象</th>
            <th>状態</th>
            <th>実測 / 目標</th>
            <th>担当・期限</th>
            <th>次の操作</th>
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
                  <span className={`portfolio-status${row.attention ? " portfolio-status--attention" : ""}`}>{row.archived ? "保管中" : row.status}</span>
                  {row.reviewNeeds.length > 0 && <span className="cell-note">要再確認: {row.reviewNeeds.join("・")}</span>}
                  {row.overdue && <span className="cell-note">期限超過</span>}
                </td>
                <td>
                  {physical ? (
                    <>
                      {formatQuantity(row.current, row.unit)}
                      <span className="cell-note">目標 {formatQuantity(row.target, row.unit)}{row.target !== null ? ` ${row.direction}` : ""}</span>
                    </>
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
