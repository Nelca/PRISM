"use client";
import { useState } from "react";
import { CE_AIR, IFVI_VISIBILITY, ceAirImpact, ifviVisibility, esvdAreaIllustration, pollinationScenario } from "@/lib/research/calculations";
import { DEFAULT_POLLINATION, SYNTHETIC_NOTICE } from "@/lib/research/samples";
import { TextExport } from "../components/text-export";
import manifest from "@/docs/data/research/manifest.json";
export interface EsvdExample { id: string; row: number; country: string; biome: string; service: string; value: number | null; reference: string; reviewed: boolean; }
const format = (value: number) => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);
export function ResearchCalculators({ esvd }: { esvd: EsvdExample[] }) {
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState("pollination");
  const [esvdId, setEsvdId] = useState(String(esvd[0]?.row ?? ""));
  const selected = esvd.find((row) => String(row.row) === esvdId);
  function calculate(form: FormData) {
    setOutput(""); setError("");
    const number = (key: string) => {
      const raw = String(form.get(key) ?? "").trim();
      if (!raw || !Number.isFinite(Number(raw))) throw new Error("必要な数値を入力してください。");
      return Number(raw);
    };
    try {
      let text = "";
      if (kind === "pollination") {
        const input = Object.fromEntries(Object.keys(DEFAULT_POLLINATION).map((key) => [key, number(key)])) as typeof DEFAULT_POLLINATION;
        const result = pollinationScenario(input);
        text = `架空リンゴ園の送粉感度分析\n${SYNTHETIC_NOTICE}\n年間売上: ${format(result.revenue)}円\n送粉に依存する売上: ${format(result.dependentRevenue)}円\n送粉低下時の売上減少仮説: ${format(result.exposedRevenue)}円/年\n対策で回避する売上減少: ${format(result.avoidedRevenueLoss)}円/年\n追加年間費用控除後: ${format(result.incrementalCash)}円/年\n対策単体NPV: ${format(result.npv)}円\n前提: ${JSON.stringify(input)}\n依存度×機能低下率に比例して減収する仮説。利益率・税・価格変動・代替受粉は未考慮。自然債務や既存案件に自動合算しない。`;
      } else if (kind === "ce") {
        const id = String(form.get("pollutant")); const kg = number("quantity");
        const result = ceAirImpact(id, kg, "EU27");
        text = `CE Delft EU27 v1.1・大気排出 ${id}\n仮定排出量: ${kg}kg\n厚生損失: ${format(result.lower)}〜${format(result.upper)} EUR2021 / 中央 ${format(result.central)} EUR2021\nEU27平均・2019年排出条件。日本への地域移転なし。Table 3（PDF33ページ）と正誤表を照合。企業の支払額ではない。`;
      } else if (kind === "ifvi") {
        const id = String(form.get("pollutant")); const tonnes = number("quantity");
        text = `IFVI Air Pollution 2024 Table 5・視程低下の部分試算\n仮定排出量: ${tonnes}t / ${id}\n視程低下の費用: ${format(ifviVisibility(id, tonnes))} USD2011\n米国の元研究値を使った算術検証。健康・農業等を含む総影響でも、日本向けGVFD係数でもない。CE Delftの総影響には加算しない。`;
      } else {
        if (!selected) throw new Error("参照するESVDレコードを選択してください。");
        const area = number("area");
        text = `ESVD December 2020 / ValueID ${selected.id}\n参照地域: ${selected.country}\nサービス: ${selected.service}\n原標準化値: ${selected.value} Int$2020/ha/年\n仮定面積: ${area}ha\n面積を掛けた参考値: ${format(esvdAreaIllustration(selected.value, area))} Int$2020/年\n原本行: ${selected.row}\n出典: ${selected.reference}\n未レビュー: ${selected.reviewed ? "いいえ（原本のレビュー欄あり）" : "はい"}\n対象地への適合を検証していない便益移転の算術例。異なる研究を合算しない。現金収入や円には読み替えない。`;
      }
      const files = kind === "ce" ? ["ce-delft-eu27-v1.1.pdf", "ce-delft-erratum-v1.1.pdf"] : kind === "ifvi" ? ["ifvi-air-pollution-2024.pdf"] : kind === "esvd" ? ["esvd-december-2020.xlsx"] : [];
      const provenance = manifest.filter((source) => files.includes(source.file)).map((source) => `${source.file}\n${source.url}\n取得日: ${source.acquiredOn}\nSHA-256: ${source.sha256}`).join("\n\n");
      setOutput(`${text}${provenance ? `\n\n使用資料\n${provenance}` : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "入力を確認してください。"); }
  }
  return <>
    <div className="field"><label htmlFor="research-kind">試す計算</label><select id="research-kind" value={kind} onChange={(event) => { setKind(event.target.value); setOutput(""); setError(""); }}><option value="pollination">送粉低下と対策費用（合成データ）</option><option value="ce">CE Delft：大気汚染の厚生損失</option><option value="esvd">ESVD：生態系サービスと面積</option><option value="ifvi">IFVI：視程低下の部分試算</option></select></div>
    <form action={calculate} key={kind} className="target-form" onChange={() => { setOutput(""); setError(""); }}>
      {kind === "pollination" ? <>
        <p>{SYNTHETIC_NOTICE}</p><div className="field-row">{([
          ["yieldTonnes", "年間収量（t）"], ["pricePerKg", "販売単価（円/kg）"], ["dependencyPercent", "送粉への依存度（%、仮定）"], ["declinePercent", "送粉機能の低下率（%、仮定）"], ["avoidancePercent", "対策による減収回避率（%、仮定）"], ["annualCost", "対策の追加年間費用（円）"], ["initialCost", "初期投資（円）"], ["horizon", "評価期間（年）"], ["discountPercent", "割引率（%）"],
        ] as const).map(([key, label]) => <div className="field" key={key}><label htmlFor={key}>{label}</label><input id={key} name={key} type="number" required min={key === "horizon" ? 1 : 0} max={key.endsWith("Percent") ? 100 : key === "horizon" ? 50 : undefined} step={key === "horizon" ? 1 : "any"} defaultValue={DEFAULT_POLLINATION[key]} /></div>)}</div>
      </> : kind === "esvd" ? <>
        <div className="field"><label htmlFor="esvd-id">参照する原研究（日本・送粉の例）</label><select id="esvd-id" value={esvdId} onChange={(event) => setEsvdId(event.target.value)}>{esvd.map((row) => <option key={row.row} value={String(row.row)}>{row.id}（行{row.row}） · {row.country} · {row.service.slice(0, 60)}</option>)}</select></div>
        {selected && <p>原研究: {selected.reference} / {selected.biome} / 原本レビュー欄: {selected.reviewed ? "あり" : "なし"}</p>}
        <div className="field"><label htmlFor="area">仮定する面積（ha）</label><input id="area" name="area" type="number" min="0" step="any" required defaultValue="10" /></div>
      </> : <>
        <p>{kind === "ce" ? "EU27平均条件の架空排出源。係数はEUR2021/kg。日本の拠点への適用は行いません。" : "米国の元研究における視程低下だけの費用。係数はUSD2011/t。GVFD全体は未取得です。"}</p>
        <div className="field"><label htmlFor="pollutant">排出物質</label><select id="pollutant" name="pollutant">{(kind === "ce" ? CE_AIR : IFVI_VISIBILITY).map((row) => <option key={row.id}>{row.id}</option>)}</select></div>
        <div className="field"><label htmlFor="quantity">仮定排出量（{kind === "ce" ? "kg" : "t"}）</label><input id="quantity" name="quantity" type="number" required min="0" step="any" defaultValue="100" /></div>
      </>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="pill-btn pill-btn--accent">入力した前提で試算する</button>
    </form>
    {output && <section aria-label="研究用試算結果"><h3>試算結果</h3><pre className="draft-text">{output}</pre><TextExport text={output} filename="prism-research-result.txt" /></section>}
  </>;
}
