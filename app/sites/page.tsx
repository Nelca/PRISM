import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "../components/numeric";

export default function SitesPage() {
  const result = runDemoPipeline();
  const { sites, ingestionErrors, materialIssues } = result.assessment;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">M1:対象定義とLocate</h1>

      {ingestionErrors.length > 0 && (
        <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">拠点データの取込エラー({ingestionErrors.length}件)</p>
          <ul className="mt-1 list-disc pl-5">
            {ingestionErrors.map((e) => (
              <li key={e.rowId}>
                {e.rowId}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="text-sm font-medium text-zinc-500">拠点一覧</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="py-1 pr-4">拠点ID</th>
              <th className="py-1 pr-4">名称</th>
              <th className="py-1 pr-4">種別</th>
              <th className="py-1 pr-4">業種</th>
              <th className="py-1 pr-4">座標解決</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">{site.id}</td>
                <td className="py-1 pr-4">{site.name}</td>
                <td className="py-1 pr-4">{site.siteType}</td>
                <td className="py-1 pr-4">{site.industrySector}</td>
                <td className="py-1 pr-4">
                  {site.location.kind === "coordinates"
                    ? "座標あり"
                    : site.location.geocoded
                      ? "住所→座標解決済み"
                      : "未解決"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500">MaterialIssue(拠点×影響カテゴリ)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="py-1 pr-4">ID</th>
              <th className="py-1 pr-4">カテゴリ</th>
              <th className="py-1 pr-4">感応度スコア</th>
              <th className="py-1 pr-4">除外</th>
              <th className="py-1 pr-4">除外理由</th>
            </tr>
          </thead>
          <tbody>
            {materialIssues.map((issue) => (
              <tr key={issue.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1 pr-4">{issue.id}</td>
                <td className="py-1 pr-4">{issue.impactCategory}</td>
                <td className="py-1 pr-4">
                  <Num value={issue.sensitivityScore} />/5
                </td>
                <td className="py-1 pr-4">{issue.excluded ? "はい" : "いいえ"}</td>
                <td className="py-1 pr-4 text-zinc-500">{issue.exclusionReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
