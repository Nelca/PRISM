import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { materialIssueIdsWithoutRepresentativeSelection } from "@/lib/pipeline/valuation-insights";
import { toCsv } from "./csv";
import { DIRECTION_LABEL, METRIC_BY_ID, TARGET_CATEGORIES, TARGET_STATUS, evaluateTarget, isOverdue, type TargetCategory } from "./metrics";
import { targetReviewNeeds } from "./review";

/** 統合管理の1行。貨幣化の評価(valuation)と物理指標(physical)を同じ表に並べる。 */
export interface PortfolioRow {
  id: string;
  kind: "valuation" | "physical";
  siteId: string;
  siteName: string;
  category: TargetCategory;
  label: string;
  boundary: string;
  year: number | null;
  status: string;
  attention: boolean;
  overdue: boolean;
  archived: boolean;
  reviewNeeds: string[];
  current: number | null;
  target: number | null;
  direction: string;
  unit: string;
  owner: string;
  dueDate: string;
  actionPlan: string;
  measuredOn: string;
  evidence: string;
  targetBasis: string;
  href: string;
  revision: string;
}

const VALUATION_STATUS = { excluded: "対象外", missing: "未算定", unselected: "代表値未選択", done: "算定済み" } as const;

function valuationRows(result: DemoPipelineResult, siteNames: Map<string, string>): PortfolioRow[] {
  const unselectedIds = new Set(materialIssueIdsWithoutRepresentativeSelection(result));
  return result.assessment.materialIssues.map((issue) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[issue.id] ?? [];
    const exchangeCount = records.filter((record) => record.valueConcept === "exchange").length;
    const unselected = unselectedIds.has(issue.id);
    const status = issue.excluded
      ? VALUATION_STATUS.excluded
      : records.length === 0
        ? VALUATION_STATUS.missing
        : unselected
          ? VALUATION_STATUS.unselected
          : VALUATION_STATUS.done;
    return {
      id: issue.id,
      kind: "valuation",
      siteId: issue.siteId,
      siteName: siteNames.get(issue.siteId) ?? issue.siteId,
      category: issue.impactCategory,
      label: "貨幣化の評価",
      boundary: `${exchangeCount}件の交換価値・${records.length - exchangeCount}件の厚生価値`,
      year: null,
      status,
      attention: !issue.excluded && (records.length === 0 || unselected),
      overdue: false,
      archived: false,
      reviewNeeds: [],
      current: null,
      target: null,
      direction: "",
      unit: "",
      owner: "",
      dueDate: "",
      actionPlan: "",
      measuredOn: "",
      evidence: "評価画面で対象期間・入力・係数を確認",
      targetBasis: "投資承認の判定とは別に表示",
      href: records.length > 0 ? `/valuation/${issue.id}` : `/assessment/${issue.id}`,
      revision: result.recalculationHash.hash,
    };
  });
}

function physicalRows(result: DemoPipelineResult, siteNames: Map<string, string>, today: string): PortfolioRow[] {
  const decisions = result.decisions.map((entry) => entry.decision.decisionRecord);
  return result.environmentalTargets.flatMap((record) => {
    const metric = METRIC_BY_ID.get(record.metricId);
    if (!metric) return [];
    const status = evaluateTarget(record);
    const reviewNeeds = targetReviewNeeds(record, siteNames.get(record.siteId), result.disclosureClaims, decisions);
    return [
      {
        id: record.id,
        kind: "physical" as const,
        siteId: record.siteId,
        siteName: siteNames.get(record.siteId) ?? `${record.siteId}（拠点を確認）`,
        category: metric.category,
        label: metric.label,
        boundary: record.boundary,
        year: record.reportingYear,
        status: TARGET_STATUS[status],
        attention: status !== "met" || reviewNeeds.length > 0,
        overdue: isOverdue(record, today),
        archived: record.archived,
        reviewNeeds,
        current: record.current,
        target: record.target,
        direction: DIRECTION_LABEL[record.direction],
        unit: metric.unit,
        owner: record.owner,
        dueDate: record.dueDate,
        actionPlan: record.actionPlan,
        measuredOn: record.measuredOn,
        evidence: record.evidence,
        targetBasis: record.targetBasis,
        href: `/portfolio/${record.id}`,
        revision: record.revision,
      },
    ];
  });
}

/** 期限超過 → 要対応 → 拠点名の順。 */
export function buildPortfolioRows(result: DemoPipelineResult, today: string): PortfolioRow[] {
  const siteNames = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  return [...valuationRows(result, siteNames), ...physicalRows(result, siteNames, today)].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(b.attention) - Number(a.attention) ||
      a.siteName.localeCompare(b.siteName, "ja")
  );
}

export interface PortfolioFilter {
  site: string;
  category: string;
  state: string;
  query: string;
  year: string;
}
export const EMPTY_PORTFOLIO_FILTER: PortfolioFilter = { site: "", category: "", state: "", query: "", year: "" };

const MISSING_STATUSES: string[] = [
  TARGET_STATUS.missing_measurement,
  TARGET_STATUS.missing_target,
  VALUATION_STATUS.missing,
  VALUATION_STATUS.unselected,
];

export function filterPortfolio(rows: PortfolioRow[], filter: PortfolioFilter): PortfolioRow[] {
  const query = filter.query.toLocaleLowerCase();
  return rows.filter((row) => {
    if (filter.state === "archived" ? !row.archived : row.archived) return false;
    if (filter.site && row.siteId !== filter.site) return false;
    if (filter.category && row.category !== filter.category) return false;
    if (filter.year && String(row.year ?? "") !== filter.year) return false;
    if (filter.state === "review" && row.reviewNeeds.length === 0) return false;
    if (filter.state === "attention" && !row.attention) return false;
    if (filter.state === "overdue" && !row.overdue) return false;
    if (filter.state === "not_met" && row.status !== TARGET_STATUS.not_met) return false;
    if (filter.state === "missing" && !MISSING_STATUSES.includes(row.status)) return false;
    return !query || `${row.siteName} ${row.label} ${row.boundary} ${row.owner}`.toLocaleLowerCase().includes(query);
  });
}

/** 一覧共有用のCSV。再取込用の編集用CSV(csv.ts)とは列が異なる。 */
export function portfolioCsv(rows: PortfolioRow[]): string {
  const heading = [
    "拠点", "カテゴリ", "指標", "範囲", "対象年", "状態", "再確認事項", "実測値", "目標値", "達成条件",
    "単位", "担当", "期限", "次の対応", "確認日", "保管", "実測根拠", "目標根拠", "レコードID", "版",
  ];
  return toCsv([
    heading,
    ...rows.map((row) => [
      row.siteName, TARGET_CATEGORIES[row.category], row.label, row.boundary, row.year, row.status,
      row.reviewNeeds.join("・"), row.current, row.target, row.direction, row.unit, row.owner, row.dueDate,
      row.actionPlan, row.measuredOn, row.archived ? "保管中" : "", row.evidence, row.targetBasis, row.id, row.revision,
    ]),
  ]);
}
