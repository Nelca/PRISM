import { targetReviewNeeds } from "./review";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { materialIssueIdsWithoutRepresentativeSelection } from "@/lib/pipeline/valuation-insights";
import { METRIC_BY_ID, TARGET_CATEGORIES, TARGET_STATUS, evaluateTarget, isOverdue, type TargetCategory } from "./metrics";

export interface PortfolioRow {
  id: string; siteId: string; siteName: string; category: TargetCategory; label: string; boundary: string;
  year: number | null; status: string; attention: boolean; overdue: boolean; archived: boolean;
  current: number | null; target: number | null; unit: string; owner: string; dueDate: string; href: string;
  reviewNeeds: string[];
  direction: string; measuredOn: string; actionPlan: string;
  kind: "valuation" | "physical"; evidence: string; targetBasis: string; revision: string;
}
export function buildPortfolioRows(result: DemoPipelineResult, today: string): PortfolioRow[] {
  const sites = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const unselectedIds = new Set(materialIssueIdsWithoutRepresentativeSelection(result));
  const rows: PortfolioRow[] = result.assessment.materialIssues.map((issue) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[issue.id] ?? [];
    const exchange = records.filter((record) => record.valueConcept === "exchange");
    const unselected = unselectedIds.has(issue.id);
    const status = issue.excluded ? "対象外" : records.length === 0 ? "未算定" : unselected ? "代表値未選択" : "算定済み";
    return { id: issue.id, siteId: issue.siteId, siteName: sites.get(issue.siteId) ?? issue.siteId, category: issue.impactCategory, label: "貨幣化の評価", boundary: `${exchange.length}件の交換価値・${records.length - exchange.length}件の厚生価値`, year: null, status, attention: !issue.excluded && (records.length === 0 || unselected), overdue: false, archived: false, current: null, target: null, unit: "", owner: "", dueDate: "", href: records.length > 0 ? `/valuation/${issue.id}` : `/assessment/${issue.id}`, kind: "valuation", reviewNeeds: [], direction: "", measuredOn: "", actionPlan: "", evidence: "評価画面で対象期間・入力・係数を確認", targetBasis: "投資承認の判定とは別に表示", revision: result.recalculationHash.hash };
  });
  for (const record of result.environmentalTargets) {
    const metric = METRIC_BY_ID.get(record.metricId);
    if (!metric) continue;
    const status = evaluateTarget(record);
    const reviewNeeds = targetReviewNeeds(record, sites.get(record.siteId), result.disclosureClaims, result.decisions.map((entry) => entry.decision.decisionRecord));
    rows.push({ id: record.id, siteId: record.siteId, siteName: sites.get(record.siteId) ?? `${record.siteId}（拠点を確認）`, category: metric.category, label: metric.label, boundary: record.boundary, year: record.reportingYear, status: TARGET_STATUS[status], attention: status !== "met" || reviewNeeds.length > 0, reviewNeeds, overdue: isOverdue(record, today), archived: record.archived, current: record.current, target: record.target, unit: metric.unit, owner: record.owner, dueDate: record.dueDate, href: `/portfolio/${record.id}`, kind: "physical", direction: record.direction === "at_most" ? "以下" : "以上", measuredOn: record.measuredOn, actionPlan: record.actionPlan, evidence: record.evidence, targetBasis: record.targetBasis, revision: record.revision });
  }
  return rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.attention) - Number(a.attention) || a.siteName.localeCompare(b.siteName, "ja"));
}
export interface PortfolioFilter { site: string; category: string; state: string; query: string; year: string; }
export function filterPortfolio(rows: PortfolioRow[], filter: PortfolioFilter): PortfolioRow[] {
  return rows.filter((row) => {
    if (filter.state === "archived" ? !row.archived : row.archived) return false;
    if (filter.site && row.siteId !== filter.site) return false;
    if (filter.category && row.category !== filter.category) return false;
    if (filter.year && String(row.year ?? "") !== filter.year) return false;
    if (filter.state === "review" && !row.reviewNeeds.length) return false;
    if (filter.state === "attention" && !row.attention) return false;
    if (filter.state === "overdue" && !row.overdue) return false;
    if (filter.state === "not_met" && row.status !== TARGET_STATUS.not_met) return false;
    if (filter.state === "missing" && ![TARGET_STATUS.missing_measurement, TARGET_STATUS.missing_target, "未算定", "代表値未選択"].includes(row.status)) return false;
    return !filter.query || `${row.siteName} ${row.label} ${row.boundary} ${row.owner}`.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase());
  });
}
function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // 表計算ソフトに渡したとき、入力文を数式として実行させない。
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function portfolioCsv(rows: PortfolioRow[]): string {
  const heading = ["拠点", "カテゴリ", "指標", "範囲", "対象年", "状態", "再確認事項", "実測値", "目標値", "達成条件", "単位", "担当", "期限", "次の対応", "確認日", "保管", "実測根拠", "目標根拠", "レコードID", "版"];
  return "\uFEFF" + [heading, ...rows.map((row) => [row.siteName, TARGET_CATEGORIES[row.category], row.label, row.boundary, row.year, row.status, row.reviewNeeds.join("・"), row.current, row.target, row.direction, row.unit, row.owner, row.dueDate, row.actionPlan, row.measuredOn, row.archived ? "保管中" : "", row.evidence, row.targetBasis, row.id, row.revision])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
