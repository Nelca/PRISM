import Link from "next/link";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "./components/numeric";

export default function Home() {
  const result = runDemoPipeline();

  const excludedSites = result.assessment.materialIssues.filter((i) => i.excluded).length;
  const promoted = result.assessment.depthDecisions.filter((d) => d.depth === "deep_dive").length;
  const gapsFound = result.disclosure.gapFindings.filter((f) => f.gapType !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{result.companyName}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          ダミーデータによるM1〜M8の通し確認(実データではありません)。
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="拠点数" value={result.assessment.sites.length} href="/sites" />
        <SummaryCard label="除外拠点(座標未解決)" value={excludedSites} href="/sites" />
        <SummaryCard label="深掘り昇格件数" value={promoted} href="/assessment" />
        <SummaryCard label="開示ギャップ検出件数" value={gapsFound} href="/disclosure" />
      </dl>

      <div className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="font-medium">意思決定(M6)</p>
        {result.decision ? (
          <p className="mt-1">
            ★判定: <span className="font-semibold">{result.decision.decisionRecord.verdict}</span>
          </p>
        ) : (
          <p className="mt-1 text-zinc-500">対象となる交換価値ValuationRecordがありません。</p>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="font-medium">記録・版管理(M8)</p>
        <p className="mt-1">
          AssumptionEntry <Num value={result.assumptionEntries.length} />件を記録済み。 詳細は
          <Link href="/ledger" className="ml-1 underline">
            M8ページ
          </Link>
          を参照。
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded border border-zinc-200 p-4 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl">
        <Num value={value} />
      </dd>
    </Link>
  );
}
