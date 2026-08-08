import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "../components/numeric";
import { Card, Guide, Tag } from "../components/ui";
import { AddSiteForm } from "./add-site-form";

const CATEGORY_LABEL: Record<string, string> = { water: "取水量・水ストレス" };

export default function SitesPage() {
  const result = runDemoPipeline();
  const { sites, ingestionErrors, materialIssues, depthDecisions } = result.assessment;

  const depthByIssueId = new Map(depthDecisions.map((d) => [d.materialIssueId, d]));
  const rankedIssues = [...materialIssues].sort((a, b) => b.sensitivityScore - a.sensitivityScore);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">対象定義とLocate</h1>
          <Guide>
            拠点データ(住所・活動量・業種)を登録すると、周辺の自然環境との関係が自動で分析され、
            <b>感応度スコア</b>が算出されます。スコアの高い拠点から優先的に評価を進めます。
          </Guide>
        </div>
      </div>

      {ingestionErrors.length > 0 && (
        <Card title="拠点データの取込エラー" subtitle={`${ingestionErrors.length}件`}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ingestionErrors.map((e) => (
              <li key={e.rowId} style={{ fontSize: 12.5 }}>
                {e.rowId}: {e.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid-2">
        <Card title="拠点一覧" subtitle={`登録拠点 ${sites.length}件`} headExtra={<AddSiteForm />} padBody={false}>
          <table className="data-table">
            <thead>
              <tr>
                <th>拠点ID</th>
                <th>名称</th>
                <th>種別</th>
                <th>業種</th>
                <th>座標解決</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td className="num">{site.id}</td>
                  <td>
                    <b>{site.name}</b>
                  </td>
                  <td>{site.siteType === "own_site" ? "自社拠点" : "サプライヤー拠点"}</td>
                  <td>{site.industrySector}</td>
                  <td>
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
        </Card>

        <Card title="感応度スコア上位拠点" padBody={false} foot="感応度 = TNFD LEAP L3の5基準の充足数(0〜5)">
          <table className="data-table">
            <thead>
              <tr>
                <th>拠点</th>
                <th>主要な要因</th>
                <th>感応度</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {rankedIssues.map((issue) => {
                const site = sites.find((s) => s.id === issue.siteId);
                const depth = depthByIssueId.get(issue.id);
                return (
                  <tr key={issue.id}>
                    <td>
                      <b>{site?.name ?? issue.siteId}</b>
                      <br />
                      <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>{site?.industrySector}</span>
                    </td>
                    <td>{issue.excluded ? "—" : CATEGORY_LABEL[issue.impactCategory] ?? issue.impactCategory}</td>
                    <td className="num" style={issue.sensitivityScore >= 3 ? { color: "var(--brick)", fontWeight: 600 } : undefined}>
                      <Num value={issue.sensitivityScore} />
                      /5
                    </td>
                    <td>
                      {issue.excluded ? (
                        <Tag variant="neutral">除外(座標未解決)</Tag>
                      ) : depth?.depth === "deep_dive" ? (
                        <Tag variant="warn">要詳細評価</Tag>
                      ) : (
                        <Tag variant="neutral">概算評価対象</Tag>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
