import Link from "next/link";
import { computeTornadoChart } from "@core/monetization/tornado";
import type { ValuationRecord } from "@core/types/valuation";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Num } from "../components/numeric";
import { Card, Guide, KV, Stat, Tag } from "../components/ui";
import { tierLabel, tierTagVariant } from "../components/tag-utils";
import { Football } from "../components/charts/Football";
import { Tornado } from "../components/charts/Tornado";

const METHOD_LABEL: Record<string, string> = {
  "replacement-cost": "代替費用法(浄水コスト)",
  "lime3-water": "LIME3(水消費統合指標)",
  "ifvi-water-consumption": "IFVI 水ストレス係数",
};

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const { issue: issueParam } = await searchParams;
  const result = runDemoPipeline();
  const { valuationRecordsByMaterialIssue } = result.valuation;
  const materialIssueIds = Object.keys(valuationRecordsByMaterialIssue);

  if (materialIssueIds.length === 0) {
    return (
      <div className="screen">
        <h1 className="screen__title">価値の算定</h1>
        <p style={{ color: "var(--ink-faint)", marginTop: 12 }}>深掘り評価に昇格した課題がまだありません。</p>
      </div>
    );
  }

  const selectedIssueId = issueParam && materialIssueIds.includes(issueParam) ? issueParam : materialIssueIds[0];
  const records = valuationRecordsByMaterialIssue[selectedIssueId];
  const site = result.assessment.sites.find((s) => s.id === records[0]?.siteId);
  const issue = result.assessment.materialIssues.find((i) => i.id === selectedIssueId);
  const input = records[0]?.physicalQuantityId;

  const footballMethods = records.map((r) => ({
    name: METHOD_LABEL[r.methodId] ?? r.methodId,
    tier: r.transferFitness.tier,
    concept: r.valueConcept,
    low: r.quantileRange.p5,
    mid: r.quantileRange.p50,
    high: r.quantileRange.p95,
  }));

  const primaryRecord: ValuationRecord | undefined = records.find((r) => r.methodId === "replacement-cost") ?? records[0];
  const tornadoEntries = primaryRecord ? computeTornadoChart(primaryRecord) : [];
  const tornadoCenter = primaryRecord ? (primaryRecord.centralValue as unknown as number) : 0;
  const tornadoFactors = tornadoEntries.map((e, i) => ({
    name: e.label,
    low: tornadoCenter * (1 - e.sigma),
    high: tornadoCenter * (1 + e.sigma),
    dominant: i === 0,
  }));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">価値の算定</h1>
          <Guide>
            同じ対象に複数の算定方法を並行して適用し、幅を持った試算を出します。M3は現状waterカテゴリの
            3手法(代替費用法・LIME3・IFVI水ストレス係数)を実装しており、深掘り対象になった課題には常にこの3手法を並行実行します。
          </Guide>
        </div>
      </div>

      {materialIssueIds.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {materialIssueIds.map((id) => (
            <Link
              key={id}
              href={`/valuation?issue=${encodeURIComponent(id)}`}
              className={`pill-btn pill-btn--sm${id === selectedIssueId ? " pill-btn--accent" : ""}`}
            >
              {id}
            </Link>
          ))}
        </div>
      )}

      <Card title="算定の対象" subtitle={`${issue?.impactCategory ?? "water"} ・ ${site?.name ?? records[0]?.siteId}`}>
        <div className="grid-3">
          <Stat label="物理量入力ID" value={input ?? "—"} />
          <Stat label="対象カテゴリ" value={issue?.impactCategory ?? "water"} />
          <Stat label="感応度スコア" value={issue ? `${issue.sensitivityScore}/5` : "—"} />
        </div>
      </Card>

      <Card title="適用している算定方法" subtitle={`${records.length}件を並行して適用中`} padBody={false} foot="単位:円/年 ・ 使用した基準データのバージョンも記録されます">
        <table className="data-table">
          <thead>
            <tr>
              <th>方法</th>
              <th>価値の性質</th>
              <th>適合度ティア</th>
              <th>中心値</th>
              <th>幅(P5〜P95)</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{METHOD_LABEL[r.methodId] ?? r.methodId}</b>
                </td>
                <td>
                  <Tag variant={r.valueConcept === "welfare" ? "welfare" : "exchange"}>
                    {r.valueConcept === "welfare" ? "厚生価値" : "交換価値"}
                  </Tag>
                </td>
                <td>
                  <Tag variant={tierTagVariant(r.transferFitness.tier)}>{tierLabel(r.transferFitness.tier)}</Tag>
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  <Num value={r.centralValue as unknown as number} unit="円" />
                </td>
                <td className="num">
                  <Num value={r.quantileRange.p5} /> 〜 <Num value={r.quantileRange.p95} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid-2">
        <Card title="試算の幅(手法別)">
          <Football methods={footballMethods} />
        </Card>
        <Card title="試算の幅に影響する要因" subtitle={primaryRecord ? METHOD_LABEL[primaryRecord.methodId] : undefined}>
          <Tornado center={tornadoCenter} factors={tornadoFactors} />
          <p className="tooltip-note">
            パラメータ不確実性(層i)と適合度ティア由来の移転誤差(層ii)のsigmaを中心値からの近似的な振れ幅として表示しています。
          </p>
        </Card>
      </div>

      <Card title="試算に含めていない項目">
        {primaryRecord?.scopeExclusions.length ? (
          primaryRecord.scopeExclusions.map((ex, i) => <KV key={i} k={ex} v="対象外" />)
        ) : (
          <p style={{ color: "var(--ink-faint)" }}>この手法に明示的な除外項目はありません。</p>
        )}
      </Card>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
