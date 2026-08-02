import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "../components/numeric";

export default function ValuationPage() {
  const result = runDemoPipeline();
  const records = Object.values(result.valuation.valuationRecordsByMaterialIssue).flat();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M3:貨幣化エンジン / M4:乖離分解</h1>

      <section>
        <h2 className="text-sm font-medium text-zinc-500">ValuationRecord(深掘り深度)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="py-1 pr-4">手法</th>
              <th className="py-1 pr-4">価値概念</th>
              <th className="py-1 pr-4">AoP</th>
              <th className="py-1 pr-4">中心値</th>
              <th className="py-1 pr-4">P5〜P95</th>
              <th className="py-1 pr-4">適合度ティア</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">{record.methodId}</td>
                <td className="py-1 pr-4">{record.valueConcept === "exchange" ? "交換価値" : "厚生価値"}</td>
                <td className="py-1 pr-4">{record.aopCode}</td>
                <td className="py-1 pr-4">
                  <Num value={record.centralValue as unknown as number} unit="円" />
                </td>
                <td className="py-1 pr-4">
                  <Num value={record.quantileRange.p5} /> 〜 <Num value={record.quantileRange.p95} />
                </td>
                <td className="py-1 pr-4">{record.transferFitness.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {result.valuation.divergenceDecompositions.map((decomposition) => (
        <section key={decomposition.id}>
          <h2 className="text-sm font-medium text-zinc-500">乖離分解:{decomposition.id}</h2>
          {decomposition.crossGroupComparison && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              交換価値グループと厚生価値グループは比較不能です:
              {decomposition.crossGroupComparison.metadataDifferences.join(" / ")}
            </p>
          )}
          {decomposition.groups.map((group) => (
            <div key={group.valueConcept} className="mt-3">
              <p className="text-xs uppercase text-zinc-500">
                {group.valueConcept === "exchange" ? "交換価値グループ" : "厚生価値グループ"}({group.usage})
              </p>
              <ul className="mt-1 flex flex-col gap-2">
                {group.pairwiseDecompositions.map((pair, i) => (
                  <li key={i} className="rounded border border-zinc-200 p-2 text-sm dark:border-zinc-800">
                    <p className="font-medium">
                      {pair.methodIdA} / {pair.methodIdB}
                      {pair.ratio !== null && (
                        <span className="ml-2 font-normal">
                          <Num value={pair.ratio} digits={2} />倍
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{pair.narrative}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
