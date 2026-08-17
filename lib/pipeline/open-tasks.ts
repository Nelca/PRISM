/**
 * 「未完了の必須判断」「工程の進捗」「分かったこと(発見)」を、パイプライン結果の
 * 1箇所から導出する(指示13・04・14)。
 *
 * ここに集約する理由:財務評価が「適切」であるためにユーザー自身が行うべき判断
 * (代表値の選択・承認閾値の入力・反映先の決定・開示ギャップへの対応)は、
 * 従来④の「重要な論点」カードにしか出ておらず、そこへ到達する前のユーザーには
 * 見えなかった。ホーム(指示04)と④が同じ関数を参照する。
 *
 * **文言はテンプレート+数値の機械的な埋め込みのみ。**固定のレッドフラグ文言は置かず
 * (T-07)、AIによる文章生成もしない(M7の下書きと同じ方針)。断定は verdict など
 * 事実として確定している範囲に限る。
 */

import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type { GapType } from "@core/types/disclosure";
import type { DivergenceDecomposition, PairwiseDecomposition } from "@core/types/divergence";
import {
  bindingLabel,
  decompositionFactorLabel,
  gapTypeLabel,
  materialIssueLabel,
} from "@/app/components/labels";
import { formatYen } from "@/app/components/numeric";

/** 未完了の必須判断。ホームのチェックリストと④の「重要な論点」が同じ配列を描く。 */
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

/** 6ステップの工程と完了状態(ホームの進捗ブロックだけが描く。常設ナビには出さない)。 */
export interface StepProgress {
  order: number;
  href: string;
  label: string;
  /** 件数など、その工程の現状を1行で示す補足。 */
  note: string;
  done: boolean;
}

/** 実データから導出した発見。結論(headline)を先に書き、理由(detail)を添える。 */
export interface Finding {
  id: string;
  headline: string;
  detail: string;
  /** 丸めた金額を出している場合の正確な値(title属性に退避する)。 */
  exact?: string;
  href: string;
  linkLabel: string;
}

/* --------------------------------------------------------------------------
   代表値の選択状況(第4版 D-02)
   -------------------------------------------------------------------------- */

/**
 * 課題(MaterialIssue)に対応する乖離分解を引く。
 *
 * `runValuationPipeline` は分解のIDを `dd-${materialIssueId}` で作る
 * (packages/core/src/pipeline/valuation-pipeline.ts)。以前は③の画面が
 * 「レコードの物理量ID」経由で引き当てており、④・ホームの `deriveOpenTasks` とは
 * 別経路だった。**同じ課題を指しているのに判定が食い違う余地があったため、
 * 引き当ても判定もこの1箇所に集約する。**
 */
export function decompositionForMaterialIssue(
  result: DemoPipelineResult,
  materialIssueId: string
): DivergenceDecomposition | undefined {
  return result.valuation.divergenceDecompositions.find((d) => d.id === `dd-${materialIssueId}`);
}

/**
 * 「利用者が代表値を明示的に選んだ」課題かどうか。
 *
 * `representativeValueSelection` は、利用者が理由付きで手法を選んだときにだけ
 * coreが載せる(M4 §7.4)。**既定の代表値(代替費用法)のまま運用している課題とは
 * 明確に区別する。**未選択の課題にドットや案内リンクを出す判定は、③の画面も
 * ホーム/④の未完了タスクも、必ずこの関数を通す。
 */
export function hasRepresentativeSelection(result: DemoPipelineResult, materialIssueId: string): boolean {
  return decompositionForMaterialIssue(result, materialIssueId)?.representativeValueSelection !== undefined;
}

/** まだ代表値を選んでいない(既定値のまま運用中の)課題のID。 */
export function materialIssueIdsWithoutRepresentativeSelection(result: DemoPipelineResult): string[] {
  return Object.keys(result.valuation.valuationRecordsByMaterialIssue).filter(
    (materialIssueId) =>
      decompositionForMaterialIssue(result, materialIssueId) !== undefined &&
      !hasRepresentativeSelection(result, materialIssueId)
  );
}

/** 手法間の差が「何倍」かを示す倍率。比が1未満のときは逆数を取る(向きは問わない)。 */
export function pairDivergenceRatio(pair: PairwiseDecomposition): number | null {
  const ratio = pair.ratio;
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return null;
  return ratio >= 1 ? ratio : 1 / ratio;
}

