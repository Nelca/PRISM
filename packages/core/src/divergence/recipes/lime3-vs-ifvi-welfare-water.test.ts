/**
 * T-11:LIME3 水消費 × IFVI 厚生価値内訳(手法間・部分分解)の実データ検証。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md T-11
 *
 * 期待値は実装出力からのコピーではなく、公表係数からの手計算で固定する。
 *   LIME3(表層水・日本): 45,000 m³ × 0.0135886259 US$/m³ × 94.46 = 57,761.172113 円
 *   VFes:                45,000 m³ × 2.97 US$/m³ × 94.46 = 12,624,579 円
 *   VFnutrition / VFdisease: 公表値 0.00(Appendix D Table D1、日本)
 */
import { describe, expect, it } from "vitest";
import { buildPairwiseDecompositionV2 } from "../pairwise-decomposition-v2";
import { createProductionRegistry } from "./registry";
import { DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2 } from "../diagnostics/baseline-water-case";
import { buildWaterRecords, buildWaterSubject } from "../diagnostics/water-case-fixtures";
import { comparePathways } from "../comparability";
import { LIME3_VS_IFVI_WELFARE_WATER_RECIPE_ID } from "./lime3-vs-ifvi-welfare-water";
import type { ValuationRecord } from "../../types/valuation";

const registry = createProductionRegistry();
const subject = buildWaterSubject();
const records = buildWaterRecords();

/** 独立検算(手計算)。 */
const LIME3_JPY = 45_000 * 0.0135886259 * 94.46;
const VFES_JPY = 45_000 * 2.97 * 94.46;

function record(methodId: string): ValuationRecord {
  const found = records.find((candidate) => candidate.methodId === methodId);
  if (!found) throw new Error(`${methodId} のレコードがありません`);
  return found;
}

function decompose(ifviMethodId: string) {
  return buildPairwiseDecompositionV2({
    recordA: record(ifviMethodId),
    recordB: record("lime3-water"),
    subject,
    registry,
    versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
  });
}

