"use client";

import { useState } from "react";
import manifest from "@/docs/data/research/manifest.json";
import { CE_AIR, ceAirImpact, esvdAreaIllustration, pollinationScenario, type PollinationInput } from "@/lib/research/calculations";
import type { EsvdRecord } from "@/lib/research/esvd-data";
import { DEFAULT_POLLINATION, SYNTHETIC_NOTICE } from "@/lib/research/samples";
import { TextExport } from "../components/text-export";

type Kind = "pollination" | "ce" | "esvd";

const KIND_OPTIONS: [Kind, string][] = [
  ["pollination", "送粉低下と対策費用（合成データ）"],
  ["ce", "CE Delft：大気汚染の厚生損失"],
  ["esvd", "ESVD：生態系サービスと面積"],
];

/** 試算結果に出典として添える原本(manifest.json のファイル名)。 */
const SOURCE_FILES: Record<Kind, string[]> = {
  pollination: [],
  ce: ["ce-delft-eu27-v1.1.pdf", "ce-delft-erratum-v1.1.pdf"],
  esvd: ["esvd-december-2020.xlsx"],
};

const POLLINATION_FIELDS: [keyof PollinationInput, string][] = [
  ["yieldTonnes", "年間収量（t）"],
  ["pricePerKg", "販売単価（円/kg）"],
  ["dependencyPercent", "送粉への依存度（%、仮定）"],
  ["declinePercent", "送粉機能の低下率（%、仮定）"],
  ["avoidancePercent", "対策による減収回避率（%、仮定）"],
  ["annualCost", "対策の追加年間費用（円）"],
  ["initialCost", "初期投資（円）"],
  ["horizon", "評価期間（年）"],
  ["discountPercent", "割引率（%）"],
];

const format = (value: number) => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value);

function requiredNumber(form: FormData, key: string): number {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw || !Number.isFinite(Number(raw))) throw new Error("必要な数値を入力してください。");
  return Number(raw);
}

function pollinationText(form: FormData): string {
  const input = Object.fromEntries(POLLINATION_FIELDS.map(([key]) => [key, requiredNumber(form, key)])) as unknown as PollinationInput;
  const result = pollinationScenario(input);
  return [
    "架空リンゴ園の送粉感度分析",
    SYNTHETIC_NOTICE,
    `年間売上: ${format(result.revenue)}円`,
    `送粉に依存する売上: ${format(result.dependentRevenue)}円`,
    `送粉低下時の売上減少仮説: ${format(result.exposedRevenue)}円/年`,
    `対策で回避する売上減少: ${format(result.avoidedRevenueLoss)}円/年`,
    `追加年間費用控除後: ${format(result.incrementalCash)}円/年`,
    `対策単体NPV: ${format(result.npv)}円`,
    `前提: ${JSON.stringify(input)}`,
    "依存度×機能低下率に比例して減収する仮説。利益率・税・価格変動・代替受粉は未考慮。自然債務や既存案件に自動合算しない。",
  ].join("\n");
}

function ceText(form: FormData): string {
  const pollutant = String(form.get("pollutant"));
  const kg = requiredNumber(form, "quantity");
  const result = ceAirImpact(pollutant, kg, "EU27");
  return [
    `CE Delft EU27 v1.1・大気排出 ${pollutant}`,
    `仮定排出量: ${kg}kg`,
    `厚生損失: ${format(result.lower)}〜${format(result.upper)} EUR2021 / 中央 ${format(result.central)} EUR2021`,
    "EU27平均・2019年排出条件。日本への地域移転なし。Table 3（PDF33ページ）と正誤表を照合。企業の支払額ではない。",
  ].join("\n");
}

