import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rowsAsObjects } from "./csv";
import {
  LIME3_WATER_GROUND_CONSUMPTION_JAPAN,
  LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE,
  LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
  LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE,
} from "./water-coefficients";

const csv = readFileSync(resolve("docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv"), "utf8");
const rows = rowsAsObjects(csv);

const DALY_WORLD_AVERAGE_COLUMN = "利子率2%、消費国、世界平均 / 人間健康 / DALY";
const DALY_JAPAN_COLUMN = "利子率2%、消費国、日本 / 人間健康 / DALY";
const USD_WORLD_AVERAGE_COLUMN = "利子率2%、消費国、世界平均 / 統合化 / US$";
const USD_JAPAN_COLUMN = "利子率2%、消費国、日本 / 統合化 / US$";

function row(sourceFlowId: string): Record<string, string> {
  const found = rows.find((r) => r["基本フローコード"] === sourceFlowId);
  if (!found) throw new Error(`CSVに基本フローコード${sourceFlowId}の行が見つかりません`);
  return found;
}

describe("LIME3水係数の構成要素(完成実装T-05)", () => {
  it("表層水・世界平均がCSVの該当セルと一致する", () => {
    const r = row("001511000");
    expect(LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE.humanHealthDalyPerM3).toBe(Number(r[DALY_WORLD_AVERAGE_COLUMN]));
    expect(LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE.integratedUsdPerM3).toBe(Number(r[USD_WORLD_AVERAGE_COLUMN]));
  });

  it("表層水・日本がCSVの該当セルと一致し、lime3-water.tsの単一係数と同じ値である", () => {
    const r = row("001511000");
    expect(LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.humanHealthDalyPerM3).toBe(Number(r[DALY_JAPAN_COLUMN]));
    expect(LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3).toBe(Number(r[USD_JAPAN_COLUMN]));
    expect(LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3).toBe(0.0135886259);
  });

  it("地下水・世界平均/日本がCSVの該当セルと一致する", () => {
    const r = row("001515000");
    expect(LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE.humanHealthDalyPerM3).toBe(Number(r[DALY_WORLD_AVERAGE_COLUMN]));
    expect(LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE.integratedUsdPerM3).toBe(Number(r[USD_WORLD_AVERAGE_COLUMN]));
    expect(LIME3_WATER_GROUND_CONSUMPTION_JAPAN.humanHealthDalyPerM3).toBe(Number(r[DALY_JAPAN_COLUMN]));
    expect(LIME3_WATER_GROUND_CONSUMPTION_JAPAN.integratedUsdPerM3).toBe(Number(r[USD_JAPAN_COLUMN]));
  });

  it("統合化係数(DALY→US$)が4通りすべて有効数字8桁で23,696.265に一致する(directive §7.2.1)", () => {
    for (const c of [
      LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE,
      LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
      LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE,
      LIME3_WATER_GROUND_CONSUMPTION_JAPAN,
    ]) {
      expect(c.integrationUsdPerDaly).toBeCloseTo(23696.265, 3);
    }
  });

  it("世界平均/日本の統合化(US$/m3)比が表層水・地下水とも2.56623である", () => {
    expect(
      LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE.integratedUsdPerM3 / LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3
    ).toBeCloseTo(2.56623, 5);
    expect(
      LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE.integratedUsdPerM3 / LIME3_WATER_GROUND_CONSUMPTION_JAPAN.integratedUsdPerM3
    ).toBeCloseTo(2.56623, 5);
  });

  it("日本の地下水/表層水比が2.5833である(分解してはいけない差、T-03)", () => {
    expect(
      LIME3_WATER_GROUND_CONSUMPTION_JAPAN.integratedUsdPerM3 / LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3
    ).toBeCloseTo(2.5833, 4);
  });

  it("社会資産・生物多様性・一次生産はnot_applicableであり0として扱わない(§5.6)", () => {
    for (const c of [
      LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE,
      LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
      LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE,
      LIME3_WATER_GROUND_CONSUMPTION_JAPAN,
    ]) {
      expect(c.otherEndpoints.socialAssets.status).toBe("not_applicable");
      expect(c.otherEndpoints.biodiversity.status).toBe("not_applicable");
      expect(c.otherEndpoints.primaryProduction.status).toBe("not_applicable");
    }
  });

  it("価格基準年は未確認のためnullのまま(推定で埋めない、D-15)", () => {
    expect(LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.priceYear).toBeNull();
    expect(LIME3_WATER_GROUND_CONSUMPTION_JAPAN.priceYear).toBeNull();
  });

  it("各係数がCSVパス・行コード・列名・SHA-256を引用したevidenceを持つ", () => {
    for (const c of [LIME3_WATER_SURFACE_CONSUMPTION_JAPAN, LIME3_WATER_GROUND_CONSUMPTION_JAPAN]) {
      expect(c.evidence.length).toBeGreaterThanOrEqual(2);
      for (const e of c.evidence) {
        expect(e.source).toBe("docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv");
        expect(e.hash).toBe("63e1744476fc33fb741e176bcea94f0e9dbd5c757a48e9aa620f70d22a959844");
        expect(e.locator).toContain(c.sourceFlowId);
      }
    }
  });
});
