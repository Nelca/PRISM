import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ceAirImpact, esvdAreaIllustration, ifviVisibility, observationRate, pollinationScenario } from "./calculations";
import { DEFAULT_POLLINATION, syntheticTargets } from "./samples";
import { editableTargetCsv, parseTargetCsv } from "@/lib/environment/csv";
import { researchEnabled } from "./access";
import manifest from "@/docs/data/research/manifest.json";
import esvd from "@/docs/data/research/esvd-2020.json";
describe("研究データの出典と計算", () => {
  it("取得原本のハッシュ・ESVDレコード数・欠損を保持する", () => {
    for (const source of manifest) expect(createHash("sha256").update(readFileSync(`docs/data/research/raw/${source.file}`)).digest("hex")).toBe(source.sha256);
    expect(esvd).toHaveLength(4808);
    expect(esvd.filter((row) => row.value !== null)).toHaveLength(3286);
    expect(new Set(esvd.map((row) => row.id)).size).toBe(4798);
    expect(new Set(esvd.map((row) => row.row)).size).toBe(esvd.length);
    expect(esvd.find((row) => row.id === "2560009")?.value).toBe(21811.7405774258);
  });
  it("CEのkgとIFVI部分試算のt、価格年・地域を混ぜない", () => {
    const impact = ceAirImpact("SO2", 100, "EU27");
    expect(impact.lower).toBeCloseTo(1690);
    expect(impact.central).toBe(2660);
    expect(impact.upper).toBe(4530);
    expect(impact.unit).toBe("EUR2021");
    expect(() => ceAirImpact("SO2", 100, "JP")).toThrow();
    expect(() => ceAirImpact("PM2.5", 100, "EU27")).toThrow();
    expect(ifviVisibility("SO2", 1)).toBe(10.43);
    expect(() => ifviVisibility("SO2", -1)).toThrow();
  });
  it("送粉売上減少の仮説と追加費用・開始時支出を分ける", () => {
    const result = pollinationScenario(DEFAULT_POLLINATION);
    expect(result.revenue).toBe(30000000);
    expect(result.exposedRevenue).toBe(3900000);
    expect(result.incrementalCash).toBe(1450000);
    expect(pollinationScenario({ ...DEFAULT_POLLINATION, discountPercent: 0 }).npv).toBe(5250000);
    expect(pollinationScenario({ ...DEFAULT_POLLINATION, dependencyPercent: 0 }).exposedRevenue).toBe(0);
    expect(() => pollinationScenario({ ...DEFAULT_POLLINATION, avoidancePercent: 101 })).toThrow();
    expect(() => pollinationScenario({ ...DEFAULT_POLLINATION, horizon: 0 })).toThrow();
  });
  it("欠損はゼロとせず、観察努力量を正規化する", () => {
    expect(() => esvdAreaIllustration(null, 10)).toThrow();
    expect(esvdAreaIllustration(0, 10)).toBe(0);
    expect(observationRate(60, 20)).toBe(observationRate(72, 24));
    expect(() => observationRate(0, 0)).toThrow();
  });
  it("合成データ4件を既存の取込へ渡し、個体数の小数は拒否する", () => {
    const targets = syntheticTargets("site-042");
    expect(parseTargetCsv(editableTargetCsv(targets)).errors).toEqual([]);
    expect(targets.every((record) => record.evidence.includes("合成データ") && record.boundary.includes("研究用"))).toBe(true);
    expect(parseTargetCsv(editableTargetCsv([{ ...targets[1], current: 0.5 }])).errors.length).toBeGreaterThan(0);
  });
  it("研究用画面は明示的に有効化した場合のみ使う", () => {
    const previous = process.env.PRISM_RESEARCH_ENABLED;
    try { delete process.env.PRISM_RESEARCH_ENABLED; expect(researchEnabled()).toBe(false); process.env.PRISM_RESEARCH_ENABLED = "1"; expect(researchEnabled()).toBe(true); }
    finally { if (previous === undefined) delete process.env.PRISM_RESEARCH_ENABLED; else process.env.PRISM_RESEARCH_ENABLED = previous; }
  });
});
