import Link from "next/link";
import { notFound } from "next/navigation";
import { researchEnabled } from "@/lib/research/access";
import { loadGvfd } from "@/lib/research/gvfd-data";
import { factorsFor, GVFD_TOPICS, GVFD_METRIC_TOPICS, isGvfdTopic } from "@/lib/research/gvfd";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { METRIC_BY_ID } from "@/lib/environment/metrics";
import { Card, ScreenLead } from "../../components/ui";
import { GvfdCalculator } from "./calculator";
export const metadata = { title: "GVFDで環境影響を算定 | PRISM" };
export default async function GvfdPage({ searchParams }: { searchParams: Promise<{ topic?: string; geography?: string; target?: string }> }) {
  if (!researchEnabled()) notFound();
  const query = await searchParams;
  const dataset = await loadGvfd();
  const view = query.target ? await loadInteractivePipelineView() : null;
  const record = query.target ? view?.interactions.environmentalTargets.get(query.target) : null;
  if (query.target && (!record || record.archived || !GVFD_METRIC_TOPICS[record.metricId])) notFound();
  const topics = record ? GVFD_METRIC_TOPICS[record.metricId] : Object.keys(GVFD_TOPICS);
  const requestedTopic = query.topic ?? topics[0];
  if (!isGvfdTopic(requestedTopic) || !topics.includes(requestedTopic)) notFound();
  const geography = dataset.geographies.find((g) => query.geography ? g.id === query.geography : g.name === "Japan");
  if (!geography) notFound();
  const factors = factorsFor(dataset, requestedTopic, geography.id);
  const metric = record ? METRIC_BY_ID.get(record.metricId)! : null;
  const sourceTarget = record && metric ? { id: record.id, revision: record.revision, site: view!.result.assessment.sites.find((site) => site.id === record.siteId)?.name ?? record.siteId, label: metric.label, unit: metric.unit, current: record.current, target: record.target, year: record.reportingYear, boundary: record.boundary, evidence: record.evidence } : null;
  return <div className="screen">
    <div className="screen__head"><h1 className="screen__title">GVFDで環境影響を算定</h1><ScreenLead>地域と活動の条件を選び、実測値・目標値がもたらす社会への影響を比較します。</ScreenLead><p><Link href={record ? `/portfolio/${record.id}` : "/research"}>← {record ? "指標の管理へ" : "公開データで検証へ"}</Link></p></div>
    <Card title="評価対象と地域"><form method="get" className="target-form">
      {record && <input type="hidden" name="target" value={record.id} />}
      <div className="field-row"><div className="field"><label htmlFor="gvfd-topic">評価対象</label><select name="topic" id="gvfd-topic" defaultValue={requestedTopic}>{topics.map((topic) => <option key={topic} value={topic}>{GVFD_TOPICS[topic as keyof typeof GVFD_TOPICS]}</option>)}</select></div>
      <div className="field"><label htmlFor="gvfd-geography">影響が発生する国・地域</label><select name="geography" id="gvfd-geography" defaultValue={geography.id}>{dataset.geographies.map((geo) => <option key={geo.id} value={geo.id}>{geo.name === "Japan" ? "日本（Japan）" : geo.name}</option>)}</select></div></div>
      <p className="field-hint">初期表示は日本です。拠点から地域を自動判定していないため、排出・消費・処理が起きる地域を確認してください。</p><button className="pill-btn">この対象・地域の係数を表示</button>
    </form></Card>
    <Card title={`${GVFD_TOPICS[requestedTopic]} · ${geography.name}`}><GvfdCalculator key={`${requestedTopic}-${geography.id}-${record?.revision ?? ""}`} factors={factors} geography={geography.name} topic={requestedTopic} source={dataset.source} target={sourceTarget} /></Card>
    <Card title="原本と収録範囲"><p>GVFD {dataset.source.version.toUpperCase()}（{dataset.source.versionDate}）。268の国・地域、104,832件の数値係数。欠損22,200セルは算定に使用しません。価格年・通貨は2023年USDです。</p><p>GHGは原本で正式、水消費は公開草案、その他は暫定とされています。V2では廃棄物の単位と不快影響の係数が修正されています。</p><p>生物資源・鉱物資源の重量、送粉頻度、種の観察個体数に直接掛ける係数は含みません。今回の研究用算定を、企業の支払額・自然債務・投資判定に自動加算しません。</p><p><a href={dataset.source.url}>公式原本をダウンロード</a> · <a href="https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-the-interim-methodologies/">対応する方法論・モデル</a></p><details className="foldout"><summary>原本の識別情報</summary><p>{dataset.source.workbookName}</p><p style={{ overflowWrap: "anywhere" }}>取得日 {dataset.source.acquiredOn} / SHA-256 {dataset.source.workbookSha256}</p></details></Card>
  </div>;
}
