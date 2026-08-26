import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { bindingLabel } from "@/app/components/labels";
import { formatYen } from "@/app/components/numeric";
import {
  materialIssueIdsWithoutRepresentativeSelection,
  maxDivergenceRatio,
  sitesWithDegenerateRepresentative,
} from "./valuation-insights";

export interface OpenTask {
  /** Reactのkeyと重複排除に使う内部キー。画面には出さない。 */
  id: string;
  text: string;
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

  // ③ 手法間の乖離:実際の分解結果から最大倍率を取る
  const ratios = valuation.divergenceDecompositions
    .map(maxDivergenceRatio)
    .filter((ratio): ratio is number => ratio !== null);
  const maxRatio = ratios.length > 0 ? Math.max(...ratios) : null;
  if (maxRatio !== null && maxRatio > DIVERGENCE_ALERT_RATIO) {
    tasks.push({
      id: "divergence",
      anchor: "pair-comparison",
      text: `算定方法によって試算結果に最大${maxRatio.toFixed(1)}倍の差がある。代表値の選択理由を確認してください。`,
      href: "/valuation",
      linkLabel: "確認する",
    });
  }

  // ③ 代表値が未選択(既定値のまま)の課題があるか。判定は③の画面と同じ関数を使う(D-02)。
  const unselected = materialIssueIdsWithoutRepresentativeSelection(result).length;
  if (unselected > 0) {
    tasks.push({
      id: "representative-value",
      anchor: "representative-selection",
      text: `${unselected}件の課題で、投資判断に使う代表値がまだ選択されていない(既定値を使用中)。`,
      href: "/valuation",
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
    /**
     * 原因は2種類あり、文言で区別する(2026-08-23レビュー指摘2):
     * ①中心値0円の代表値が選択されている拠点、②中心値は非ゼロだが既内部化コストが
     * 試算値を上回る拠点。①だけの文で②の拠点まで括ると不正確になる。
     */
    const zeroSites = degenerate.filter((d) => d.zeroRepresentative);
    const belowPaidSites = degenerate.filter((d) => !d.zeroRepresentative);
    const causeParts: string[] = [];
    if (zeroSites.length > 0) {
      causeParts.push(`「${joinSiteNames(zeroSites.map((d) => d.siteName))}」で選択中の代表値の中心値が0円`);
    }
    if (belowPaidSites.length > 0) {
      causeParts.push(`「${joinSiteNames(belowPaidSites.map((d) => d.siteName))}」で試算値(代表値)が内部化済みコストを下回っている`);
    }
    const cause = causeParts.join("、また");
    const totalNegativeCost = degenerate.reduce((sum, d) => sum + Math.min(0, d.uninternalizedCost), 0);
    tasks.push({
      id: "degenerate-representative",
      anchor: "representative-selection",
      text:
        totalNegativeCost < 0
          ? `${cause}ため、未内部化コストが負(${formatCompactYen(
              totalNegativeCost
            )})になり、利益への影響がプラス方向に算出されています。代表値の選択が妥当か確認してください。`
          : `${cause}ため、利益への影響の算出が実態と逆方向になっている可能性があります。代表値の選択が妥当か確認してください。`,
      href: "/valuation",
      linkLabel: "確認する",
    });
  }

  /**
   * ⑤ 承認閾値が未入力で判定が保留のままの拠点(指示13で追加)。
   * 「仮の値を置かず保留にする」現仕様(M6 D-10)は正しいので、**誰に聞けば
   * 保留を解けるのか**まで書く。
   */
  const pendingSites = decisions
    .filter((d) => d.decision.decisionRecord.verdict === "pending")
    .map((d) => d.siteName);
  if (pendingSites.length > 0) {
    const scope = pendingSites.length === 1 ? `${pendingSites[0]}で` : `${pendingSites.length}拠点で`;
    tasks.push({
      id: "approval-threshold",
      anchor: "site-summary",
      text: `${scope}投資の承認ラインが未入力のため判定が保留中です(財務・経営企画部門への確認が必要)。`,
      href: "/decision",
      linkLabel: "承認ラインを入力",
    });
  }

  // ⑤ 反映先が「弱」(参考記載)のままの拠点。R-3(単一値方式と同じ運命)への対応。
  const weakBinding = decisions.filter((d) => d.decision.decisionRecord.bindingMechanism.kind === "weak_reference").length;
  if (weakBinding > 0) {
    tasks.push({
      id: "binding-mechanism",
      anchor: "site-summary",
      text: `${weakBinding}件の判定が「${bindingLabel("weak_reference")}」のままで、社内制度に拘束されていない。`,
      href: "/decision",
      linkLabel: "反映先を決める",
    });
  }

  // ⑤ 減損テストの前提を変える拠点があるか(実際の比較先の判定を使う)
  const impairmentAffected = decisions.filter((d) => d.comparisonTargets.impairmentTestImpact.changesAssumption).length;
  if (impairmentAffected > 0) {
    tasks.push({
      id: "impairment",
      anchor: "site-summary",
      text: `${impairmentAffected}拠点で、自然債務が既存の減損テスト前提の閾値を上回っている。`,
      href: "/decision",
      linkLabel: "対策を検討",
    });
  }

  // ⑥ 開示の根拠が不足している記載
  const gapsFound = disclosure.gapFindings.filter((f) => f.gapType !== null).length;
  if (gapsFound > 0) {
    tasks.push({
      id: "disclosure-gap",
      anchor: "gap-findings",
      text: `開示文言${gapsFound}件で、記載内容に対する根拠が不足している。`,
      href: "/disclosure",
      linkLabel: "確認する",
    });
  }

  return tasks;
}
