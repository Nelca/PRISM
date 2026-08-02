import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { DISCLOSURE_CLAIM } from "@/lib/demo/company";

export default function DisclosurePage() {
  const result = runDemoPipeline();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M7:開示生成と整合検証</h1>

      <section className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          {DISCLOSURE_CLAIM.sourceDocument} {DISCLOSURE_CLAIM.sourcePageOrSection}
        </p>
        <p className="mt-1">{DISCLOSURE_CLAIM.rawText}</p>
      </section>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
            <th className="py-1 pr-4">GapFinding ID</th>
            <th className="py-1 pr-4">判定</th>
            <th className="py-1 pr-4">一致した根拠件数</th>
            <th className="py-1 pr-4">推奨アクション</th>
          </tr>
        </thead>
        <tbody>
          {result.disclosure.gapFindings.map((finding) => (
            <tr key={finding.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-1 pr-4">{finding.id}</td>
              <td className="py-1 pr-4">{finding.gapType ?? "根拠充足(ギャップなし)"}</td>
              <td className="py-1 pr-4">{finding.evidenceMatch.matchedRecordIds.length}</td>
              <td className="py-1 pr-4">
                {finding.recommendedActions.length === 0
                  ? "—"
                  : finding.recommendedActions.map((a) => a.kind).join(" / ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
