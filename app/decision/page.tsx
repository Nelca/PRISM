import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { buildWaterfallSteps } from "@core/financial-bridge/bridge1";
import { Num } from "../components/numeric";

export default function DecisionPage() {
  const result = runDemoPipeline();
  const { decision, financialBridge, comparisonTargets } = result;

  if (!decision) {
    return <p className="text-sm text-zinc-500">対象となる交換価値ValuationRecordがないため、DecisionRecordを生成できません。</p>;
  }

  const record = decision.decisionRecord;
  const waterfallSteps = financialBridge ? buildWaterfallSteps(financialBridge.bridge1) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M6:対策評価と意思決定注入</h1>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">★判定</p>
        <p className="mt-1 text-2xl font-semibold">{record.verdict}</p>
        <p className="mt-2 text-sm">
          自然調整後NPV: <Num value={record.natureAdjustedNpv.central as unknown as number} unit="円" /> (P5:
          <Num value={record.natureAdjustedNpv.quantileRange.p5} unit="円" /> 〜 P95:
          <Num value={record.natureAdjustedNpv.quantileRange.p95} unit="円" />)
        </p>
        {record.deepDiveRecommendation && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            深掘り推奨: {record.deepDiveRecommendation.dominantAssumption}
          </p>
        )}
        <p className="mt-2 text-sm">拘束方式: {record.bindingMechanism.kind}</p>
      </section>

      {financialBridge && (
        <section>
          <h2 className="text-sm font-medium text-zinc-500">M5:自然調整後利益(ウォーターフォール)</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {waterfallSteps.map((step) => (
                <tr key={step.label} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1 pr-4">
                    {step.label}
                    {step.isTotal ? "(合計)" : ""}
                  </td>
                  <td className="py-1 pr-4">
                    <Num value={step.value as unknown as number} unit="円" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">[非GAAP指標]</p>
        </section>
      )}

      {comparisonTargets && (
        <section className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">比較先(格付・資本コストへの参考情報)</h2>
          <p className="mt-1">
            期待損失 ÷ 報告営業利益: <Num value={comparisonTargets.operatingProfitRatio} digits={4} />
          </p>
          <p className="mt-1">{comparisonTargets.impairmentTestImpact.details}</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
            {comparisonTargets.ratingCostOfCapitalImpact.qualitativeNote}
          </pre>
        </section>
      )}
    </div>
  );
}
