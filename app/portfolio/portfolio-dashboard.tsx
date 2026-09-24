"use client";

import Link from "next/link";
import { useState } from "react";
import { TARGET_CATEGORIES } from "@/lib/environment/metrics";
import { filterPortfolio, portfolioCsv, type PortfolioRow, type PortfolioFilter } from "@/lib/environment/portfolio";
import { TextExport } from "../components/text-export";

export function PortfolioDashboard({ rows, sites }: { rows: PortfolioRow[]; sites: { id: string; name: string }[] }) {
  const [filter, setFilter] = useState<PortfolioFilter>({ site: "", category: "", state: "", query: "", year: "" });
  const update = (key: keyof PortfolioFilter, value: string) => setFilter((previous) => ({ ...previous, [key]: value }));
  const showState = (state: string) => setFilter({ site: "", category: "", query: "", year: "", state });
  const filtered = filterPortfolio(rows, filter);
  const active = rows.filter((row) => !row.archived);
  const years = [...new Set(rows.flatMap((row) => row.year === null ? [] : [row.year]))].sort((a, b) => b - a);
  const fmt = (value: number | null, unit: string) => value === null ? "未入力" : `${new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value)} ${unit}`;
  return <>
    <div className="portfolio-summary">
      <button type="button" onClick={() => showState("")}><strong>{active.length}</strong><span>管理対象</span></button>
      <button type="button" onClick={() => showState("attention")}><strong>{active.filter((row) => row.attention).length}</strong><span>確認・対応が必要</span></button>
      <button type="button" onClick={() => showState("not_met")}><strong>{active.filter((row) => row.status === "目標未達").length}</strong><span>物理目標が未達</span></button>
      <button type="button" onClick={() => showState("overdue")}><strong>{active.filter((row) => row.overdue).length}</strong><span>対応期限を超過</span></button>
    </div>
    <section className="card"><div className="card__body">
      <h2 className="portfolio-heading">拠点別のカバー状況</h2>
      <p className="field-hint">「未登録」は影響ゼロを意味しません。セルを選ぶと対象を絞り込めます。異なる単位の総合点・合計金額は作りません。</p>
      <div className="portfolio-table-scroll"><table className="data-table portfolio-matrix"><thead><tr><th>拠点</th>{Object.values(TARGET_CATEGORIES).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{sites.map((site) => <tr key={site.id}><th>{site.name}</th>{Object.keys(TARGET_CATEGORIES).map((category) => {
        const cell = active.filter((row) => row.siteId === site.id && row.category === category);
        const attention = cell.filter((row) => row.attention).length;
        return <td key={category}><button type="button" className={`portfolio-cell${attention ? " portfolio-cell--attention" : ""}`} onClick={() => setFilter({ site: site.id, category, state: "", query: "", year: "" })} aria-label={`${site.name}・${TARGET_CATEGORIES[category as keyof typeof TARGET_CATEGORIES]}: ${cell.length}件、要確認${attention}件`}>{cell.length ? `${cell.length}件` : "未登録"}{attention > 0 && <small>要確認 {attention}</small>}</button></td>;
      })}</tr>)}</tbody></table></div>
    </div></section>
    <section className="card"><div className="card__body">
      <h2 className="portfolio-heading">管理対象の一覧</h2>
      <div className="portfolio-filters">
        <div className="field"><label htmlFor="portfolio-site">拠点</label><select id="portfolio-site" value={filter.site} onChange={(event) => update("site", event.target.value)}><option value="">すべて</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
        <div className="field"><label htmlFor="portfolio-category">種類</label><select id="portfolio-category" value={filter.category} onChange={(event) => update("category", event.target.value)}><option value="">すべて</option>{Object.entries(TARGET_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="portfolio-state">状態</label><select id="portfolio-state" value={filter.state} onChange={(event) => update("state", event.target.value)}><option value="">すべての有効対象</option><option value="attention">確認・対応が必要</option><option value="review">費用・文案の再確認</option><option value="not_met">物理目標が未達</option><option value="missing">データ・設定待ち</option><option value="overdue">対応期限を超過</option><option value="archived">保管中</option></select></div>
        <div className="field"><label htmlFor="portfolio-year">物理指標の対象年</label><select id="portfolio-year" value={filter.year} onChange={(event) => update("year", event.target.value)}><option value="">すべて（貨幣化を含む）</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
        <div className="field"><label htmlFor="portfolio-query">指標・範囲・担当を検索</label><input id="portfolio-query" value={filter.query} onChange={(event) => update("query", event.target.value)} placeholder="例: 木材、環境管理室" /></div>
      </div>
      <div className="portfolio-list-head"><p role="status">{filtered.length}件を表示</p><button className="pill-btn" type="button" onClick={() => setFilter({ site: "", category: "", state: "", query: "", year: "" })}>絞り込みを解除</button></div>
      <TextExport text={portfolioCsv(filtered)} filename="prism-environment-portfolio.csv" copyLabel="表示中の一覧をコピー" downloadLabel="表示中の一覧をCSV保存" />
      {filtered.length === 0 ? <div className="portfolio-empty"><p>この条件に一致する管理対象はありません。</p><Link href={`/portfolio/new${filter.category ? `?category=${filter.category}` : ""}`} className="pill-btn pill-btn--accent">管理する指標を追加する</Link></div> : <div className="portfolio-table-scroll"><table className="data-table"><thead><tr><th>拠点・対象</th><th>状態</th><th>実測 / 目標</th><th>担当・期限</th><th>次の操作</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}>
        <td><strong>{row.siteName}</strong><span className="cell-note">{TARGET_CATEGORIES[row.category]} · {row.label}</span><span className="cell-note">{row.boundary}{row.year ? ` / ${row.year}年` : ""}</span></td>
        <td><span className={`portfolio-status${row.attention ? " portfolio-status--attention" : ""}`}>{row.archived ? "保管中" : row.status}</span>{row.reviewNeeds.length > 0 && <span className="cell-note">要再確認: {row.reviewNeeds.join("・")}</span>}{row.overdue && <span className="cell-note">期限超過</span>}</td>
        <td>{row.kind === "physical" ? <>{fmt(row.current, row.unit)}<span className="cell-note">目標 {fmt(row.target, row.unit)}{row.target !== null ? ` ${row.direction}` : ""}</span></> : <span className="cell-note">金額・前提は評価画面で確認</span>}</td>
        <td>{row.kind === "physical" ? <>{row.owner || "担当未設定"}<span className="cell-note">{row.dueDate || "期限未設定"}</span></> : "—"}</td>
        <td><Link href={row.href} className="pill-btn pill-btn--sm">{row.kind === "physical" ? "確認・更新" : "評価を確認"} →</Link></td>
      </tr>)}</tbody></table></div>}
    </div></section>
  </>;
}
