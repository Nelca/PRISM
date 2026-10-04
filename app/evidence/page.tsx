import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead, TableScroll } from "../components/ui";
import { categoryLabel, materialIssueLabel } from "../components/labels";
import { inputSourceLabel } from "../valuation/category-expansion";
import { methodShortLabel } from "../components/method-labels";
import { StatusBadge } from "../components/viz";

export const metadata: Metadata = {
  title: "証拠・入力根拠 | PRISM",
};

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const { issue: issueParam } = await searchParams;
  const result = await loadPipelineView();
  const evidenceIssueIds = new Set([
    ...Object.keys(result.valuation.coverageByMaterialIssue),
    ...Object.keys(result.valuation.valuationRecordsByMaterialIssue),
  ]);
  if (issueParam && !evidenceIssueIds.has(issueParam)) notFound();
  const issueById = new Map(result.assessment.materialIssues.map((issue) => [issue.id, issue]));
  const siteNameById = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const rows = [...evidenceIssueIds]
    .map((materialIssueId) => ({
      materialIssueId,
      coverage: result.valuation.coverageByMaterialIssue[materialIssueId],
      records: result.valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [],
      issue: issueById.get(materialIssueId),
    }))
    .sort((a, b) => Number(b.materialIssueId === issueParam) - Number(a.materialIssueId === issueParam));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">証拠・入力根拠</h1>
        </div>
        <ScreenLead>入力、係数、除外理由を作業画面から分離して確認します</ScreenLead>
      </div>

      <p className="page-back page-back--top">
        <Link href="/valuation#representative-selection">← 価値の算定へ戻る</Link>
      </p>

      <Card
        title="入力・係数・除外の一覧"
        subtitle={issueParam ? "算定画面から選んだ対象を先頭に表示しています" : "評価対象ごとの入力根拠を確認できます"}
        padBody={false}
      >
        <TableScroll label="評価対象ごとの入力・係数・除外">
        <table className="data-table">
          <caption className="sr-only">評価対象ごとの入力元、対象期間、算定状態、係数</caption>
          <thead>
            <tr>
              <th>評価対象</th>
              <th>入力元</th>
              <th>期間</th>
              <th>算定状態</th>
              <th>係数・対応表</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink-faint)" }}>
                  追加カテゴリの入力根拠はまだありません。
                </td>
              </tr>
            ) : (
              rows.map(({ materialIssueId, coverage, records, issue }) => (
                <tr key={materialIssueId}>
                  <td>
                    <b>{issue ? materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.siteId) : materialIssueId}</b>
                    {issue && <span className="id-note">{categoryLabel(issue.impactCategory)}</span>}
                  </td>
                  <td>{coverage ? inputSourceLabel(coverage.sourceKind) : "直接入力・算定設定"}</td>
                  <td>{coverage?.reportingPeriod ?? "年次入力"}</td>
                  <td>
                    {coverage?.quantities.some((quantity) => quantity.rowCounts.blocked > 0 || quantity.rowCounts.unmapped > 0) ? (
                      <StatusBadge status="attention">未算定あり</StatusBadge>
                    ) : (
                      <StatusBadge status="done">算定済み</StatusBadge>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {coverage ? (
                      <>
                        {coverage.mappingVersion ?? "対応表なし"}
                        {coverage.coefficientVersion ? ` ・ ${coverage.coefficientVersion}` : ""}
                      </>
                    ) : (
                      [...new Set(records.map((record) => methodShortLabel(record.methodId)))].join("・") || "算定手法なし"
                    )}
                  </td>
                  <td>
                    <Link href={`/valuation/${encodeURIComponent(materialIssueId)}`} className="pill-btn pill-btn--sm">
                      算定を見る
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </TableScroll>
      </Card>
    </div>
  );
}
