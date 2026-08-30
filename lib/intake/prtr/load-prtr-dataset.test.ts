import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPrtrDataset } from "./load-prtr-dataset";
import type { PrtrSourceFile } from "./types";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const quoted = (values: string[]): string => values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
const file = (name: string, rows: string[][]): PrtrSourceFile => ({ name, bytes: bytes(rows.map(quoted).join("\r\n")) });

function honshiRow(facilityId: string, year = "2024"): string[] {
  const row = Array.from({ length: 23 }, () => "");
  row[0] = facilityId;
  row[1] = year;
  row[4] = "Example Corporation";
  row[13] = "Example Plant";
  row[16] = "Aichi";
  row[17] = "Nagoya";
  return row;
}

function besshiRow(facilityId: string, overrides: Partial<Record<number, string>> = {}): string[] {
  const row = Array.from({ length: 41 }, () => "2");
  row[0] = facilityId;
  row[1] = "1";
  row[2] = "Test substance";
  row[3] = "438";
  row[4] = "1";
  row[5] = "6";
  row[6] = "0";
  row[7] = "";
  row[8] = "";
  row[9] = "0";
  row[13] = "1";
  row[14] = "";
  row[15] = "2";
  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) row[Number(index)] = value;
  }
  return row;
}

function validInput(): {
  honshi: PrtrSourceFile;
  besshi: PrtrSourceFile;
  otherIndustries: PrtrSourceFile;
  facilityCrosswalk: PrtrSourceFile;
  reportingYear: number;
  prtrListVersion: string;
  validSiteIds: Set<string>;
} {
  return {
    honshi: file("本紙.txt", [honshiRow("FAC-1"), honshiRow("FAC-OUT")]),
    besshi: file("別紙.txt", [besshiRow("FAC-1"), besshiRow("FAC-OUT")]),
    otherIndustries: file("他業種.txt", [["FAC-1", "Secondary", "9999"]]),
    facilityCrosswalk: file("facility-crosswalk.csv", [
      ["reporting_year", "facility_id", "site_id"],
      ["2024", "FAC-1", "site-042"],
    ]),
    reportingYear: 2024,
    prtrListVersion: "2023-515",
    validSiteIds: new Set(["site-042"]),
  };
}

describe("PRTR公式ファイル取込", () => {
  it("配布用CP932サンプル4ファイルをそのまま取り込める", () => {
    const sampleDir = path.resolve(import.meta.dirname, "samples");
    const sampleFile = (name: string): PrtrSourceFile => ({ name, bytes: readFileSync(path.join(sampleDir, name)) });
    const result = loadPrtrDataset({
      honshi: sampleFile("honshi.txt"),
      besshi: sampleFile("besshi.txt"),
      otherIndustries: sampleFile("other-industries.txt"),
      facilityCrosswalk: sampleFile("facility-crosswalk.csv"),
      reportingYear: 2023,
      prtrListVersion: "2023",
      validSiteIds: new Set(["site-042"]),
      sourceKind: "demo_sample",
    });

    expect(result.errors).toEqual([]);
    expect(result.batch?.records).toHaveLength(6);
    expect(result.batch?.sourceKind).toBe("demo_sample");
    expect(result.batch?.records.find((record) => record.releaseMedium === "air")?.quantityKg).toBe(120);
    expect(result.batch?.records.find((record) => record.releaseMedium === "offsite_waste")?.quantityKg).toBe(1_000);
    expect(result.batch?.records.find((record) => record.releaseMedium === "soil")?.measurementStatus).toBe("not_reported");
  });

  it("crosswalkで選択した事業所だけを媒体別の長形式へ正規化する", () => {
    const result = loadPrtrDataset(validInput());
    expect(result.errors).toEqual([]);
    expect(result.batch).not.toBeNull();
    const batch = result.batch!;

    expect(batch.records).toHaveLength(6);
    expect(new Set(batch.records.map((record) => record.siteId))).toEqual(new Set(["site-042"]));
    expect(batch.records.map((record) => record.releaseMedium)).toEqual([
      "air",
      "public_water",
      "soil",
      "onsite_landfill",
      "sewer",
      "offsite_waste",
    ]);
    expect(batch.records.find((record) => record.releaseMedium === "air")?.quantityKg).toBe(6);
    expect(batch.records.find((record) => record.releaseMedium === "public_water")?.quantityKg).toBe(0);
    expect(batch.records.find((record) => record.releaseMedium === "soil")).toMatchObject({
      quantityKg: null,
      measurementStatus: "not_reported",
    });
    expect(batch.records.filter((record) => record.calculationEligibility === "transfer_only")).toHaveLength(2);
    expect(batch.sourceManifest).toHaveLength(4);
    expect(batch.sourceManifest.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
  });

  it("mg-TEQをkg-TEQ相当へ換算し、元単位と元数量も保持する", () => {
    const input = validInput();
    input.besshi = file("別紙.txt", [besshiRow("FAC-1", { 4: "2", 5: "1.6" })]);
    const result = loadPrtrDataset(input);
    const air = result.batch?.records.find((record) => record.releaseMedium === "air");
    expect(air).toMatchObject({ originalQuantity: 1.6, originalUnit: "mg-TEQ" });
    expect(air?.quantityKg).toBeCloseTo(0.0000016, 15);
  });

  it("全エラーを行番号付きで返し、部分的なbatchを返さない", () => {
    const input = validInput();
    input.besshi = file("別紙.txt", [besshiRow("FAC-1", { 5: "-1" }), besshiRow("MISSING")]);
    input.facilityCrosswalk = file("facility-crosswalk.csv", [
      ["reporting_year", "facility_id", "site_id"],
      ["2025", "FAC-1", "unknown-site"],
      ["2025", "FAC-1", "unknown-site"],
    ]);

    const result = loadPrtrDataset(input);
    expect(result.batch).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
    expect(result.errors.some((error) => error.includes("別紙.txt 1行目") && error.includes("0以上"))).toBe(true);
    expect(result.errors.some((error) => error.includes("別紙.txt 2行目") && error.includes("本紙にありません"))).toBe(true);
    expect(result.errors.some((error) => error.includes("重複"))).toBe(true);
    expect(result.errors.some((error) => error.includes("登録拠点ではありません"))).toBe(true);
  });

  it("公式列数と引用符の破損を拒否する", () => {
    const input = validInput();
    input.honshi = { name: "本紙.txt", bytes: bytes('"FAC-1","2024') };
    const result = loadPrtrDataset(input);
    expect(result.batch).toBeNull();
    expect(result.errors.some((error) => error.includes("引用符が閉じられていません"))).toBe(true);
    expect(result.errors.some((error) => error.includes("23列"))).toBe(true);
  });
});
