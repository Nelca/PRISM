"use client";
import { useState } from "react";
import { applicableFactors, allowedInputUnits, calculateGvfd, commonLocation, GVFD_GUIDANCE, GVFD_TOPICS, locationsFor, quantityUnit, type GvfdDataset, type GvfdFactor, type GvfdTopic } from "@/lib/research/gvfd";
import { TextExport } from "../../components/text-export";
type SourceTarget = { id: string; revision: string; site: string; label: string; unit: string; current: number | null; target: number | null; year: number; boundary: string; evidence: string };
const fmt = (value: number) => new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value);
const labels: Record<string, string> = { Urban: "都市", "Peri-Urban": "都市近郊", Rural: "農村", Transport: "輸送", Landfill: "埋立", Incineration: "焼却", Unspecified: "不明（原本の既定条件）", Freshwater: "淡水", Seawater: "海水", Hazardous: "有害廃棄物", "Non-Hazardous": "非有害廃棄物", "Primary Health": "一次健康影響", "Secondary Health": "二次健康影響", Visibility: "視程低下", Agriculture: "農業", Leachate: "浸出水", "Waste GHGs": "廃棄物由来GHG", Disamenity: "不快影響", "Waste Air pollution": "廃棄物由来大気汚染", "Heavy metals and dioxins": "重金属・ダイオキシン", Malnutrition: "栄養失調", "Water-borne disease": "水系感染症", "Resource cost": "資源費用", "Ecosystem services": "生態系サービス", "Lost Ecosystem Services": "生態系サービスの損失", Eutrophication: "富栄養化", Health: "健康影響" };
const label = (value: string) => commonLocation(value) ? "共通（追加条件なし）" : labels[value] ? `${labels[value]}（${value}）` : value;
export function GvfdCalculator({ factors, topic, geography, source, target }: { factors: GvfdFactor[]; topic: GvfdTopic; geography: string; source: GvfdDataset["source"]; target: SourceTarget | null }) {
  const categories = [...new Set(factors.map((factor) => factor.category))];
  const initialCategory = categories.length === 1 ? categories[0] : "";
  const initialLocations = locationsFor(factors, initialCategory);
  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState(initialLocations.length === 1 ? initialLocations[0] : "");
  const locations = locationsFor(factors, category);
  const selected = category && location ? applicableFactors(factors, category, location) : [];
  const units = allowedInputUnits(factors[0].sourceUnit);
  const [unit, setUnit] = useState(target && units.includes(target.unit) ? target.unit : units[0]);
  const [current, setCurrent] = useState(target?.current?.toString() ?? "");
  const [alternative, setAlternative] = useState(target?.target?.toString() ?? "");
  const [output, setOutput] = useState<ReturnType<typeof calculateGvfd> | null>(null);
  const [comparison, setComparison] = useState<ReturnType<typeof calculateGvfd> | null>(null);
  const [exportText, setExportText] = useState("");
  const [error, setError] = useState("");
  const reset = () => { setOutput(null); setComparison(null); setExportText(""); setError(""); };
  function calculate(form: FormData) {
    reset();
    try {
      if (!current.trim()) throw new Error("実測値または試算する数量を入力してください。");
      if (form.get("confirmed") !== "on") throw new Error("地域・活動条件・数量の対応を確認してください。");
      const year = Number(form.get("year"));
      if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error("対象年を1900〜2200で入力してください。");
      const result = calculateGvfd(factors, category, location, Number(current), unit);
      const after = alternative.trim() ? calculateGvfd(factors, category, location, Number(alternative), unit) : null;
      const text = [
        `研究用環境影響算定 / IFVI GVFD ${source.version} (${source.versionDate})`,
        `対象年: ${year} / 対象: ${GVFD_TOPICS[topic]} (${topic}) / 地域: ${geography}`,
        `物質・用途: ${category} / 条件: ${location}`,
        `現状入力: ${current} ${unit} / 係数単位への換算後: ${result.convertedQuantity} ${result.unit}`,
        `収録成分の影響額: ${result.total} ${result.currency}${result.priceYear}`,
        after ? `比較入力: ${alternative} ${unit} / 影響額: ${after.total} ${after.currency}${after.priceYear}\n現状−比較（正なら減少）: ${result.total - after.total} USD2023` : "比較数量: 未入力",
        "影響成分と係数:", ...result.components.map((row) => `${row.impact}: 係数 ${row.value} ${row.sourceUnit} / 現状影響 ${row.amount} USD2023 / '${source.sheet}'!${row.cell} / ${row.status} / 更新 ${row.updatedOn}`),
        target ? `引継ぎ元: ${target.site} / ${target.label} / ${target.year}年 / ${target.boundary}\n管理ID: ${target.id} / 版: ${target.revision}\n元の実測: ${target.current ?? "未入力"} ${target.unit} / 元の目標: ${target.target ?? "未入力"} ${target.unit}\n元の根拠: ${target.evidence}` : "引継ぎ元: 手入力",
        `今回の入力・適用根拠: ${String(form.get("evidence") ?? "").trim() || "未記入"}`,
        GVFD_GUIDANCE[topic],
        "原本に収録された成分の合計であり、環境影響の全てを網羅するとは限りません。社会への影響額であり、企業の現金支出・利益や投資NPVではありません。他の算定へ自動合算しません。",
        `原本: ${source.workbookName}\n${source.url}\n取得日: ${source.acquiredOn}\nSHA-256: ${source.workbookSha256}`,
      ].join("\n");
      setOutput(result); setComparison(after); setExportText(text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "入力を確認してください。"); }
  }
  return <>
    <p>{GVFD_GUIDANCE[topic]}</p>
    {target && <p>統合管理の「{target.site} · {target.label} · {target.year}年」から実測値と目標値を引き継ぎました。範囲：{target.boundary}。ここで数量を変えても、元の指標は更新されません。</p>}
    <form className="target-form" onSubmit={(event) => { event.preventDefault(); calculate(new FormData(event.currentTarget)); }} onChange={reset}>
      <div className="field-row"><div className="field"><label htmlFor="gvfd-category">物質・用途・廃棄物の種類</label><select id="gvfd-category" required value={category} onChange={(event) => { const next = event.target.value; setCategory(next); const nextLocations = locationsFor(factors, next); setLocation(nextLocations.length === 1 ? nextLocations[0] : ""); }}><option value="">対象を選択</option>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
      <div className="field"><label htmlFor="gvfd-location">排出先・処理方法・適用条件</label><select id="gvfd-location" required value={location} disabled={!category} onChange={(event) => setLocation(event.target.value)}><option value="">条件を選択</option>{locations.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div></div>
      {selected.length > 0 && <div className="portfolio-table-scroll"><table className="data-table"><caption>使用する係数（2023年USD / {quantityUnit(selected[0].sourceUnit)}）</caption><thead><tr><th>影響成分</th><th>係数</th><th>原本セル</th></tr></thead><tbody>{selected.map((factor) => <tr key={factor.cell}><td>{label(factor.impact)}</td><td>{factor.value === null ? "未収録" : fmt(factor.value)}</td><td>{factor.cell}</td></tr>)}</tbody></table></div>}
      {selected.some((row) => row.value === null) && <p role="status">この条件には未収録の係数があります。算定できません。</p>}
      <div className="field-row"><div className="field"><label htmlFor="gvfd-year">対象年</label><input id="gvfd-year" name="year" type="number" required min="1900" max="2200" step="1" defaultValue={target?.year ?? ""} /></div>
      <div className="field"><label htmlFor="gvfd-unit">入力する数量の単位</label><select id="gvfd-unit" value={unit} onChange={(event) => { setUnit(event.target.value); setCurrent(""); setAlternative(""); }}>{units.map((value) => <option key={value}>{value}</option>)}</select><p className="field-hint">単位を変更した場合は数量を入れ直してください。</p></div>
      <div className="field"><label htmlFor="gvfd-current">実測値・現状の数量</label><input id="gvfd-current" type="number" min="0" step="any" required value={current} onChange={(event) => setCurrent(event.target.value)} /></div>
      <div className="field"><label htmlFor="gvfd-alternative">目標・比較する数量（任意）</label><input id="gvfd-alternative" type="number" min="0" step="any" value={alternative} onChange={(event) => setAlternative(event.target.value)} /></div></div>
      <p className="field-hint">比較には同じ地域・物質・条件の係数を使用します。0は数量ゼロ、空欄は比較なしとして扱います。</p>
      <div className="field"><label htmlFor="gvfd-evidence">数量と適用条件の根拠（任意）</label><textarea id="gvfd-evidence" name="evidence" rows={2} maxLength={4000} placeholder="対象期間、測定方法、排出先や処理方法を確認した資料など" /></div>
      <label><input name="confirmed" type="checkbox" required /> 表示された国・地域、物質・用途、適用条件と数量の対応を確認しました</label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="pill-btn pill-btn--accent" disabled={!selected.length || selected.some((row) => row.value === null)}>環境影響を算定する</button>
    </form>
    {output && <section aria-label="GVFD算定結果"><h3>収録成分の影響額</h3><div className="portfolio-detail-values"><div><span>現状</span><strong>{fmt(output.total)} USD2023</strong></div>{comparison && <><div><span>目標・比較</span><strong>{fmt(comparison.total)} USD2023</strong></div><div><span>{output.total >= comparison.total ? "影響額の減少" : "影響額の増加"}</span><strong>{fmt(Math.abs(output.total - comparison.total))} USD2023</strong></div></>}</div><p>社会への影響を2023年価格の米ドルで表示しています。企業の支払額・利益ではありません。</p><TextExport text={exportText} filename="prism-gvfd-result.txt" /><details className="foldout"><summary>計算の内訳・入力・出典</summary><pre className="draft-text">{exportText}</pre></details></section>}
  </>;
}
