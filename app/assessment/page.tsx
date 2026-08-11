import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Num } from "../components/numeric";
import { Card, Guide, Tag } from "../components/ui";
import { sensitivityFraction, unevaluatedCriteriaNote } from "../components/criteria-labels";
import { DataSourceAttribution } from "../components/attribution";
import { DepthToggle } from "./depth-toggle";

export default async function AssessmentPage() {
  const result = await getOrCreateLatestResult(await getTenantId());
  const { priorityScores, depthDecisions, materialIssues } = result.assessment;

  const depthById = new Map(depthDecisions.map((d) => [d.materialIssueId, d]));
  const issueById = new Map(materialIssues.map((i) => [i.id, i]));

  const sorted = [...priorityScores].sort((a, b) => b.normalizedScore - a.normalizedScore);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">評価の優先順位</h1>
          <Guide>
            感応度・財務への影響・不確実性の大きさ・開示での必要性から優先順位を算定します。
            「詳細評価」に切り替えると、より確度の高いデータで再計算します。対象外とした課題も理由とともに記録されます。
          </Guide>
        </div>
      </div>

      <Card title="評価対象の一覧" padBody={false} foot="対象外とした理由も記録されます">
        <table className="data-table">
          <thead>
            <tr>
              <th>評価対象</th>
              <th>感応度</th>
              <th>財務エクスポージャ</th>
              <th>不確実性</th>
              <th>開示必須性</th>
              <th>優先度</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((score) => {
              const decision = depthById.get(score.materialIssueId);
              const issue = issueById.get(score.materialIssueId);
              const isPromoted = decision?.depth === "deep_dive";
              return (
                <tr key={score.materialIssueId} style={isPromoted ? { background: "var(--accent-soft)" } : undefined}>
                  <td>
                    <b>{score.materialIssueId}</b>
                    {decision?.exclusionReason && (
                      <>
                        <br />
                        <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>{decision.exclusionReason}</span>
                      </>
                    )}
                  </td>
                  <td className="num">
                    {/* 分母は常に5ではなく、実際に評価できた基準の数(GAP-08 / GAP-13)。 */}
                    {issue ? sensitivityFraction(issue) : <Num value={score.sensitivity} />}
                    {issue && unevaluatedCriteriaNote(issue) && (
                      <>
                        <br />
                        <span style={{ color: "var(--ink-faint)", fontSize: 10, fontWeight: 400 }} title={unevaluatedCriteriaNote(issue)!}>
                          未評価{issue.unevaluatedCriteria.length}件
                        </span>
                      </>
                    )}
                  </td>
                  <td className="num">
                    <Num value={score.financialExposure} unit="円" />
                  </td>
                  <td className="num">
                    <Num value={score.uncertaintyMagnitude} digits={3} />
                  </td>
                  <td className="num">
                    <Num value={score.disclosureRequirement} />
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    <Num value={score.normalizedScore} digits={3} />
                  </td>
                  <td>
                    {issue?.excluded ? (
                      <Tag variant="neutral">対象外(座標未解決)</Tag>
                    ) : (
                      <DepthToggle materialIssueId={score.materialIssueId} currentDepth={isPromoted ? "deep_dive" : "screening"} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <DataSourceAttribution sources={["WRI Aqueduct 4.0", "ENCORE"]} />
      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
