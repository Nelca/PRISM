import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { formatYen } from "@/app/components/numeric";
import {
  decompositionForMaterialIssue,
  materialIssueIdsWithoutRepresentativeSelection,
  maxDivergenceRatio,
  sitesWithDegenerateRepresentative,
} from "./valuation-insights";

export interface OpenTask {
  /** Reactのkeyと重複排除に使う内部キー。画面には出さない。 */
  id: string;
  text: string;
  /** タスクを所有する業務工程。子URLへ遷移してもナビと残件数を親工程へ集約する。 */
  section: "/sites" | "/assessment" | "/valuation" | "/financial-bridge" | "/decision" | "/disclosure";
  href: string;
  linkLabel: string;
  /**
   * その画面内の該当カードのアンカーID(第4版 D-11-1)。頭出しバナーが
   * `#anchor` へのページ内リンクに使う。該当カードが1つに定まらない場合は省略。
   */
  anchor?: string;
}

const DIVERGENCE_ALERT_RATIO = 1.5;

export function formatCompactYen(value: number): string {
  return formatYen(value);
}

export function joinSiteNames(names: string[]): string {
  if (names.length <= 2) return names.join("・");
  return `${names.slice(0, 2).join("・")}ほか${names.length - 2}拠点`;
}

/**
 * 未完了の必須判断(指示13)。
 * 該当がなければその行は出さない(固定文言のレッドフラグにはしない、T-07)。
 */
