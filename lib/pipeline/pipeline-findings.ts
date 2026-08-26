import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type { GapType } from "@core/types/disclosure";
import type { DivergenceDecomposition, PairwiseDecomposition } from "@core/types/divergence";
import {
  decompositionFactorLabel,
  gapTypeLabel,
  materialIssueLabel,
} from "@/app/components/labels";
import { formatCompactYenRange, formatYen } from "@/app/components/numeric";
import { pairDivergenceRatio } from "./valuation-insights";

export interface Finding {
  id: string;
  headline: string;
  detail: string;
  /** 丸めた金額を出している場合の正確な値(title属性に退避する)。 */
  exact?: string;
  href: string;
  linkLabel: string;
}

/** 手法間の差が「気になる大きさ」かどうかの閾値(従来の④のレッドフラグと同じ1.5倍)。 */
const DIVERGENCE_ALERT_RATIO = 1.5;

/** 開示ギャップの重さの順(前ほど重い)。最も重い指摘を発見サマリーに出すために使う。 */
const GAP_TYPE_SEVERITY: GapType[] = [
  "G1_no_evidence",
  "G3_scope_mismatch",
  "G4_period_mismatch",
  "G2_weak_evidence",
  "G6_selective_disclosure",
];


export function formatCompactYen(value: number): string {
  return formatYen(value);
}

function formatExactYen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

/** 分解の対象(拠点 × カテゴリ)の表示名を引く。IDは画面に出さない(指示06)。 */
function issueLabelForDecomposition(result: DemoPipelineResult, decomposition: DivergenceDecomposition): string {
  const materialIssueId = Object.keys(result.valuation.valuationRecordsByMaterialIssue).find((id) =>
    result.valuation.valuationRecordsByMaterialIssue[id].some(
      (record) => record.physicalQuantityId === decomposition.targetPhysicalQuantityId
    )
  );
  const issue = result.assessment.materialIssues.find((i) => i.id === materialIssueId);
  const siteName = result.assessment.sites.find((s) => s.id === decomposition.siteId)?.name;
  if (!issue) return siteName ?? decomposition.siteId;
  return materialIssueLabel(siteName, issue.impactCategory, decomposition.siteId);
}

/** 差の主因。寄与が分解できていない(残差が支配的な)場合はそれを正直に書く。 */
function dominantFactorLabel(pair: PairwiseDecomposition): string {
  let best: { label: string; weight: number } | null = null;
  for (const contribution of pair.contributions) {
    if (contribution.status !== "decomposed") continue;
    const weight = Math.abs(contribution.logContribution);
    if (!best || weight > best.weight) {
      best = { label: decompositionFactorLabel(contribution.factor), weight };
    }
  }
  const residualWeight = pair.residual ? Math.abs(pair.residual.logResidual) : 0;
  if (!best || residualWeight > best.weight) return "分解できない残差(方法そのものの違い)";
  return best.label;
}


export function joinSiteNames(names: string[]): string {
  if (names.length <= 2) return names.join("・");
  return `${names.slice(0, 2).join("・")}ほか${names.length - 2}拠点`;
}


