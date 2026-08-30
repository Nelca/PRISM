import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLime3ValueFactor, loadLime3CoefficientTable } from "./loader";

const csv = readFileSync(resolve("docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv"), "utf8");

describe("LIME3 coefficient loader", () => {
  it("loads all 980 source flows and preserves the audited source hash", () => {
    const table = loadLime3CoefficientTable(csv);
    expect(table.rows).toHaveLength(980);
    expect(table.sourceHash).toBe("63e1744476fc33fb741e176bcea94f0e9dbd5c757a48e9aa620f70d22a959844");
  });

  it("selects the production-country Japan integrated column explicitly", () => {
    const table = loadLime3CoefficientTable(csv);
    const nox = table.rows.find((row) => row.sourceFlowId === "002118010")!;
    const factor = buildLime3ValueFactor(nox, table.sourceHash, "lime3-pollution");
    expect(factor.valuePerUnit).toBe(2.19651631);
    expect(factor.currency).toBe("USD");
    expect(factor.priceYear).toBeNull();
    expect(factor.sourceRegion).toBe("JP");
    expect(factor.licenseValidUntil).toBe("2027-06-30");
  });

  it("does not coerce blank NH3 or forest-occupation coefficients to zero", () => {
    const table = loadLime3CoefficientTable(csv);
    for (const id of ["002169", "008107"]) {
      const row = table.rows.find((candidate) => candidate.sourceFlowId === id)!;
      expect(row.productionJapanIntegratedUsd).toBeUndefined();
      expect(() => buildLime3ValueFactor(row, table.sourceHash, "test")).toThrow("係数は空欄");
    }
  });

  it("rejects malformed rows and duplicate flow ids", () => {
    const header = "基本フローコード,基本フロー名,分類1/分類2,評価領域,利子率2%、生産国、日本 / 統合化 / US$";
    expect(() => loadLime3CoefficientTable(`${header}\n001,x,排出/大気,kg,abc`)).toThrow("数値ではありません");
    expect(() => loadLime3CoefficientTable(`${header}\n001,x,排出/大気,kg,1\n001,y,排出/大気,kg,2`)).toThrow("重複");
  });
});