/** 1つの分解結果のなかで最も大きい手法間の倍率。比較できるペアが無ければ null。 */
export function maxDivergenceRatio(decomposition: DivergenceDecomposition): number | null {
  const ratios = decomposition.groups
    .flatMap((group) => group.pairwiseDecompositions.map(pairDivergenceRatio))
    .filter((ratio): ratio is number => ratio !== null);
  return ratios.length > 0 ? Math.max(...ratios) : null;
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

/**
 * 金額の丸め表示(億円/百万円)。桁が大きい金額を本文に埋めると読み違えるため、
 * 本文は丸めた値、正確な値は Finding.exact(title属性)に置く。
 * 丸め方は app/components/numeric.tsx の Num コンポーネント(指示09)と揃えてあり、
 * 実体はそちらの formatYen を再利用する(open-tasksはサーバー側モジュールだが、
 * app/components/labels からの import は既に行っており、この方向のimportは問題ない)。
 */
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

/** 拠点名の列挙(多すぎる場合は先頭2件+「ほか◯拠点」)。 */
function joinSiteNames(names: string[]): string {
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
      text: `${scope}承認閾値が未入力のため判定が保留中です(財務・経営企画部門への確認が必要)。`,
      href: "/decision",
      linkLabel: "閾値を入力する",
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

/**
 * 各工程の件数。工程の進捗(deriveStepProgress)と、画面末尾の文脈文
 * (deriveStepContext)が同じ数え方を共有するための内部ヘルパー。
 * 「ホームの進捗」と「画面末尾の次リンク」で件数が食い違わないようにする。
 */
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
  const decompositions = valuation.divergenceDecompositions;
  const gapFindings = disclosure.gapFindings;

  return {
    siteCount: assessment.sites.length,
    issueCount: assessment.priorityScores.length,
    promoted: assessment.depthDecisions.filter((d) => d.depth === "deep_dive").length,
    decompositionCount: decompositions.length,
    // 「選択済み◯/◯件」も③の画面と同じ判定から数える(D-02)。
    selected: decompositions.length - materialIssueIdsWithoutRepresentativeSelection(result).length,
    decisionCount: decisions.length,
    confirmed: decisions.filter((d) => d.decision.decisionRecord.verdict !== "pending").length,
    gapCount: gapFindings.length,
    handledGaps: gapFindings.filter(
      (finding) =>
        finding.gapType === null ||
        disclosure.intentionalDecisionRecords.some((record) => record.gapFindingId === finding.id)
    ).length,
  };
}

/**
 * 6ステップの工程と完了状態(指示04(a))。
 * 完了判定はすべてパイプライン結果から導く。件数Statはここに吸収する。
 */
export function deriveStepProgress(result: DemoPipelineResult): StepProgress[] {
  const {
    siteCount,
    issueCount,
    promoted,
    decompositionCount,
    selected,
    decisionCount,
    confirmed,
    gapCount,
    handledGaps,
  } = countProgress(result);

  return [
    {
      order: 1,
      href: "/sites",
      label: "データと拠点の登録",
      note: `拠点${siteCount}件`,
      done: siteCount > 0,
    },
    {
      order: 2,
      href: "/assessment",
      label: "評価対象の絞り込み",
      note: `評価対象${issueCount}件・詳細評価${promoted}件`,
      done: issueCount > 0,
    },
    {
      order: 3,
      href: "/valuation",
      label: "価値の算定と代表値の選択",
      note: decompositionCount > 0 ? `代表値の選択 ${selected}/${decompositionCount}件` : "算定結果はまだありません",
      done: decompositionCount > 0 && selected === decompositionCount,
    },
    {
      order: 4,
      href: "/financial-bridge",
      label: "財務への影響",
      note: decisionCount > 0 ? `${decisionCount}拠点で試算済み` : "試算対象がまだありません",
      done: decisionCount > 0,
    },
    {
      order: 5,
      href: "/decision",
      label: "対策と判定",
      note: decisionCount > 0 ? `判定確定 ${confirmed}/${decisionCount}件` : "判定対象がまだありません",
      done: decisionCount > 0 && confirmed === decisionCount,
    },
    {
      order: 6,
      href: "/disclosure",
      label: "開示への反映",
      note: gapCount > 0 ? `確認済み ${handledGaps}/${gapCount}件` : "確認対象の記載がありません",
      done: gapCount > 0 && handledGaps === gapCount,
    },
  ];
}

/**
 * その画面に入ると何が待っているかを、実データの件数で1行にする(第3版 C-03-2)。
 *
 * 画面末尾の StepNav が「次:◯◯ →」に添える文脈文。工程の件数は
 * `deriveStepProgress`(ホームの進捗)と同じ `countProgress` から取るため、
 * ホームと各画面で数が食い違うことがない。
 *
 * **文言はテンプレート+件数の機械的な埋め込みのみ。**推奨も予測もしない。
 */
export function deriveStepContext(result: DemoPipelineResult, href: string): string | null {
  const { siteCount, issueCount, promoted, decompositionCount, selected, decisionCount, confirmed, gapCount, handledGaps } =
    countProgress(result);

  switch (href) {
    case "/sites":
      return siteCount > 0
        ? `登録済みの拠点${siteCount}件を確認し、必要なら追加・修正します。`
        : "評価の対象になる拠点をまず登録します。";
    case "/assessment":
      return issueCount > 0
        ? `評価対象${issueCount}件の優先度を確認し、詳細評価に進める課題を指定します(現在${promoted}件)。`
        : "評価対象がまだありません。拠点を登録すると優先度が算定されます。";
    case "/valuation":
      return promoted > 0
        ? `詳細評価に指定した${promoted}件の算定結果を確認し、代表値を選びます(選択済み${selected}/${decompositionCount}件)。`
        : "詳細評価に指定した課題がないため、算定結果はまだありません。";
    case "/financial-bridge":
      return decisionCount > 0
        ? `${decisionCount}拠点について、選んだ代表値が利益・リスクにどう効くかを確認します。`
        : "試算の対象がまだありません。";
    case "/decision":
      return decisionCount > 0
        ? `${decisionCount}拠点の対策案を比べ、承認基準と照らした判定を確定します(確定済み${confirmed}/${decisionCount}拠点)。`
        : "判定の対象がまだありません。";
    case "/disclosure":
      return gapCount > 0
        ? `開示文言${gapCount}件について、記載と根拠の整合を確認します(確認済み${handledGaps}/${gapCount}件)。`
        : "確認対象の開示文言がまだありません。";
    default:
      return null;
  }
}

/**
 * 分かったこと(指示14)。
 *
 * データがある項目だけを出す。金額は丸め、正確な値は exact に退避する。
 * 「基準をまたがない」も**確定した結論**として書く(concept-v2の中核メッセージ:
 * 「効かないと確定できた」ことにも価値がある)。判定が保留中のものは発見ではなく
 * 未完了タスク(指示13)なので、ここには出さない。
 */
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
    const low = Math.min(widest.pair.valueA as unknown as number, widest.pair.valueB as unknown as number);
    const high = Math.max(widest.pair.valueA as unknown as number, widest.pair.valueB as unknown as number);
    const conceptNote =
      widest.concept === "welfare"
        ? "これは社会全体への影響(開示にのみ使用する参考値)どうしの比較で、投資判断には使用しません。"
        : "これは投資判断に使う交換価値どうしの比較です。";
    findings.push({
      id: "finding-divergence",
      headline: `${issueLabelForDecomposition(result, widest.decomposition)}の試算は、算定方法によって年${formatCompactYen(
        low
      )}〜${formatCompactYen(high)}(最大${widest.ratio.toFixed(1)}倍)の幅がある`,
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
      headline: `${joinSiteNames(crossing)}では、選択中の対策を織り込んでも投資判断が承認基準をまたぐ`,
      detail:
        "自然関連のコストを織り込むと、この投資の結論が変わりうる水準です。対策案と反映先の見直しが必要かどうかを確認してください。",
      href: "/decision",
      linkLabel: "対策と判定で詳細",
    });
  }
  if (notCrossing.length > 0) {
    findings.push({
      id: "finding-verdict-does-not-cross",
      headline: `${joinSiteNames(notCrossing)}では、選択中の対策を織り込んでも投資判断は承認基準をまたがない`,
      detail:
        "=この論点は今回の投資判断を変えない、と確定できました。「またがない」ことも、根拠をもって確定した結論です。",
      href: "/decision",
      linkLabel: "対策と判定で詳細",
    });
  }

  // 3. 減損テストの前提に抵触する拠点。
  const impairment = decisions.filter((d) => d.comparisonTargets.impairmentTestImpact.changesAssumption);
  if (impairment.length > 0) {
    const totalDebt = impairment.reduce((sum, d) => sum + (d.financialBridge.natureDebt.totalDebt as unknown as number), 0);
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