export function deriveOpenTasks(result: DemoPipelineResult): OpenTask[] {
  const tasks: OpenTask[] = [];
  const { decisions, disclosure, valuation } = result;

  if (result.deferredDecisions.length > 0) {
    tasks.push({ id: "decision-inputs", section: "/decision", href: "/decision#deferred-decisions", text: `投資の前提が未入力:${result.deferredDecisions.length}拠点（価値算定は利用できます）`, linkLabel: "投資の前提を追加" });
  }

  // ③ 手法間の乖離:実際の分解結果から最大倍率を取る
  const valuationIssueIds = Object.keys(valuation.valuationRecordsByMaterialIssue);
  const divergenceTargets = valuation.divergenceDecompositions
    .map((decomposition) => ({
      ratio: maxDivergenceRatio(decomposition),
      issueId: valuationIssueIds.find((issueId) => decompositionForMaterialIssue(result, issueId) === decomposition),
    }))
    .filter((entry): entry is { ratio: number; issueId: string | undefined } => entry.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio);
  const maxDivergence = divergenceTargets[0];
  const maxRatio = maxDivergence?.ratio ?? null;
  if (maxRatio !== null && maxRatio > DIVERGENCE_ALERT_RATIO) {
    tasks.push({
      id: "divergence",
      anchor: "pair-comparison",
      text: `算定結果の差:最大${maxRatio.toFixed(1)}倍`,
      section: "/valuation",
      href: maxDivergence?.issueId ? `/analysis?issue=${encodeURIComponent(maxDivergence.issueId)}` : "/analysis",
      linkLabel: "確認する",
    });
  }

  // ③ 代表値が未選択(既定値のまま)の課題があるか。判定は③の画面と同じ関数を使う(D-02)。
  const unselectedIssueIds = materialIssueIdsWithoutRepresentativeSelection(result);
  const unselected = unselectedIssueIds.length;
  if (unselected > 0) {
    tasks.push({
      id: "representative-value",
      anchor: "representative-selection",
      text: `代表値が未選択:${unselected}件`,
      section: "/valuation",
      href: `/valuation/${encodeURIComponent(unselectedIssueIds[0])}`,
      linkLabel: "代表値を選ぶ",
    });
  }

  /**
   * ③④ 縮退した代表値(中心値0円)が未内部化コストを負にし、利益への影響がプラス方向に
   * 反転している拠点(2026-08-23レビュー第3回で発見)。判定は `sitesWithDegenerateRepresentative`
   * に集約し、ホームの発見・④の警告カードと同じ関数を参照する。
   */
  const degenerate = sitesWithDegenerateRepresentative(result);
  if (degenerate.length > 0) {
    const affectedSites = joinSiteNames(degenerate.map((entry) => entry.siteName));
    const totalNegativeCost = degenerate.reduce((sum, d) => sum + Math.min(0, d.uninternalizedCost), 0);
    const degenerateIssueId = result.assessment.materialIssues.find(
      (issue) => issue.siteId === degenerate[0]?.siteId && valuation.valuationRecordsByMaterialIssue[issue.id]?.length > 0
    )?.id;
    tasks.push({
      id: "degenerate-representative",
      anchor: "representative-selection",
      text:
        totalNegativeCost < 0
          ? `${affectedSites}:未内部化コストが負(${formatCompactYen(totalNegativeCost)})`
          : `${affectedSites}:代表値と利益影響を確認`,
      section: "/valuation",
      href: degenerateIssueId ? `/valuation/${encodeURIComponent(degenerateIssueId)}` : "/valuation",
      linkLabel: "確認する",
    });
  }

  /**
   * ⑤ 承認閾値が未入力で判定が保留のままの拠点(指示13で追加)。
   * 「仮の値を置かず保留にする」現仕様(M6 D-10)は正しいので、**誰に聞けば
   * 保留を解けるのか**まで書く。
   */
  const pendingEntries = decisions.filter((d) => d.decision.decisionRecord.verdict === "pending");
  const pendingSites = pendingEntries.map((d) => d.siteName);
  if (pendingSites.length > 0) {
    const scope = pendingSites.length === 1 ? `${pendingSites[0]}で` : `${pendingSites.length}拠点で`;
    tasks.push({
      id: "approval-threshold",
      anchor: "site-summary",
      text: `${scope}承認ラインが未入力(財務・経営企画部門へ確認)`,
      section: "/decision",
      href: `/decision/${encodeURIComponent(pendingEntries[0].siteId)}`,
      linkLabel: "承認ラインを入力",
    });
  }

  // ⑤ 明示的な選択の有無で判定する。参考記載を選んだ拠点は未完了にしない。
  const weakBindingEntries = decisions.filter((d) => !d.bindingConfirmed);
  const weakBinding = weakBindingEntries.length;
  if (weakBinding > 0) {
    tasks.push({
      id: "binding-mechanism",
      anchor: "site-summary",
      text: `結果の反映先が未選択:${weakBinding}件`,
      section: "/decision",
      href: `/decision/${encodeURIComponent(weakBindingEntries[0].siteId)}`,
      linkLabel: "反映先を決める",
    });
  }

  // ⑤ 減損テストの前提を変える拠点があるか(実際の比較先の判定を使う)
  const impairmentAffectedEntries = decisions.filter((d) => d.comparisonTargets.impairmentTestImpact.changesAssumption);
  const impairmentAffected = impairmentAffectedEntries.length;
  if (impairmentAffected > 0) {
    tasks.push({
      id: "impairment",
      anchor: "site-summary",
      text: `自然債務が減損テストの目安額を超過:${impairmentAffected}拠点`,
      section: "/decision",
      href: `/decision/${encodeURIComponent(impairmentAffectedEntries[0].siteId)}`,
      linkLabel: "対策を検討",
    });
  }

  // ⑥ 開示の根拠が不足している記載
  const openGapFindings = disclosure.gapFindings.filter((f) => f.gapType !== null);
  const gapsFound = openGapFindings.length;
  if (gapsFound > 0) {
    tasks.push({
      id: "disclosure-gap",
      anchor: "gap-findings",
      text: `根拠不足の開示文言:${gapsFound}件`,
      section: "/disclosure",
      href: `/disclosure/${encodeURIComponent(openGapFindings[0].id)}`,
      linkLabel: "確認する",
    });
  }

  // 解消できる未入力を先に案内する。算定差や減損の参考情報で入力を遮らない。
  const order = ["representative-value", "decision-inputs", "approval-threshold", "binding-mechanism", "degenerate-representative", "disclosure-gap", "divergence", "impairment"];
  return tasks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
