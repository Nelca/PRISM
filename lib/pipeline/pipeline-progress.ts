import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import {
  materialIssueIdsRequiringRepresentativeSelection,
  materialIssueIdsWithWelfareOnlyValuation,
  materialIssueIdsWithoutRepresentativeSelection,
} from "./valuation-insights";

export interface StepProgress {
  order: number;
  href: string;
  label: string;
  note: string;
  done: boolean;
}

export interface OutcomeSummary {
  siteCount: number;
  valuation: {
    total: number;
    prioritized: number;
    deepDive: number;
    valued: number;
    representativeRequired: number;
    selected: number;
    welfareOnly: number;
  };
  verdicts: { total: number; crosses: number; doesNotCross: number; pending: number };
  disclosure: { total: number; handled: number };
  assumptionEntryCount: number;
}

export interface ProgressCounts {
  siteCount: number;
  total: number;
  prioritized: number;
  deepDive: number;
  valued: number;
  representativeRequired: number;
  selected: number;
  welfareOnly: number;
  decisionCount: number;
  confirmed: number;
  gapCount: number;
  handledGaps: number;
}

export function countProgress(result: DemoPipelineResult): ProgressCounts {
  const { assessment, decisions, disclosure, valuation } = result;
  const gapFindings = disclosure.gapFindings;
  const representativeRequired = materialIssueIdsRequiringRepresentativeSelection(result).length;
  const unselected = materialIssueIdsWithoutRepresentativeSelection(result).length;
  return {
    siteCount: assessment.sites.length,
    total: assessment.materialIssues.length,
    prioritized: assessment.priorityScores.length,
    deepDive: assessment.depthDecisions.filter((decision) => decision.depth === "deep_dive").length,
    valued: Object.values(valuation.valuationRecordsByMaterialIssue).filter((records) => records.length > 0).length,
    representativeRequired,
    selected: representativeRequired - unselected,
    welfareOnly: materialIssueIdsWithWelfareOnlyValuation(result).length,
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
      note: `全課題${counts.total}件・優先度算定済み${counts.prioritized}件・詳細評価${counts.deepDive}件`,
      done: counts.total > 0 && counts.prioritized > 0,
    },
    {
      order: 3,
      href: "/valuation",
      label: "価値の算定",
      note:
        counts.valued > 0
          ? counts.representativeRequired > 0
            ? `算定済み${counts.valued}件・代表値 ${counts.selected}/${counts.representativeRequired}件・厚生価値のみ${counts.welfareOnly}件`
            : `算定済み${counts.valued}件・代表値選択は不要・厚生価値のみ${counts.welfareOnly}件`
          : "算定結果はまだありません",
      done: counts.valued > 0 && counts.selected === counts.representativeRequired,
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
          ? `判定確定 ${counts.confirmed}/${counts.decisionCount}件・反映先記録 ${result.decisions.filter((entry) => entry.bindingConfirmed).length}/${counts.decisionCount}件${result.deferredDecisions.length > 0 ? `・投資前提待ち${result.deferredDecisions.length}拠点` : ""}`
          : "判定対象がまだありません",
      done: counts.decisionCount > 0 && counts.confirmed === counts.decisionCount && result.deferredDecisions.length === 0 && result.decisions.every((entry) => entry.bindingConfirmed),
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
    valuation: {
      total: counts.total,
      prioritized: counts.prioritized,
      deepDive: counts.deepDive,
      valued: counts.valued,
      representativeRequired: counts.representativeRequired,
      selected: counts.selected,
      welfareOnly: counts.welfareOnly,
    },
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
      return c.total > 0 ? `全課題${c.total}件のうち優先度算定済み${c.prioritized}件を確認し、詳細評価に進める課題を指定します(現在${c.deepDive}件)。` : "評価対象がまだありません。拠点を登録すると優先度が算定されます。";
    case "/valuation":
      return c.deepDive > 0 ? `詳細評価に指定した${c.deepDive}件の算定結果を確認し、代表値が必要な${c.representativeRequired}件を選びます(選択済み${c.selected}件)。` : "詳細評価に指定した課題がないため、算定結果はまだありません。";
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
