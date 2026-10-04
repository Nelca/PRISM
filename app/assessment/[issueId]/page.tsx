import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computePercentileRanks } from "@core/assessment/percentile-rank";
import { loadPipelineView } from "@/lib/views/pipeline";
import { materialIssueLabel } from "../../components/labels";
import { sensitivityFraction } from "../../components/criteria-labels";
import { Card, KV, ScreenLead, Tag } from "../../components/ui";
import { StepNav } from "../../components/step-nav";
import { DepthToggle } from "../depth-toggle";
import { RatioBar } from "../../components/viz";

export const metadata: Metadata = {
  title: "評価対象詳細 | PRISM",
};

export default async function AssessmentIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const result = await loadPipelineView();
  const issue = result.assessment.materialIssues.find((candidate) => candidate.id === issueId);
  if (!issue) notFound();

  const site = result.assessment.sites.find((candidate) => candidate.id === issue.siteId);
  const score = result.assessment.priorityScores.find((candidate) => candidate.materialIssueId === issue.id);
  const decision = result.assessment.depthDecisions.find((candidate) => candidate.materialIssueId === issue.id);
  const sorted = [...result.assessment.priorityScores].sort((a, b) => b.normalizedScore - a.normalizedScore);
  const rank = sorted.findIndex((candidate) => candidate.materialIssueId === issue.id) + 1;
  const ranks = score
    ? {
        sensitivity: computePercentileRanks(sorted.map((s) => s.sensitivity))[Math.max(0, rank - 1)],
        financial: computePercentileRanks(sorted.map((s) => s.financialExposure))[Math.max(0, rank - 1)],
        uncertainty: computePercentileRanks(sorted.map((s) => s.uncertaintyMagnitude))[Math.max(0, rank - 1)],
        disclosure: computePercentileRanks(sorted.map((s) => s.disclosureRequirement))[Math.max(0, rank - 1)],
      }
    : null;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{materialIssueLabel(site?.name, issue.impactCategory, issue.siteId)}</h1>
        </div>
        <ScreenLead>優先度、除外理由、詳細評価への指定状態を確認します</ScreenLead>
      </div>

      <Card title="評価対象の詳細" headExtra={<Tag variant={decision?.depth === "deep_dive" ? "ok" : "neutral"}>{decision?.depth === "deep_dive" ? "詳細評価" : "概算評価"}</Tag>}>
        <KV k="拠点" v={site?.name ?? issue.siteId} />
        <KV k="課題ID" v={issue.id} />
        <KV
          k="自然との関わり"
          v={
            <RatioBar
              value={issue.sensitivityScore}
              total={Number(sensitivityFraction(issue).split("/")[1])}
              label="自然との関わり"
              unit="基準"
            />
          }
        />
        <KV k="優先順位" v={rank > 0 ? `${rank}位` : "優先度未算定"} />
        {score && <KV k="優先度スコア" v={score.normalizedScore.toFixed(3)} />}
        {ranks && (
          <KV
            k="内訳順位"
            v={`自然 ${Math.round(ranks.sensitivity * 100)} / 財務 ${Math.round(ranks.financial * 100)} / 不確実性 ${Math.round(ranks.uncertainty * 100)} / 開示 ${Math.round(ranks.disclosure * 100)}`}
          />
        )}
        <KV k="除外理由" v={issue.exclusionReason ?? decision?.exclusionReason ?? "なし"} />
      </Card>

      {decision && (
        <Card
          id="evaluation-depth"
          title="評価の進め方"
          subtitle="意思決定に必要な精度に合わせて、概算評価と詳細評価を切り替えます"
        >
          <DepthToggle materialIssueId={issue.id} currentDepth={decision.depth} />
          {decision.depth === "deep_dive" && (
            <p className="page-back" style={{ marginBottom: 0 }}>
              <Link href={`/valuation/${encodeURIComponent(issue.id)}`}>この課題の算定結果を確認する →</Link>
            </p>
          )}
        </Card>
      )}

      <p className="page-back">
        <Link href="/assessment">評価対象の一覧へ戻る</Link>
      </p>
      <StepNav current="/assessment" result={result} />
    </div>
  );
}
