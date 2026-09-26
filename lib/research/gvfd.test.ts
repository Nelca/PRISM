import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applicableFactors, calculateGvfd, factorsFor, GVFD_METRIC_TOPICS, locationsFor, type GvfdDataset } from "./gvfd";
const data: GvfdDataset = JSON.parse(readFileSync("docs/data/research/gvfd-v2.json", "utf8"));
const japan = data.geographies.find((row) => row.name === "Japan")!.id;
const jp = (topic: string) => factorsFor(data, topic, japan);
describe("GVFD V2の原本・適用条件・単位換算", () => {
  it("版とハッシュを固定し、全係数と欠損・地域識別を保持する", () => {
    expect(createHash("sha256").update(readFileSync("docs/data/research/raw/ifvi-gvfd-v2.xlsm")).digest("hex")).toBe(data.source.workbookSha256);
    expect(createHash("sha256").update(readFileSync("docs/data/research/raw/ifvi-gvfd-v2.zip")).digest("hex")).toBe(data.source.archiveSha256);
    expect(data.source.versionDate).toBe("2025-04-03");
    expect(data.rows).toHaveLength(474);
    expect(data.geographies).toHaveLength(268);
    expect(data.rows.flatMap((r) => r.values).filter((v) => v !== null)).toHaveLength(104832);
    expect(data.rows.flatMap((r) => r.values).filter((v) => v === null)).toHaveLength(22200);
    expect(new Set(data.rows.map((r) => r.reference)).size).toBe(474);
    expect(data.rows.every((r) => r.priceYear === 2023 && r.currency === "USD" && r.values.length === 268)).toBe(true);
    expect(() => factorsFor(data, "Air Pollution", "UNKNOWN")).toThrow();
    expect(() => factorsFor(data, "UNKNOWN", japan)).toThrow();
  });
  it("原本Calculatorのコロンビア廃棄物例100tを再現する", () => {
    const colombia = data.geographies.find((g) => g.name === "Colombia")!;
    const factors = factorsFor(data, "Waste", colombia.id);
    const result = calculateGvfd(factors, "Non-Hazardous", "Landfill", 100, "t");
    expect(result.components.find((row) => row.impact === "Leachate")!.amount).toBeCloseTo(27.292308267657617, 10);
    expect(result.components).toHaveLength(3);
    expect(result.components.every((row) => row.updatedOn === "2025-04-03" && row.sourceUnit === "$/metric ton")).toBe(true);
    expect(calculateGvfd(factors, "Non-Hazardous", "Landfill", 100000, "kg").total).toBe(result.total);
  });
  it("GHG・水消費の日本値を再現し、0係数を欠損としない", () => {
    expect(calculateGvfd(jp("GHG Emissions"), "N/A for GHG", "N/A for GHG", 100, "tCO2e").total).toBe(23600);
    const result = calculateGvfd(jp("Water Consumption"), "N/A for WC", "N/A for WC", 100, "m³");
    expect(result.total).toBeCloseTo(250.7619537223573, 10);
    expect(result.components.find((r) => r.impact === "Resource cost")!.amount).toBe(0);
    expect(result.components).toHaveLength(4);
  });
  it("大気汚染では排出源条件を一つだけ選び、共通成分を一度加える", () => {
    const factors = jp("Air Pollution");
    const selected = applicableFactors(factors, "NOx", "Urban");
    expect(selected.map((r) => r.impact)).toEqual(["Primary Health", "Agriculture", "Visibility"]);
    expect(selected.some((r) => r.location === "Rural")).toBe(false);
    expect(locationsFor(factors, "NOx")).not.toContain("N/A for NOx");
    expect(() => calculateGvfd(factors, "NOx", "N/A for NOx", 1, "t")).toThrow();
    expect(calculateGvfd(factors, "PM2.5", "Urban", 1000, "kg").total).toBe(calculateGvfd(factors, "PM2.5", "Urban", 1, "t").total);
    expect(calculateGvfd(factors, "VOC", "N/A for VOC", 1, "t").components).toHaveLength(3);
  });
  it("土地利用と転換・水質汚染の媒体を別の係数として計算する", () => {
    expect(calculateGvfd(jp("Land Use"), "Wheat - conventional", "N/A for LULC", 1, "ha").total).toBe(10228.071875030435);
    expect(calculateGvfd(jp("Land Conversion"), "Wheat - conventional", "N/A for LULC", 1, "ha").total).toBe(593634.0321710077);
    expect(calculateGvfd(jp("Water Pollution"), "Ag(I)", "Freshwater", 1, "kg").total).toBe(260.54161695601744);
    expect(calculateGvfd(jp("Water Pollution"), "Ag(I)", "Seawater", 1, "kg").total).toBe(3.3098293949593867);
    expect(calculateGvfd(jp("Water Pollution"), "Phosphorus", "N/A for this Category", 0.001, "t").total).toBe(104.71128994812658);
  });
  it("欠損地域・重複・単位混在・不正数量で過小な合計を返さない", () => {
    const california = data.geographies.find((g) => g.name === "California")!;
    expect(() => calculateGvfd(factorsFor(data, "Waste", california.id), "Non-Hazardous", "Landfill", 1, "t")).toThrow("未収録");
    const factors = jp("Water Consumption");
    expect(() => calculateGvfd([...factors, factors[0]], "N/A for WC", "N/A for WC", 1, "m³")).toThrow("重複");
    expect(() => calculateGvfd(factors.map((r, i) => i === 0 ? { ...r, priceYear: 2020 } : r), "N/A for WC", "N/A for WC", 1, "m³")).toThrow("価格年");
    for (const quantity of [-1, Infinity, NaN, Number.MAX_VALUE]) expect(() => calculateGvfd(factors, "N/A for WC", "N/A for WC", quantity, "m³")).toThrow();
    expect(() => calculateGvfd(factors, "N/A for WC", "N/A for WC", 1, "kg")).toThrow("単位");
    expect(calculateGvfd(factors, "N/A for WC", "N/A for WC", 0, "m³").total).toBe(0);
    expect(GVFD_METRIC_TOPICS.biological_procurement).toBeUndefined();
    expect(GVFD_METRIC_TOPICS.habitat_area).toBeUndefined();
  });
});