describe("lime3-vs-ifvi-welfare-water(手法間・部分分解)", () => {
  it("手計算値を再現する(LIME3 57,761.17 円 / VFes 12,624,579 円)", () => {
    expect(LIME3_JPY).toBeCloseTo(57_761.172113, 6);
    expect(VFES_JPY).toBe(12_624_579);
    expect(Number(record("lime3-water").centralValue)).toBeCloseTo(LIME3_JPY, 6);
    expect(Number(record("ifvi-water-consumption.VFes").centralValue)).toBeCloseTo(VFES_JPY, 6);
  });

  it("LIME3 vs VFes は乗法・部分分解になり、地理較正の寄与はゼロ、残差が全体差を占める", () => {
    const result = decompose("ifvi-water-consumption.VFes");
    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;

    expect(result.recipe.id).toBe(LIME3_VS_IFVI_WELFARE_WATER_RECIPE_ID);
    // A/B の向きはレシピ(A=IFVI、B=LIME3)へ揃う。
    expect(result.methodIdA).toBe("ifvi-water-consumption.VFes");
    expect(result.methodIdB).toBe("lime3-water");
    expect(result.mode).toBe("multiplicative");
    expect(result.kind).toBe("partial");
    expect(result.valueA).toBeCloseTo(VFES_JPY, 6);
    expect(result.valueB).toBeCloseTo(LIME3_JPY, 6);

    // ゼロ寄与公理:両手法が同一の地理較正記録を共有しているため寄与は厳密に 0。
    expect(result.contributions).toHaveLength(1);
    const [contribution] = result.contributions;
    expect(contribution.factorId).toBe("geographic_calibration");
    expect(contribution.category).toBe("geographic_model");
    expect(contribution.shapley).toBe(0);
    expect(contribution.isZero).toBe(true);

    // V* = V_B(何も動かない)。残差 r = ln(V_A / V_B) が全体差そのもの。
    expect(result.vStar).toBeCloseTo(LIME3_JPY, 6);
    expect(result.totalDifference).toBeCloseTo(Math.log(VFES_JPY / LIME3_JPY), 9);
    expect(result.explainedSum).toBe(0);
    expect(result.residual.value).toBeCloseTo(Math.log(VFES_JPY / LIME3_JPY), 9);
    expect(result.residual.displayMultiplier).toBeCloseTo(VFES_JPY / LIME3_JPY, 6);
    // 全体差は非ゼロ・寄与ゼロなので残差比率は 1.0(仕様どおりに計算した値)。
    expect(result.residual.ratio).toBeCloseTo(1, 12);

    expect(result.residual.knownUnquantified.length).toBeGreaterThanOrEqual(3);
    expect(result.residual.unclassified).toBe(false);
    expect(result.residual.nextActions.length).toBeGreaterThanOrEqual(3);
    expect(result.implication.kind).toBe("additional_investigation");
    // 部分分解では逆方向を定義しない(固定した基礎モデルが非対称)。
    expect(result.reverse.defined).toBe(false);
  });

  it("LIME3 vs VFnutrition(公表0)は加法になり、ゼロ意味 published_zero を保持する", () => {
    const result = decompose("ifvi-water-consumption.VFnutrition");
    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;

    expect(result.mode).toBe("additive");
    expect(result.valueA).toBe(0);
    expect(result.valueB).toBeCloseTo(LIME3_JPY, 6);
    expect(result.zeroMeaningA?.code).toBe("published_zero");
    expect(result.zeroMeaningA?.candidates).toContain("computed_zero");

    const [contribution] = result.contributions;
    expect(contribution.factorId).toBe("geographic_calibration");
    // 0 × 何を掛けても 0。地理較正の差し替えでは 0 は動かない。
    expect(contribution.shapley).toBe(0);
    expect(contribution.displayAmount).toBe(0);
    expect(result.vStar).toBeCloseTo(LIME3_JPY, 6);
    expect(result.totalDifference).toBeCloseTo(0 - LIME3_JPY, 6);
    expect(result.residual.value).toBeCloseTo(0 - LIME3_JPY, 6);
    expect(result.residual.ratio).toBeCloseTo(1, 12);
    expect(result.residual.unclassified).toBe(false);
  });

  it("LIME3 vs VFdisease(公表0)も同じ扱いになる", () => {
    const result = decompose("ifvi-water-consumption.VFdisease");
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    expect(result.mode).toBe("additive");
    expect(result.valueA).toBe(0);
    expect(result.zeroMeaningA?.code).toBe("published_zero");
    expect(result.residual.value).toBeCloseTo(0 - LIME3_JPY, 6);
  });

  it("固定差は被覆経路・価値評価技法・基礎モデル/データ・価格年を含み、金額を割り当てない", () => {
    const result = decompose("ifvi-water-consumption.VFes");
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    const categories = new Set(result.residual.knownUnquantified.map((difference) => difference.category));
    expect(categories).toContain("coverage_pathway");
    expect(categories).toContain("valuation_technique");
    expect(categories).toContain("underlying_model_data");
    expect(categories).toContain("normalization");
    for (const difference of result.residual.knownUnquantified) {
      expect(difference.evidence.length).toBeGreaterThan(0);
      // KnownDifference は金額フィールドを持たない(§6.4)。
      expect(Object.keys(difference)).not.toContain("amount");
    }
    // 拠点補正(Eq.3-5)の未実装は取得アクション付きで残る。
    expect(result.residual.nextActions.some((action) => action.item.includes("Eq.3-5"))).toBe(true);
    expect(result.residual.nextActions.every((action) => action.gate === "H-02")).toBe(true);
  });

  it("経路差の記述は comparePathways の結果と整合する", () => {
    const lime3 = record("lime3-water").trace!;
    const vfes = record("ifvi-water-consumption.VFes").trace!;
    const comparison = comparePathways(vfes.pathway, lime3.pathway);
    // IFVI 側の pressure / midpoint は一次資料から特定できず unmapped のまま。
    expect(comparison.kind).toBe("unmapped");
    if (comparison.kind !== "unmapped") return;
    expect(comparison.unmappedSide).toBe("A");
  });

  it("VFaccess(交換価値)はこのレシピの対象にしない", () => {
    const result = buildPairwiseDecompositionV2({
      recordA: record("ifvi-water-consumption.VFaccess"),
      recordB: record("lime3-water"),
      subject,
      registry,
      versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
    });
    expect(result.status).toBe("stopped");
    if (result.status !== "stopped") return;
    // 価値概念の違いが先に効く(交換価値 vs 厚生価値)。
    expect(result.reason).toBe("value_concept_mismatch");
  });
});
