import type { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import type { ExclusionRecord } from "@core/disclosure/selective-disclosure";

const UNEVALUATED_REASON_LABEL: Record<string, string> = {
  license_pending: "データ利用契約の確認待ち",
  no_data_source: "判定に使えるデータ源がない",
  site_not_located: "拠点の位置が特定できず未評価",
};

type AssessmentResult = ReturnType<typeof runAssessmentPipeline>;

/** M1・M2の評価除外を、新しい判断を加えずM7の選択的開示入力へ射影する。 */
export function buildDisclosureExclusions(assessment: AssessmentResult): ExclusionRecord[] {
  const siteName = (siteId: string) => assessment.sites.find((site) => site.id === siteId)?.name ?? siteId;
  return [
    ...assessment.materialIssues.filter((issue) => issue.excluded).map((issue) => ({
      siteId: issue.siteId,
      category: issue.impactCategory,
      scope: siteName(issue.siteId),
      kind: "not_assessed" as const,
      reason: issue.exclusionReason ?? "理由不明",
    })),
    ...assessment.depthDecisions.filter((decision) => decision.excludedFromDeepDive).flatMap((decision) => {
      const issue = assessment.materialIssues.find((item) => item.id === decision.materialIssueId);
      return issue ? [{
        siteId: issue.siteId,
        category: issue.impactCategory,
        scope: siteName(issue.siteId),
        kind: "not_deep_dived" as const,
        reason: decision.exclusionReason ?? "優先度が深掘りの閾値に達しなかったため",
      }] : [];
    }),
    ...assessment.materialIssues.filter((issue) => !issue.excluded && issue.unevaluatedCriteria.length > 0).map((issue) => ({
      siteId: issue.siteId,
      category: issue.impactCategory,
      scope: siteName(issue.siteId),
      kind: "criteria_unevaluated" as const,
      reason: `${issue.unevaluatedCriteria.length}件の基準を評価できていません(${[
        ...new Set(issue.unevaluatedCriteria.map((criterion) => UNEVALUATED_REASON_LABEL[criterion.reason])),
      ].join("・")})`,
    })),
  ];
}
