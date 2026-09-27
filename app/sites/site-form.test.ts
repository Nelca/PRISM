import { describe, expect, it } from "vitest";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import { parseSiteForm } from "./site-form";

function baseForm() {
  const form = new FormData();
  form.set("name", "東京工場");
  form.set("siteType", "own_site");
  form.set("industrySector", "chemicals");
  form.set("locationKind", "coordinates");
  form.set("lat", "35");
  form.set("lng", "139");
  for (const [key, value] of Object.entries({ physicalQuantity: 10000, unitReplacementCost: 500, investmentCostInitial: 20000000, investmentCostRecurring: 0, baselineNpvValue: 500000000 })) form.set(key, String(value));
  return form;
}

describe("site form", () => {
  it("必須数値の空欄をデモ値で補完しない", () => {
    for (const field of ["physicalQuantity", "unitReplacementCost"]) {
      const form = baseForm();
      form.set(field, "");
      expect(parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");
    }
  });
  it("投資の前提がなくても環境データを登録でき、未入力をnullで保持する", () => {
    const form = baseForm();
    for (const field of ["investmentCostInitial", "investmentCostRecurring", "baselineNpvValue"]) form.delete(field);
    expect(parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS)).toMatchObject({ deepDive: { investmentCostInitial: null, investmentCostRecurring: null, baselineNpvValue: null } });
  });
  it("割引率・評価期間の空欄はnullで保持し、業界標準値で埋めない(M6独自の割引率は設けない)", () => {
    const parsed = parseSiteForm(baseForm(), DEFAULT_DEEP_DIVE_PARAMS);
    expect(parsed).toMatchObject({ deepDive: { discountRate: null, horizon: null } });
  });
  it("割引率・評価期間の有効な入力を数値として保存する", () => {
    const form = baseForm();
    form.set("discountRate", "0.08");
    form.set("horizon", "7");
    const parsed = parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS);
    expect(parsed).toMatchObject({ deepDive: { discountRate: 0.08, horizon: 7 } });
  });
  it("割引率が1を超える値・評価期間が0または整数でない値を拒否する", () => {
    const overRate = baseForm();
    overRate.set("discountRate", "6");
    expect(parseSiteForm(overRate, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");

    const zeroHorizon = baseForm();
    zeroHorizon.set("horizon", "0");
    expect(parseSiteForm(zeroHorizon, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");

    const fractionalHorizon = baseForm();
    fractionalHorizon.set("horizon", "2.5");
    expect(parseSiteForm(fractionalHorizon, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");
  });
  it("承認ラインの空欄は未定、0は明示的な値として保存する", () => {
    const form = baseForm();
    expect(parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS)).toMatchObject({ deepDive: { approvalThresholdValue: null, investmentCostRecurring: 0 } });
    form.set("approvalThresholdValue", "0");
    expect(parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS)).toMatchObject({ deepDive: { approvalThresholdValue: 0 } });
  });
  it("有効な座標入力をドメイン入力へ変換する", () => {
    const parsed = parseSiteForm(baseForm(), DEFAULT_DEEP_DIVE_PARAMS);
    expect(parsed).toMatchObject({ row: { name: "東京工場", lat: 35, lng: 139 } });
  });

  it("座標範囲と非有限な詳細値を拒否する", () => {
    const invalidLat = baseForm();
    invalidLat.set("lat", "91");
    expect(parseSiteForm(invalidLat, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");

    const invalidQuantity = baseForm();
    invalidQuantity.set("physicalQuantity", "Infinity");
    expect(parseSiteForm(invalidQuantity, DEFAULT_DEEP_DIVE_PARAMS)).toHaveProperty("error");
  });

  it("GHG排出量を選ぶと気候カテゴリと単位を保存する", () => {
    const form = baseForm();
    form.set("category", "climate");
    form.set("physicalQuantity", "8000");
    form.set("unit", "tCO2e");
    const parsed = parseSiteForm(form, DEFAULT_DEEP_DIVE_PARAMS);
    expect(parsed).toMatchObject({ deepDive: { category: "climate", physicalQuantity: 8000, unit: "tCO2e" } });
  });
});
