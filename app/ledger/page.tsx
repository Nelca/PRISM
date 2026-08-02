import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Mono } from "../components/numeric";

export default function LedgerPage() {
  const result = runDemoPipeline();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M8:記録・版管理基盤</h1>

      <section className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="text-zinc-500">RecalculationHash(パイプライン全体の版情報)</p>
        <p className="mt-1">
          <Mono>{result.recalculationHash.hash}</Mono>
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500">AssumptionEntry({result.assumptionEntries.length}件)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="py-1 pr-4">ID</th>
              <th className="py-1 pr-4">生成元モジュール</th>
              <th className="py-1 pr-4">対象レコード</th>
              <th className="py-1 pr-4">内容</th>
              <th className="py-1 pr-4">記録日時</th>
            </tr>
          </thead>
          <tbody>
            {result.assumptionEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">
                  <Mono>{entry.id}</Mono>
                </td>
                <td className="py-1 pr-4">{entry.sourceModule}</td>
                <td className="py-1 pr-4">{entry.relatedRecordId}</td>
                <td className="py-1 pr-4">{entry.payload.kind}</td>
                <td className="py-1 pr-4 text-zinc-500">{entry.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
