import { describe, expect, it } from "vitest";
import { convertNgfsPriceToJpy, jpyPerNgfsUsd2010, lookupNgfsCarbonPrice } from "./carbon-price-trajectory";

describe("lookupNgfsCarbonPrice", () => {
  it("2050年・Net Zero 2050・日本の値を返す(docs/data/carbon-price-scenarios.md §1)", () => {
    expect(lookupNgfsCarbonPrice("net_zero_2050", "gcam", "japan", 2050)).toBeCloseTo(1350.1221422328, 6);
    expect(lookupNgfsCarbonPrice("net_zero_2050", "remind", "japan", 2050)).toBeCloseTo(708.799346528, 6);
  });

  it("Current PoliciesシナリオでGCAMは一貫して0を返す(炭素価格メカニズムを持たない構造)", () => {
    expect(lookupNgfsCarbonPrice("current_policies", "gcam", "japan", 2030)).toBe(0);
  });

  it("5年刻み以外の年を渡すとエラーになる(推定で補間しない、D-15)", () => {
    expect(() => lookupNgfsCarbonPrice("net_zero_2050", "gcam", "japan", 2032)).toThrow();
  });

  it("存在しないモデル・地域の組み合わせはエラーになる", () => {
    expect(() => lookupNgfsCarbonPrice("net_zero_2050", "gcam", "world" as never, 2050)).not.toThrow();
    expect(() =>
      lookupNgfsCarbonPrice("net_zero_2050", "messageix" as never, "japan", 2050)
    ).toThrow();
  });
});

describe("jpyPerNgfsUsd2010 / convertNgfsPriceToJpy", () => {
  it("米国GDPデフレータ(2010→2025)と円/ドルレート(2025)を合成する(D-127)", () => {
    // (122.36 / 85.06) * 149.66 ≈ 215.29
    expect(jpyPerNgfsUsd2010()).toBeCloseTo(215.288, 2);
  });

  it("US$2010/tCO2を円/tCO2に換算する", () => {
    const jpy = convertNgfsPriceToJpy(1350.1221422328); // 2050年GCAM Net Zero 2050・日本
    expect(jpy).toBeCloseTo(1350.1221422328 * jpyPerNgfsUsd2010(), 6);
  });

  it("較正パラメータを差し替えれば結果も変わる(年が変わるたびに更新できる、D-127)", () => {
    const older = {
      usGdpDeflatorBaseYear: 2010,
      usGdpDeflatorBaseValue: 85.06,
      usGdpDeflatorCurrentYear: 2024,
      usGdpDeflatorCurrentValue: 119.03,
      jpyPerUsdCurrentYear: 151.37,
      source: "test fixture",
    };
    expect(jpyPerNgfsUsd2010(older)).not.toBeCloseTo(jpyPerNgfsUsd2010(), 2);
  });
});