function esvdText(form: FormData, record: EsvdRecord | undefined): string {
  if (!record) throw new Error("参照するESVDレコードを選択してください。");
  const area = requiredNumber(form, "area");
  return [
    `ESVD December 2020 / ValueID ${record.id}`,
    `参照地域: ${record.country}`,
    `サービス: ${record.service}`,
    `原標準化値: ${record.value} Int$2020/ha/年`,
    `仮定面積: ${area}ha`,
    `面積を掛けた参考値: ${format(esvdAreaIllustration(record.value, area))} Int$2020/年`,
    `原本行: ${record.row}`,
    `出典: ${record.reference}`,
    `未レビュー: ${record.reviewed ? "いいえ（原本のレビュー欄あり）" : "はい"}`,
    "対象地への適合を検証していない便益移転の算術例。異なる研究を合算しない。現金収入や円には読み替えない。",
  ].join("\n");
}

function provenance(kind: Kind): string {
  const sources = manifest.filter((source) => SOURCE_FILES[kind].includes(source.file));
  if (sources.length === 0) return "";
  const lines = sources.map((source) => `${source.file}\n${source.url}\n取得日: ${source.acquiredOn}\nSHA-256: ${source.sha256}`);
  return `\n\n使用資料\n${lines.join("\n\n")}`;
}

export function ResearchCalculators({ esvd }: { esvd: EsvdRecord[] }) {
  const [kind, setKind] = useState<Kind>("pollination");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [esvdRow, setEsvdRow] = useState(String(esvd[0]?.row ?? ""));
  const selected = esvd.find((record) => String(record.row) === esvdRow);
  // 入力を変えたら古い結果を残さない。
  const reset = () => {
    setOutput("");
    setError("");
  };

  function calculate(form: FormData) {
    reset();
    try {
      const text = kind === "pollination" ? pollinationText(form) : kind === "ce" ? ceText(form) : esvdText(form, selected);
      setOutput(text + provenance(kind));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "入力を確認してください。");
    }
  }

  return (
    <>
      <div className="field">
        <label htmlFor="research-kind">試す計算</label>
        <select
          id="research-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as Kind);
            reset();
          }}
        >
          {KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <form action={calculate} key={kind} className="target-form" onChange={reset}>
        {kind === "pollination" && (
          <>
            <p>{SYNTHETIC_NOTICE}</p>
            <div className="field-row">
              {POLLINATION_FIELDS.map(([key, label]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    name={key}
                    type="number"
                    required
                    min={key === "horizon" ? 1 : 0}
                    max={key.endsWith("Percent") ? 100 : key === "horizon" ? 50 : undefined}
                    step={key === "horizon" ? 1 : "any"}
                    defaultValue={DEFAULT_POLLINATION[key]}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {kind === "esvd" && (
          <>
            <div className="field">
              <label htmlFor="esvd-id">参照する原研究（日本・送粉の例）</label>
              <select id="esvd-id" value={esvdRow} onChange={(event) => setEsvdRow(event.target.value)}>
                {esvd.map((record) => (
                  <option key={record.row} value={String(record.row)}>
                    {record.id}（行{record.row}） · {record.country} · {record.service.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            {selected && <p>原研究: {selected.reference} / {selected.biome} / 原本レビュー欄: {selected.reviewed ? "あり" : "なし"}</p>}
            <div className="field">
              <label htmlFor="area">仮定する面積（ha）</label>
              <input id="area" name="area" type="number" min="0" step="any" required defaultValue="10" />
            </div>
          </>
        )}
        {kind === "ce" && (
          <>
            <p>EU27平均条件の架空排出源。係数はEUR2021/kg。日本の拠点への適用は行いません。地域別の算定はGVFD画面を利用してください。</p>
            <div className="field">
              <label htmlFor="pollutant">排出物質</label>
              <select id="pollutant" name="pollutant">
                {CE_AIR.map((row) => <option key={row.id}>{row.id}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quantity">仮定排出量（kg）</label>
              <input id="quantity" name="quantity" type="number" required min="0" step="any" defaultValue="100" />
            </div>
          </>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="pill-btn pill-btn--accent">入力した前提で試算する</button>
      </form>
      {output && (
        <section aria-label="研究用試算結果">
          <h3>試算結果</h3>
          <pre className="draft-text">{output}</pre>
          <TextExport text={output} filename="prism-research-result.txt" copyLabel="結果をコピー" />
        </section>
      )}
    </>
  );
}
