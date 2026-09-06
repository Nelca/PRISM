/**
 * T-11:代替費用法 × IFVI VFaccess(交換価値)の停止例。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §3.3・T-11
 *
 * 数値化できる要因を1つも作れないため `no_numerizable_factors` で止まる。金額差(0 − 27,900,000 円)は
 * 診断値として残り、「何が違うか」「何を取得すれば再計算できるか」を定性差異と次アクションで返す。
 */
import { describe, expect, it } from "vitest";
import { buildPairwiseDecompositionV2 } from "../pairwise-decomposition-v2";
import { createProductionRegistry } from "./registry";
import { DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2 } from "../diagnostics/baseline-water-case";
import { buildWaterRecords, buildWaterSubject } from "../diagnostics/water-case-fixtures";
import { REPLACEMENT_COST_VS_VFACCESS_RECIPE_ID } from "./replacement-cost-vs-vfaccess";

const registry = createProductionRegistry();
const subject = buildWaterSubject();
const records = buildWaterRecords();

/** 独立検算(手計算):45,000 m³ × 620 円/m³(地理較正なし、D-127・D-128)。 */
const REPLACEMENT_COST_JPY = 45_000 * 620;

function decompose() {
  return buildPairwiseDecompositionV2({
    recordA: records.find((record) => record.methodId === "ifvi-water-consumption.VFaccess")!,
    recordB: records.find((record) => record.methodId === "replacement-cost")!,
    subject,
    registry,
    versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
  });
}

describe("replacement-cost-vs-vfaccess(反実仮想不能で停止する実例)", () => {
  it("no_numerizable_factors で停止し、金額差は診断値として残る", () => {
    expect(REPLACEMENT_COST_JPY).toBe(27_900_000);
    const result = decompose();
    expect(result.status).toBe("stopped");
    if (result.status !== "stopped") return;

    expect(result.recipe?.id).toBe(REPLACEMENT_COST_VS_VFACCESS_RECIPE_ID);
    expect(result.reason).toBe("no_numerizable_factors");
    expect(result.valueA).toBe(0);
    expect(result.valueB).toBe(REPLACEMENT_COST_JPY);
    expect(result.diagnostics.absoluteDifference).toBe(0 - REPLACEMENT_COST_JPY);
    expect(result.valueConcept).toBe("exchange");
    expect(result.zeroMeaningA?.code).toBe("published_zero");
  });

  it("停止理由に、時間モデルと地理較正のそれぞれの理由が残る", () => {
    const result = decompose();
    if (result.status !== "stopped") throw new Error("停止しませんでした");
    expect(result.detail).toContain("time_model");
    expect(result.detail).toContain("geographic_calibration");
  });

  it("定性差異(時間モデル・価値評価技法・被覆・拠点補正)と次アクションを返す", () => {
    const result = decompose();
    if (result.status !== "stopped") throw new Error("停止しませんでした");
    const categories = result.qualitativeDifferences.map((difference) => difference.category);
    expect(categories).toContain("time_model");
    expect(categories).toContain("valuation_technique");
    expect(categories).toContain("coverage_pathway");
    expect(result.qualitativeDifferences.some((difference) => difference.description.includes("Eq.3-5"))).toBe(true);
    // 反実仮想を定義できなかった要因も、除外理由付きで定性差異へ現れる。
    expect(result.qualitativeDifferences.some((difference) => difference.description.includes("time_model"))).toBe(true);

    expect(result.missingData.some((action) => action.item.includes("損害時間列"))).toBe(true);
    expect(result.missingData.every((action) => action.gate === "H-02")).toBe(true);
    expect(result.nextActions).toEqual(result.missingData);
    expect(result.implication.kind).toBe("additional_investigation");
  });

  it("定性差異へ金額を割り当てない", () => {
    const result = decompose();
    if (result.status !== "stopped") throw new Error("停止しませんでした");
    for (const difference of result.qualitativeDifferences) {
      expect(Object.keys(difference)).not.toContain("amount");
      expect(difference.evidence.length).toBeGreaterThan(0);
    }
  });
});