export function deriveFindings(result: DemoPipelineResult): Finding[] {
  const findings: Finding[] = [];
  const { decisions, disclosure, valuation } = result;

  // 1. 手法間の乖離。価値概念(交換/厚生)をまたいだ比較はしない(合算禁止、concept-v2 §8.2)。
  let widest: { ratio: number; decomposition: DivergenceDecomposition; pair: PairwiseDecomposition; concept: string } | null =
    null;
  for (const decomposition of valuation.divergenceDecompositions) {
    for (const group of decomposition.groups) {
      for (const pair of group.pairwiseDecompositions) {
        const ratio = pairDivergenceRatio(pair);
        if (ratio === null || ratio <= DIVERGENCE_ALERT_RATIO) continue;
        if (!widest || ratio > widest.ratio) {
          widest = { ratio, decomposition, pair, concept: group.valueConcept };
        }
      }
    }
  }
  if (widest) {
    const low = Math.min(widest.pair.valueA, widest.pair.valueB);
    const high = Math.max(widest.pair.valueA, widest.pair.valueB);
    const conceptNote =
      widest.concept === "welfare"
        ? "これは社会全体への影響(開示にのみ使用する参考値)どうしの比較で、投資判断には使用しません。"
        : "これは投資判断に使う交換価値どうしの比較です。";
    findings.push({
      id: "finding-divergence",
      // 指示B:両端を別々にformatCompactYenすると単位が混在する(「57,761円〜12.6百万円」)。
      // 共通スケールを1つ選ぶformatCompactYenRangeで両端の単位を揃える。
      headline: `${issueLabelForDecomposition(result, widest.decomposition)}の試算は、算定方法によって年${formatCompactYenRange(
        low,
        high
      )}(最大${widest.ratio.toFixed(1)}倍)の幅がある`,
      detail: `差の主因は${dominantFactorLabel(widest.pair)}で、精度の問題ではありません。${conceptNote}`,
      exact: `${formatExactYen(low)} 〜 ${formatExactYen(high)}`,
      href: "/valuation",
      linkLabel: "価値の算定で詳細",
    });
  }

  // 2. ★判定。「またぐ」「またがない」はどちらも確定した結論として出す。
  const crossing = decisions.filter((d) => d.decision.decisionRecord.verdict === "crosses").map((d) => d.siteName);
  const notCrossing = decisions.filter((d) => d.decision.decisionRecord.verdict === "does_not_cross").map((d) => d.siteName);
  if (crossing.length > 0) {
    findings.push({
      id: "finding-verdict-crosses",
      headline: `${joinSiteNames(crossing)}では、自然コストを織り込むと投資判断の結論が変わる可能性がある`,
      detail:
        "試算の幅が投資の承認ラインと交差しています。対策案と反映先の見直しが必要かどうかを確認してください。",
      href: "/decision",
      linkLabel: "対策と判定で詳細",
    });
  }
  if (notCrossing.length > 0) {
    findings.push({
      id: "finding-verdict-does-not-cross",
      headline: `${joinSiteNames(notCrossing)}では、自然コストを織り込んでも投資判断の結論は変わらない`,
      detail:
        "この論点は今回の投資判断を変えない、と根拠をもって確定できました。追加の調査は不要です。",
      href: "/decision",
      linkLabel: "対策と判定で詳細",
    });
  }

  // 3. 減損テストの前提に抵触する拠点。
  const impairment = decisions.filter((d) => d.comparisonTargets.impairmentTestImpact.changesAssumption);
  if (impairment.length > 0) {
    const totalDebt = impairment.reduce((sum, d) => sum + (d.financialBridge.natureDebt.totalDebt), 0);
    findings.push({
      id: "finding-impairment",
      headline: `${joinSiteNames(impairment.map((d) => d.siteName))}の自然債務${formatCompactYen(
        totalDebt
      )}は、減損テストの前提の見直しが必要な水準`,
      detail:
        impairment.length === 1
          ? impairment[0].comparisonTargets.impairmentTestImpact.details
          : `${impairment.length}拠点で、自然債務が既存の減損テスト前提の閾値を上回っています。`,
      exact: formatExactYen(totalDebt),
      href: "/financial-bridge",
      linkLabel: "財務への影響で詳細",
    });
  }

  // 4. 開示の根拠が不足している記載と、最も重い指摘の種別。
  const gapTypes = disclosure.gapFindings
    .map((finding) => finding.gapType)
    .filter((gapType): gapType is GapType => gapType !== null);
  if (gapTypes.length > 0) {
    const severest = GAP_TYPE_SEVERITY.find((type) => gapTypes.includes(type)) ?? gapTypes[0];
    findings.push({
      id: "finding-disclosure-gap",
      headline: `開示文言${gapTypes.length}件で、記載内容に対する根拠が不足している`,
      detail: `最も重い指摘は「${gapTypeLabel(severest)}」です。記載を弱める・根拠を追加取得する・判断の理由を記録する、のいずれかで対応します。`,
      href: "/disclosure",
      linkLabel: "開示への反映で詳細",
    });
  }

  return findings;
}

