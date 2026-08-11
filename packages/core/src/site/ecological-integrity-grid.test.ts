import { describe, expect, it } from "vitest";
import { lookupEcologicalIntegrityTrend } from "./ecological-integrity-grid";

describe("lookupEcologicalIntegrityTrend", () => {
  it("既知の拠点座標(site-042、愛知県)に対して2015/2023年の値を返す", () => {
    const trend = lookupEcologicalIntegrityTrend(35.1, 136.9);
    expect(trend.startYear).toBe(2015);
    expect(trend.endYear).toBe(2023);
    expect(trend.startValue).toBeCloseTo(0.026518, 5);
    expect(trend.endValue).toBeCloseTo(0.026587, 5);
  });

  it("任意の座標(グリッドに存在しない特定の拠点IDを持たない、将来追加される拠点相当)でも値を返す", () => {
    // ブラジル・ロンドニア州(既知のデモ3拠点とは無関係の座標)。
    const trend = lookupEcologicalIntegrityTrend(-10.5, -62.8);
    expect(typeof trend.startValue).toBe("number");
    expect(typeof trend.endValue).toBe("number");
    expect(Number.isNaN(trend.startValue)).toBe(false);
    expect(Number.isNaN(trend.endValue)).toBe(false);
  });

  it("経度の境界(180度をまたぐ場合)でも範囲外にならない", () => {
    const trend = lookupEcologicalIntegrityTrend(0, 179.9);
    expect(Number.isNaN(trend.startValue)).toBe(false);
    const wrapped = lookupEcologicalIntegrityTrend(0, -179.9);
    expect(Number.isNaN(wrapped.startValue)).toBe(false);
  });

  it("緯度の境界(極付近)でも範囲外にならない", () => {
    const north = lookupEcologicalIntegrityTrend(89.9, 0);
    const south = lookupEcologicalIntegrityTrend(-89.9, 0);
    expect(Number.isNaN(north.startValue)).toBe(false);
    expect(Number.isNaN(south.startValue)).toBe(false);
  });
});
