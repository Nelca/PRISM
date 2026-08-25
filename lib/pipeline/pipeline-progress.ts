import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { materialIssueIdsWithoutRepresentativeSelection } from "./valuation-insights";

export interface StepProgress {
  order: number;
  href: string;
  label: string;
  note: string;
  done: boolean;
}

export interface OutcomeSummary {
  siteCount: number;
  valuation: { total: number; selected: number };
  verdicts: { total: number; crosses: number; doesNotCross: number; pending: number };
  disclosure: { total: number; handled: number };
  assumptionEntryCount: number;
}

interface ProgressCounts {
  siteCount: number;
  issueCount: number;
  promoted: number;
  decompositionCount: number;
  selected: number;
  decisionCount: number;
  confirmed: number;
  gapCount: number;
  handledGaps: number;
}

function countProgress(result: DemoPipelineResult): ProgressCounts {
  const { assessment, decisions, disclosure, valuation } = result;
  const gapFindings = disclosure.gapFindings;
  return {
    siteCount: assessment.sites.length,
    issueCount: assessment.priorityScores.length,
    promoted: assessment.depthDecisions.filter((decision) => decision.depth === "deep_dive").length,
    decompositionCount: valuation.divergenceDecompositions.length,
    selected:
      valuation.divergenceDecompositions.length - materialIssueIdsWithoutRepresentativeSelection(result).length,
    decisionCount: decisions.length,
    confirmed: decisions.filter((decision) => decision.decision.decisionRecord.verdict !== "pending").length,
    gapCount: gapFindings.length,
    handledGaps: gapFindings.filter(
      (finding) =>
        finding.gapType === null ||
        disclosure.intentionalDecisionRecords.some((record) => record.gapFindingId === finding.id)
    ).length,
  };
}

export function deriveStepProgress(result: DemoPipelineResult): StepProgress[] {
  const counts = countProgress(result);
  return [
    { order: 1, href: "/sites", label: "拠点データの登録", note: `拠点${counts.siteCount}件`, done: counts.siteCount > 0 },
    {
      order: 2,
      href: "/assessment",
      label: "評価対象の絞り込み",
      note: `評価対象${counts.issueCount}件・詳細評価${counts.promoted}件`,
      done: counts.issueCount > 0,
    },
    {
      order: 3,
      href: "/valuation",
      label: "価値の算定",
      note:
        counts.decompositionCount > 0
          ? `代表値の選択 ${counts.selected}/${counts.decompositionCount}件`
          : "算定結果はまだありません",
      done: counts.decompositionCount > 0 && counts.selected === counts.decompositionCount,
    },
    {
      order: 4,
      href: "/financial-bridge",
      label: "財務への影響",
      note: counts.decisionCount > 0 ? `${counts.decisionCount}拠点で試算済み` : "試算対象がまだありません",
      done: counts.decisionCount > 0,
    },
    {
      order: 5,
      href: "/decision",
      label: "対策と判定",
      note:
        counts.decisionCount > 0
          ? `判定確定 ${counts.confirmed}/${counts.decisionCount}件`
          : "判定対象がまだありません",
      done: counts.decisionCount > 0 && counts.confirmed === counts.decisionCount,
    },
    {
      order: 6,
      href: "/disclosure",
      label: "開示への反映",
      note: counts.gapCount > 0 ? `確認済み ${counts.handledGaps}/${counts.gapCount}件` : "確認対象の記載がありません",
      done: counts.gapCount > 0 && counts.handledGaps === counts.gapCount,
    },
  ];
}

export function deriveOutcomeSummary(result: DemoPipelineResult): OutcomeSummary {
  const counts = countProgress(result);
  const verdicts = result.decisions.map((entry) => entry.decision.decisionRecord.verdict);
  return {
    siteCount: counts.siteCount,
    valuation: { total: counts.decompositionCount, selected: counts.selected },
    verdicts: {
      total: verdicts.length,
      crosses: verdicts.filter((verdict) => verdict === "crosses").length,
      doesNotCross: verdicts.filter((verdict) => verdict === "does_not_cross").length,
      pending: verdicts.filter((verdict) => verdict === "pending").length,
    },
    disclosure: { total: counts.gapCount, handled: counts.handledGaps },
    assumptionEntryCount: result.assumptionEntries.length,
  };
}

export function deriveStepContext(result: DemoPipelineResult, href: string): string | null {
  const c = countProgress(result);
  switch (href) {
    case "/sites":
      return c.siteCount > 0 ? `登録済みの拠点${c.siteCount}件を確認し、必要なら追加・修正します。` : "評価の対象になる拠点をまず登録します。";
    case "/assessment":
      return c.issueCount > 0 ? `評価対象${c.issueCount}件の優先度を確認し、詳細評価に進める課題を指定します(現在${c.promoted}件)。` : "評価対象がまだありません。拠点を登録すると優先度が算定されます。";
    case "/valuation":
      return c.promoted > 0 ? `詳細評価に指定した${c.promoted}件の算定結果を確認し、代表値を選びます(選択済み${c.selected}/${c.decompositionCount}件)。` : "詳細評価に指定した課題がないため、算定結果はまだありません。";
    case "/financial-bridge":
      return c.decisionCount > 0 ? `${c.decisionCount}拠点について、選んだ代表値が利益・リスクにどう効くかを確認します。` : "試算の対象がまだありません。";
    case "/decision":
      return c.decisionCount > 0 ? `${c.decisionCount}拠点の対策案を比べ、投資の承認ラインと照らした判定を確定します(確定済み${c.confirmed}/${c.decisionCount}拠点)。` : "判定の対象がまだありません。";
    case "/disclosure":
      return c.gapCount > 0 ? `開示文言${c.gapCount}件について、記載と根拠の整合を確認します(確認済み${c.handledGaps}/${c.gapCount}件)。` : "確認対象の開示文言がまだありません。";
    default:
      return null;
  }
}
