import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "../components/numeric";

export default function AssessmentPage() {
  const result = runDemoPipeline();
  const { priorityScores, depthDecisions } = result.assessment;

  const depthById = new Map(depthDecisions.map((d) => [d.materialIssueId, d]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M2:評価実行(深度可変)</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
            <th className="py-1 pr-4">MaterialIssue</th>
            <th className="py-1 pr-4">感応度</th>
            <th className="py-1 pr-4">財務エクスポージャ</th>
            <th className="py-1 pr-4">不確実性</th>
            <th className="py-1 pr-4">開示必須性</th>
            <th className="py-1 pr-4">正規化スコア</th>
            <th className="py-1 pr-4">深度</th>
            <th className="py-1 pr-4">除外理由</th>
          </tr>
        </thead>
        <tbody>
          {priorityScores.map((score) => {
            const decision = depthById.get(score.materialIssueId);
            return (
              <tr key={score.materialIssueId} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">{score.materialIssueId}</td>
                <td className="py-1 pr-4">
                  <Num value={score.sensitivity} />
                </td>
                <td className="py-1 pr-4">
                  <Num value={score.financialExposure} unit="円" />
                </td>
                <td className="py-1 pr-4">
                  <Num value={score.uncertaintyMagnitude} digits={3} />
                </td>
                <td className="py-1 pr-4">
                  <Num value={score.disclosureRequirement} />
                </td>
                <td className="py-1 pr-4">
                  <Num value={score.normalizedScore} digits={3} />
                </td>
                <td className="py-1 pr-4">{decision?.depth === "deep_dive" ? "深掘り" : "スクリーニングのみ"}</td>
                <td className="py-1 pr-4 text-zinc-500">{decision?.exclusionReason ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
