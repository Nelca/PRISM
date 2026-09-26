import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import Link from "next/link";
import { researchEnabled } from "@/lib/research/access";
import { loadPipelineView } from "@/lib/views/pipeline";
import { syntheticTargets, RESEARCH_SOURCES, SYNTHETIC_NOTICE } from "@/lib/research/samples";
import { editableTargetCsv } from "@/lib/environment/csv";
import { ImportForm } from "../portfolio/import/import-form";
import { Card, ScreenLead } from "../components/ui";
import { ResearchCalculators, type EsvdExample } from "./calculators";
import manifest from "@/docs/data/research/manifest.json";
export const metadata = { title: "公開データで検証 | PRISM" };
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  if (!researchEnabled()) notFound();
  const result = await loadPipelineView();
  const { site } = await searchParams;
  const selected = result.assessment.sites.find((item) => item.id === site);
  const esvd: EsvdExample[] = JSON.parse(await readFile(`${process.cwd()}/docs/data/research/esvd-2020.json`, "utf8"));
  const examples = esvd.filter((item) => item.value !== null && (item.country === "Japan" || /pollination/i.test(item.service)));
  return <div className="screen">
    <div className="screen__head"><h1 className="screen__title">公開データで検証</h1><ScreenLead>外部係数と合成データで、計算・目標管理・対策比較を試せます。</ScreenLead><p>研究・実験専用。商用の評価手法レジストリには追加していません。</p><Link href="/portfolio">← 統合管理へ</Link></div>
    <Card title="IFVIの地域別係数で算定する"><p>GVFD V2を取得しました。GHG、水消費、大気汚染、廃棄物、土地利用・転換、水質汚染について、原本の地域別係数で現状と目標の影響額を比較できます。</p><Link className="pill-btn pill-btn--accent" href="/research/gvfd">GVFDで環境影響を算定する →</Link></Card>
    <Card title="数値を変えて影響を確かめる"><ResearchCalculators esvd={examples} /></Card>
    <Card title="合成データを統合管理で試す"><p>{SYNTHETIC_NOTICE}</p><p>訪花昆虫の観察頻度、対象種の観察個体数、木材調達、一次アルミ投入の4指標を準備しました。測定範囲・根拠にも「研究用」「合成データ」を記録します。</p>
      <form method="get"><div className="field"><label htmlFor="research-site">検証データの保存先拠点</label><select id="research-site" name="site" required defaultValue={selected?.id ?? ""}><option value="">検証に使う拠点を選択</option>{result.assessment.sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><button className="pill-btn">この拠点用の取込データを準備</button></form>
      {selected && <details className="foldout" open><summary>{selected.name}へ登録する4指標を確認</summary><ImportForm key={selected.id} initialCsv={editableTargetCsv(syntheticTargets(selected.id))} /></details>}
    </Card>
    <Card title="公開事例と仮定の区別">{RESEARCH_SOURCES.map((source) => <p key={source.url}><a href={source.url}>{source.label}</a>：{source.use}</p>)}<p>送粉の依存度65%、機能低下20%、回避率50%は感度分析用の仮定です。観察回数からこれらを推定していません。</p></Card>
    <Card title="取得した資料とデータ"><p>ESVD December 2020：{esvd.length}件を取得。標準化値あり{esvd.filter((row) => row.value !== null).length}件。ValueIDの重複があるため原本行番号と組み合わせて区別します。旧版であり最新版ではありません。上の試算には日本・送粉の{examples.length}件を提示しています。</p>
      <ul>{manifest.map((source) => <li key={source.file}><a href={source.url}>{source.file}</a><span className="cell-note" style={{ overflowWrap: "anywhere" }}>取得日 {source.acquiredOn} · SHA-256 {source.sha256}</span></li>)}</ul>
      <p>CE DelftはTable 3と正誤表で一致した4物質を使用。NOx・PM2.5等の表間差異は未解決のため対象外。ESVDはInt$2020/ha/年を維持し、欠損を0に置き換えません。</p>
      <p>IFVI GVFD V2の本体を取得・組込済みです。従来のTable 5の視程低下だけの試算は算術比較用として残し、GVFDの結果には加算しません。</p>
    </Card>
  </div>;
}
