import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { computePercentileRanks } from "@core/assessment/percentile-rank";
import type { DepthDecision } from "@core/types/assessment";
import { Card, GuideBox, GuideButton, ScreenLead, Tag } from "../components/ui";
import { sensitivityFraction, unevaluatedCriteriaNote } from "../components/criteria-labels";
import { formatDepthReason, formatIssueExclusionReason, materialIssueLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { DataSourceAttribution } from "../components/attribution";
import { DepthToggle } from "./depth-toggle";
import { TaskBanner } from "../components/task-banner";

/**
 * 「上位◯%」の閾値(M2 D-3の暫定20%)。DepthDecision自体にはこの値を持つフィールドが
 * ないため、除外側の理由文(computeDepthDecisions が既に埋め込んでいる実データ)から
 * 読み取る。固定値をUIに書き込まない(捏造しない)ための工夫。
 */
const PROMOTION_PERCENT_PATTERN = /上位(\d+)%/;
function findPromotionPercent(decisions: DepthDecision[]): number | null {
  for (const decision of decisions) {
    const match = decision.exclusionReason?.match(PROMOTION_PERCENT_PATTERN);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * 行末の判定文(指示08)。
 * 除外側は decision.exclusionReason をそのまま使う(実データ)。昇格側には理由フィールドが
 * 存在しないため、「手動指定か・自動昇格か」という実データの範囲でのみ文を組み立てる。
 */
function depthJudgmentText(decision: DepthDecision | undefined, promotionPercent: number | null): string {
  if (!decision) return "—";
  if (decision.excludedFromDeepDive) {
    // B-04:coreが生成する理由文には内部変数名(normalizedScore=...)や廃止済み用語(深掘り)が
    // そのまま残っているため、UI側で平易文に組み替える(packages/coreは変更しない)。
    return decision.exclusionReason ? formatDepthReason(decision.exclusionReason) : "詳細評価の対象外です。";
  }
  if (decision.promotedManually) {
    return "手動で詳細評価の対象に指定されています。";
  }
  return promotionPercent !== null
    ? `優先度が上位${promotionPercent}%に入ったため、詳細評価の対象です。`
    : "優先度算定の結果、詳細評価の対象になりました。";
}

/**
 * 優先度・優先度の内訳のバー表示(指示08、B-05で改修)。0〜1の割合を受け取る。
 * sub(内訳バー)は色を濃くし、右に百分位の整数を小書きモノスペースで常時表示する
 * (以前は数値の手がかりがhoverのtitleにしかなかった)。
 */
function Bar({ ratio, sub }: { ratio: number; sub?: boolean }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const width = clamped * 100;
  return (
    <div className="pbar-row">
      <div className="pbar">
        <div className={`pbar__fill${sub ? " pbar__fill--sub" : ""}`} style={{ width: `${width}%` }} />
      </div>
      {sub && <span className="pbar__pct num">{Math.round(clamped * 100)}</span>}
    </div>
  );
}

export default async function AssessmentPage() {
  const result = await getOrCreateLatestResult(await getTenantId());
  const { priorityScores, depthDecisions, materialIssues, sites } = result.assessment;

  const depthById = new Map(depthDecisions.map((d) => [d.materialIssueId, d]));
  const issueById = new Map(materialIssues.map((i) => [i.id, i]));
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  const sorted = [...priorityScores].sort((a, b) => b.normalizedScore - a.normalizedScore);

  /**
   * C-01:「感応度が高い拠点」カードは操作も解釈もない「見るだけの表」だったため削除し、
   * この画面の表を「評価対象の一覧」1つにまとめた。削除で失われる情報は一覧側に吸収する。
   *
   * その1:優先度の算定対象に入らなかった課題(座標未解決で excluded になった行など)は、
   * `priorityScores` に現れないため一覧から消えてしまう。「黙って消えない」原則
   * (第1版§5)を守るため、末尾に「対象外」行として必ず出す。
   */
  const scoredIssueIds = new Set(priorityScores.map((score) => score.materialIssueId));
  const unscoredIssues = materialIssues.filter((issue) => !scoredIssueIds.has(issue.id));

  /**
   * 優先度の内訳バー(指示08)。normalizedScoreを構成する4項目それぞれの
   * 同一バッチ内百分位順位(0〜1)を、core側と同じ関数で算定して使う
   * (見た目のためだけの独自正規化を発明しない)。
   */
  const sensitivityRanks = computePercentileRanks(sorted.map((s) => s.sensitivity));
  const financialRanks = computePercentileRanks(sorted.map((s) => s.financialExposure));
  const uncertaintyRanks = computePercentileRanks(sorted.map((s) => s.uncertaintyMagnitude));
  const disclosureRanks = computePercentileRanks(sorted.map((s) => s.disclosureRequirement));
  const maxNormalizedScore = sorted.length > 0 ? sorted[0].normalizedScore : 0;
  const promotionPercent = findPromotionPercent(depthDecisions);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">評価対象の絞り込み</h1>
          <GuideButton />
        </div>
        <ScreenLead>詳細評価する課題を絞り込みます</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、詳細評価に進める課題を決めます。<b>1.</b> 優先度(自然との関わり・影響しうる財務規模・不確実性・
          開示必須性の4項目を合成した順位)を確認します → <b>2.</b> 表の「評価の深さ」で、詳細評価する課題を切り替えで
          指定します → <b>3.</b> 指定できたら「価値の算定」へ進みます。
          <b>概算評価</b>は、全課題に自動で行う簡易な優先度づけまでで止まります。<b>詳細評価</b>にすると、
          次の「価値の算定」で貨幣価値の算定から投資判断への反映までを行う対象になります。
          優先度が上位の課題は自動で詳細評価になっていますが、手動で変更できます(変更は理由とともに記録に残ります)。
          対象外とした課題も表の末尾に理由付きで残ります。
        </GuideBox>
      </div>

      {/* D-11-1:残タスクの頭出しバナー(全6画面共通。残タスクがある時だけ出る)。 */}
      <TaskBanner current="/assessment" result={result} />

      <Card
        title="評価対象の一覧"
        subtitle="優先度を見て、詳細評価する課題を指定します"
        padBody={false}
        foot="優先度は、自然との関わり・影響しうる財務規模・不確実性・開示必須性の4項目を同一バッチ内で順位化して合算した値です。自然との関わりが強い課題は自然への依存・影響が強く、財務影響が生じやすい評価候補です(分数は、実際に評価できた基準の数を分母にしています)。評価の深さはクリックで切り替えられ、切り替えは記録に残ります。対象外とした課題は末尾に理由付きで残ります"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th rowSpan={2}>評価対象</th>
              <th rowSpan={2}>優先度</th>
              <th colSpan={4} style={{ textAlign: "center" }}>
                優先度の内訳
              </th>
              {/* D-04:切替が何を引き起こすかをheaderのtitleでも説明する(ガイド文と同じ因果)。 */}
              <th
                rowSpan={2}
                title="概算評価=全課題に自動で行う簡易な優先度づけまで。詳細評価=次の「価値の算定」で貨幣価値の算定〜投資判断への反映まで行う対象になる"
              >
                評価の深さ
              </th>
              <th rowSpan={2}>理由</th>
            </tr>
            <tr>
              <th title="TNFDの5基準(水ストレス・生物多様性の重要性など)のうち該当した数。数が多いほど自然への依存・影響が強い">自然との関わり</th>
              <th title="財務規模:この課題が影響しうる売上・費用の大きさ">財務</th>
              <th title="不確実性:log(P95/P5)で表した試算の幅">不確実性</th>
              <th title="開示必須性:開示上の必須度合い">開示</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((score, i) => {
              const decision = depthById.get(score.materialIssueId);
              const issue = issueById.get(score.materialIssueId);
              const isPromoted = decision?.depth === "deep_dive";
              const priorityRatio = maxNormalizedScore > 0 ? score.normalizedScore / maxNormalizedScore : 0;
              return (
                <tr key={score.materialIssueId} style={isPromoted ? { background: "var(--accent-soft)" } : undefined}>
                  <td>
                    {/* 課題IDそのものではなく「拠点名 × カテゴリ名」で示す(指示06)。IDは小書きに退避。 */}
                    <b>
                      {issue
                        ? materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.siteId)
                        : score.materialIssueId}
                    </b>
                    <span className="id-note">{score.materialIssueId}</span>
                  </td>
                  <td style={{ minWidth: 110 }} title={`優先度(正規化値) ${score.normalizedScore.toFixed(3)}`}>
                    <div className="rank-cell">
                      <b className="rank-cell__num">{i + 1}位</b>
                      <Bar ratio={priorityRatio} />
                    </div>
                  </td>
                  {/*
                    C-01:削除した「感応度が高い拠点」表にしかなかった分数表示(2/4)と未評価注記を、
                    バーの下に常時表示する。分母は「実際に評価できた基準の数」であり常に5ではない
                    (第1版§5「除外・未評価を黙って消さない」)。5基準の定義文は上のthのtitleに残す。
                  */}
                  <td
                    style={{ minWidth: 92 }}
                    title={`自然との関わり(生値) ${issue ? sensitivityFraction(issue) : score.sensitivity}`}
                  >
                    <Bar ratio={sensitivityRanks[i]} sub />
                    {issue && (
                      <span className="cell-note">
                        {sensitivityFraction(issue)}
                        {unevaluatedCriteriaNote(issue) && (
                          <span title={unevaluatedCriteriaNote(issue)!}> ・未評価{issue.unevaluatedCriteria.length}件</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td
                    style={{ minWidth: 78 }}
                    title={`影響しうる財務規模 ${new Intl.NumberFormat("ja-JP").format(Math.round(score.financialExposure))}円`}
                  >
                    <Bar ratio={financialRanks[i]} sub />
                  </td>
                  <td style={{ minWidth: 78 }} title={`不確実性(log(P95/P5)) ${score.uncertaintyMagnitude.toFixed(3)}`}>
                    <Bar ratio={uncertaintyRanks[i]} sub />
                  </td>
                  <td style={{ minWidth: 78 }} title={`開示必須性(生値) ${score.disclosureRequirement.toFixed(3)}`}>
                    <Bar ratio={disclosureRanks[i]} sub />
                  </td>
                  <td>
                    {issue?.excluded ? (
                      <Tag variant="neutral">対象外(座標未解決)</Tag>
                    ) : (
                      <DepthToggle materialIssueId={score.materialIssueId} currentDepth={isPromoted ? "deep_dive" : "screening"} />
                    )}
                  </td>
                  <td style={{ fontSize: 11.5, color: "var(--ink-soft)", maxWidth: 240 }}>
                    {depthJudgmentText(decision, promotionPercent)}
                  </td>
                </tr>
              );
            })}

            {/*
              C-01:優先度の算定対象に入らなかった課題を末尾に「対象外」行として出す。
              優先度・内訳は算定していないので「—」とし、なぜ対象外なのかを理由列に書く
              (第1版§5「除外・未評価を黙って消さない」)。
            */}
            {unscoredIssues.map((issue) => (
              <tr key={issue.id} style={{ color: "var(--ink-soft)" }}>
                <td>
                  {/* 座標が解決できていないため、カテゴリまでは確定していない。拠点名だけを出す。 */}
                  <b>{siteNameById.get(issue.siteId) ?? issue.siteId}</b>
                  <span className="id-note">{issue.id}</span>
                </td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td>
                  <Tag variant="neutral">対象外</Tag>
                </td>
                <td style={{ fontSize: 11.5, color: "var(--ink-soft)", maxWidth: 240 }}>
                  {issue.exclusionReason
                    ? formatIssueExclusionReason(issue.exclusionReason)
                    : "優先度の算定対象に含まれていません。"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <DataSourceAttribution sources={["WRI Aqueduct 4.0", "ENCORE"]} />
      <StepNav current="/assessment" result={result} />
    </div>
  );
}
