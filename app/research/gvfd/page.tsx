import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { METRIC_BY_ID } from "@/lib/environment/metrics";
import { researchEnabled } from "@/lib/research/access";
import { GVFD_METRIC_TOPICS, GVFD_TOPICS, factorsFor, isGvfdTopic, type GvfdTopic } from "@/lib/research/gvfd";
import { loadGvfd } from "@/lib/research/gvfd-data";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../components/ui";
import { GvfdCalculator, type SourceTarget } from "./calculator";

export const metadata: Metadata = { title: "GVFDで環境影響を算定 | PRISM" };

const METHODOLOGY_URL = "https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-the-interim-methodologies/";

/** 統合管理の指標(`?target=`)から実測値・目標値を引き継ぐ。物質・地域・処理方法は自動推定しない。 */
async function loadSourceTarget(targetId: string): Promise<{ target: SourceTarget; topics: GvfdTopic[] } | null> {
  const { result, interactions } = await loadInteractivePipelineView();
  const record = interactions.environmentalTargets.get(targetId);
  const topics = record && GVFD_METRIC_TOPICS[record.metricId];
  if (!record || record.archived || !topics) return null;
  const metric = METRIC_BY_ID.get(record.metricId)!;
  return {
    topics,
    target: {
      id: record.id,
      revision: record.revision,
      site: result.assessment.sites.find((site) => site.id === record.siteId)?.name ?? record.siteId,
      label: metric.label,
      unit: metric.unit,
      current: record.current,
      target: record.target,
      year: record.reportingYear,
      boundary: record.boundary,
      evidence: record.evidence,
    },
  };
}

export default async function GvfdPage({ searchParams }: { searchParams: Promise<{ topic?: string; geography?: string; target?: string }> }) {
  if (!researchEnabled()) notFound();
  const query = await searchParams;
  const dataset = await loadGvfd();
  const source = query.target ? await loadSourceTarget(query.target) : null;
  if (query.target && !source) notFound();
  const topics = source?.topics ?? (Object.keys(GVFD_TOPICS) as GvfdTopic[]);
  const topic = query.topic ?? topics[0];
  if (!isGvfdTopic(topic) || !topics.includes(topic)) notFound();
  const geography = dataset.geographies.find((item) => (query.geography ? item.id === query.geography : item.name === "Japan"));
  if (!geography) notFound();
  const target = source?.target ?? null;

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">GVFDで環境影響を算定</h1>
        <ScreenLead>地域と活動の条件を選び、実測値・目標値がもたらす社会への影響を比較します。</ScreenLead>
        <p className="page-back">
          <Link href={target ? `/portfolio/${target.id}` : "/research"}>← {target ? "指標の管理へ" : "公開データで検証へ"}</Link>
        </p>
      </div>

      <Card title="評価対象と地域">
        <form method="get" className="target-form">
          {target && <input type="hidden" name="target" value={target.id} />}
          <div className="field-row">
            <div className="field">
              <label htmlFor="gvfd-topic">評価対象</label>
              <select name="topic" id="gvfd-topic" defaultValue={topic}>
                {topics.map((item) => <option key={item} value={item}>{GVFD_TOPICS[item]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gvfd-geography">影響が発生する国・地域</label>
              <select name="geography" id="gvfd-geography" defaultValue={geography.id}>
                {dataset.geographies.map((item) => (
                  <option key={item.id} value={item.id}>{item.name === "Japan" ? "日本（Japan）" : item.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="field-hint">初期表示は日本です。拠点から地域を自動判定していないため、排出・消費・処理が起きる地域を確認してください。</p>
          <button className="pill-btn">この対象・地域の係数を表示</button>
        </form>
      </Card>

      <Card title={`${GVFD_TOPICS[topic]} · ${geography.name}`}>
        <GvfdCalculator
          key={`${topic}-${geography.id}-${target?.revision ?? ""}`}
          factors={factorsFor(dataset, topic, geography.id)}
          geography={geography.name}
          topic={topic}
          source={dataset.source}
          target={target}
        />
      </Card>

      <Card title="原本と収録範囲">
        <p>
          GVFD {dataset.source.version.toUpperCase()}（{dataset.source.versionDate}）。{dataset.geographies.length}の国・地域、
          {dataset.source.recordCount.toLocaleString("ja-JP")}件の数値係数。欠損{dataset.source.missingCount.toLocaleString("ja-JP")}セルは算定に使用しません。価格年・通貨は2023年USDです。
        </p>
        <p>GHGは原本で正式、水消費は公開草案、その他は暫定とされています。V2では廃棄物の単位と不快影響の係数が修正されています。</p>
        <p>生物資源・鉱物資源の重量、送粉頻度、種の観察個体数に直接掛ける係数は含みません。今回の研究用算定を、企業の支払額・自然債務・投資判定に自動加算しません。</p>
        <p>
          <a href={dataset.source.url}>公式原本をダウンロード</a> · <a href={METHODOLOGY_URL}>対応する方法論・モデル</a>
        </p>
        <details className="foldout">
          <summary>原本の識別情報</summary>
          <p>{dataset.source.workbookName}</p>
          <p style={{ overflowWrap: "anywhere" }}>取得日 {dataset.source.acquiredOn} / SHA-256 {dataset.source.workbookSha256}</p>
        </details>
      </Card>
    </div>
  );
}
