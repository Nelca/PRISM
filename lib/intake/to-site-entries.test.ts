/**
 * 取込データ → 拠点エントリの変換(GAP-02)。
 * **反映できなかった項目を黙って捨てないこと**が要点。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCompanyDataset } from "./load-company-dataset";
import { toSiteEntries } from "./to-site-entries";

const templateDir = path.resolve(import.meta.dirname, "templates");
const read = (file: string) => readFileSync(path.join(templateDir, file), "utf8");

function loadTemplates() {
  const result = loadCompanyDataset(
    read("sites.csv"),
    read("nature-interfaces.csv"),
    read("engagement-config.json")
  );
  expect(result.errors).toEqual([]);
  return result.dataset!;
}

describe("toSiteEntries", () => {
  it("CSV設定で未定の承認ラインは未定のまま保持する", () => {
    const dataset = loadTemplates();
    dataset.engagementConfig.approvalThreshold = "pending";
    const target = toSiteEntries(dataset).entries.find((entry) => entry.row.id === dataset.engagementConfig.deepDive.siteId)!;
    expect(target.deepDive.approvalThresholdValue).toBeNull();
  });
  it("記入例のテンプレート3ファイルから拠点エントリを組み立てられる", () => {
    const { entries } = toSiteEntries(loadTemplates());

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.row.id).toBeTruthy();
    }
  });

  it("深掘り対象の拠点には engagement-config.json の値が反映され、深掘りに昇格する", () => {
    const dataset = loadTemplates();
    const { entries } = toSiteEntries(dataset);

    const target = entries.find((e) => e.row.id === dataset.engagementConfig.deepDive.siteId)!;
    expect(target).toBeDefined();
    expect(target.deepDive.physicalQuantity).toBe(dataset.engagementConfig.deepDive.physicalQuantity);
    expect(target.deepDive.unit).toBe(dataset.engagementConfig.deepDive.unit);
    expect(target.deepDive.baselineNpvValue).toBe(dataset.engagementConfig.baselineNpv.value);
    expect(target.deepDive.forcePromote).toBe(true);
  });

  it("深掘り対象の拠点は engagement-config.json の割引率・評価期間を保持する(M6独自の割引率は設けない)", () => {
    const dataset = loadTemplates();
    const { entries } = toSiteEntries(dataset);

    const target = entries.find((e) => e.row.id === dataset.engagementConfig.deepDive.siteId)!;
    expect(target.deepDive.discountRate).toBe(dataset.engagementConfig.baselineNpv.discountRate);
    expect(target.deepDive.horizon).toBe(dataset.engagementConfig.baselineNpv.horizon);
  });

  it("深掘り対象でない拠点は優先度算定専用とし、架空の数量・投資前提を入れない(D-15)", () => {
    const dataset = loadTemplates();
    const { entries } = toSiteEntries(dataset);

    const others = entries.filter((e) => e.row.id !== dataset.engagementConfig.deepDive.siteId);
    expect(others.length).toBeGreaterThan(0);
    for (const entry of others) {
      expect(entry.deepDive).toMatchObject({
        forcePromote: false,
        screeningOnly: true,
        discountRate: null,
        horizon: null,
        investmentCostInitial: null,
        investmentCostRecurring: null,
        baselineNpvValue: null,
        approvalThresholdValue: null,
      });
    }
    const target = entries.find((e) => e.row.id === dataset.engagementConfig.deepDive.siteId)!;
    expect(target.deepDive.screeningOnly).toBeUndefined();
    expect(target.deepDive.physicalQuantity).toBeGreaterThan(0);
    expect(target.deepDive.unitReplacementCost).toBe(dataset.engagementConfig.methodConfig.unitReplacementCost);
  });

  it("反映できなかった項目を列挙する(黙って捨てない)", () => {
    const { unmappedFields } = toSiteEntries(loadTemplates());

    expect(unmappedFields.length).toBeGreaterThan(0);
    // 較正パラメータと手法別係数は、拠点別パラメータに置き場がないため未反映
    expect(unmappedFields.some((f) => f.includes("calibration"))).toBe(true);
    expect(unmappedFields.some((f) => f.includes("nature-interfaces.csv"))).toBe(true);
  });
});

describe("loadCompanyDataset の検証(取込UIが表示するエラー)", () => {
  it("site_idの相互参照が壊れていると、行を特定できるエラーを返す", () => {
    const brokenNature = read("nature-interfaces.csv").replace(/^site-/m, "site-does-not-exist-");
    const result = loadCompanyDataset(read("sites.csv"), brokenNature, read("engagement-config.json"));

    expect(result.dataset).toBeNull();
    expect(result.errors.some((e) => e.includes("sites.csvに存在しません"))).toBe(true);
  });

  it("1件でもエラーがあればデータセットを返さない(部分取込をしない)", () => {
    const result = loadCompanyDataset("", read("nature-interfaces.csv"), read("engagement-config.json"));

    expect(result.dataset).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
