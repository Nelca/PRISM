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
  it("記入例のテンプレート3ファイルから拠点エントリを組み立てられる", () => {
    const { entries } = toSiteEntries(loadTemplates());

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.row.id).toBeTruthy();
      expect(entry.deepDive.physicalQuantity).toBeGreaterThan(0);
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

  it("深掘り対象でない拠点は既定値になる(顧客の実値ではないことを区別できる)", () => {
    const dataset = loadTemplates();
    const { entries } = toSiteEntries(dataset);

    const others = entries.filter((e) => e.row.id !== dataset.engagementConfig.deepDive.siteId);
    for (const entry of others) {
      expect(entry.deepDive.forcePromote).toBe(false);
    }
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
