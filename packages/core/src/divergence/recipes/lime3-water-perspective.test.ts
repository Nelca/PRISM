/**
 * T-10a/T-07:LIME3 水消費の地理的視点(消費国・世界平均 vs 消費国・日本)の実データ検証。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1
 *
 * 期待値は**実装出力からのコピーではなく**、CSV の統合化 US$/m³ 列から独立に手計算した値で固定する
 * (エンジンは DALY/m³ × 統合化係数 × PPP の経路で計算しており、検算は別の公表列を使う)。
 */
import { describe, expect, it } from "vitest";
import { buildPairwiseDecompositionV2 } from "../pairwise-decomposition-v2";
import { createProductionRegistry } from "./registry";
import { DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2 } from "../diagnostics/baseline-water-case";
import {
  BASELINE_CALIBRATION,
  BASELINE_INPUT,
  buildLime3Record,
  buildWaterSubject,
  buildWaterSubjectWithSource,
  LIME3_GROUND_JAPAN,
  LIME3_GROUND_WORLD_AVERAGE,
  LIME3_SURFACE_JAPAN,
  LIME3_SURFACE_WORLD_AVERAGE,
} from "../diagnostics/water-case-fixtures";
import { LIME3_WATER_PERSPECTIVE_RECIPE, LIME3_WATER_PERSPECTIVE_RECIPE_ID } from "./lime3-water-perspective";
import { readLime3Column } from "./lime3-water-common";

const registry = createProductionRegistry();
const subject = buildWaterSubject();

/** 独立検算:公表されている統合化 US$/m³ 列の比。CSV の別列から計算しており、エンジン経路とは別式。 */
const EXPECTED_RATIO = LIME3_SURFACE_WORLD_AVERAGE.integratedUsdPerM3 / LIME3_SURFACE_JAPAN.integratedUsdPerM3;
/** 独立検算:円建ての両端。物理量 45,000 m³ × 統合化 US$/m³ × PPP 94.46。 */
const EXPECTED_V_A = BASELINE_INPUT.physicalQuantity * LIME3_SURFACE_WORLD_AVERAGE.integratedUsdPerM3 * BASELINE_CALIBRATION.pppValue;
const EXPECTED_V_B = BASELINE_INPUT.physicalQuantity * LIME3_SURFACE_JAPAN.integratedUsdPerM3 * BASELINE_CALIBRATION.pppValue;

function decompose(coefficientA = LIME3_SURFACE_WORLD_AVERAGE, coefficientB = LIME3_SURFACE_JAPAN) {
  return buildPairwiseDecompositionV2({
    recordA: buildLime3Record(coefficientA),
    recordB: buildLime3Record(coefficientB),
    subject,
    registry,
    versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
  });
}

describe("lime3-water-perspective(実データ・同一手法の内部変種)", () => {
  it("指示書 §7.2.1 の比 2.56623 を再現する(独立検算と一致)", () => {
    expect(EXPECTED_RATIO).toBeCloseTo(2.56623, 5);
    const result = decompose();
    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;

    expect(result.recipe.id).toBe(LIME3_WATER_PERSPECTIVE_RECIPE_ID);
    expect(result.mode).toBe("multiplicative");
    expect(result.kind).toBe("full");
    expect(result.valueA).toBeCloseTo(EXPECTED_V_A, 6);
    expect(result.valueB).toBeCloseTo(EXPECTED_V_B, 6);

    expect(result.contributions).toHaveLength(1);
    const [contribution] = result.contributions;
    expect(contribution.factorId).toBe("geographic_perspective");
    expect(contribution.category).toBe("geographic_model");
    expect(contribution.isZero).toBe(false);
    // 寄与倍率 = 統合化US$/m³ 列の比(独立検算)
    expect(contribution.displayMultiplier).toBeCloseTo(EXPECTED_RATIO, 9);
    expect(contribution.shapley).toBeCloseTo(Math.log(EXPECTED_RATIO), 12);
  });

  it("V* = V_A(完全分解)で残差はゼロ、効率性が成立する", () => {
    const result = decompose();
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    expect(result.vStar).toBe(result.valueA);
    expect(result.residual.value).toBeCloseTo(0, 12);
    expect(result.residual.displayMultiplier).toBeCloseTo(1, 12);
    expect(result.explainedSum).toBeCloseTo(result.totalDifference, 12);
    expect(result.residual.unclassified).toBe(false);
    // 全 v(S) は 2 件(v(∅) と v(F))。順序検証は |S| ≥ 2 でのみ走るため 0 件。
    expect(result.subsets.map((subset) => subset.subset)).toEqual([[], ["geographic_perspective"]]);
    expect(result.evaluationCount).toBe(2);
  });

  it("採用列の切替は DALY/m³・採用列マーカー・統合化係数を同じ列から一括で差し替える", () => {
    const result = decompose();
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    const swapped = result.subsets.find((subset) => subset.subset.length === 1)!.swapped;
    expect(swapped.map((entry) => entry.settingKey).sort()).toEqual(["daly_per_m3", "perspective_column", "usd_per_daly"]);
    for (const entry of swapped) {
      expect(entry.from.evidence.length).toBeGreaterThan(0);
      expect(entry.to.evidence.length).toBeGreaterThan(0);
    }
  });

  it("逆方向(A基準)の寄与は符号反転になる", () => {
    const result = decompose();
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    expect(result.reverse.defined).toBe(true);
    if (!result.reverse.defined) return;
    expect(result.reverse.contributions[0].shapley).toBeCloseTo(-result.contributions[0].shapley, 12);
  });

  it("地下水行でも同じ比 2.56623 になる(§7.2.1)", () => {
    const expected = LIME3_GROUND_WORLD_AVERAGE.integratedUsdPerM3 / LIME3_GROUND_JAPAN.integratedUsdPerM3;
    expect(expected).toBeCloseTo(2.56623, 5);
    const result = decompose(LIME3_GROUND_WORLD_AVERAGE, LIME3_GROUND_JAPAN);
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    expect(result.recipe.id).toBe(LIME3_WATER_PERSPECTIVE_RECIPE_ID);
    expect(result.contributions[0].displayMultiplier).toBeCloseTo(expected, 9);
    expect(result.residual.value).toBeCloseTo(0, 12);
  });

  it("同じ列どうしのペアは地理的視点の差として分解しない(本番の誤分解を防ぐ)", () => {
    // supports 単体では拒否する。
    const japan = buildLime3Record(LIME3_SURFACE_JAPAN).trace!;
    const check = LIME3_WATER_PERSPECTIVE_RECIPE.supports(japan, japan);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("trace_insufficient");
    expect(check.detail).toContain("消費国・世界平均");

    // レジストリは supports を通る別レシピ(エンドポイント配分)を選ぶため、
    // 「地理的視点の差」としては分解されない。
    const result = decompose(LIME3_SURFACE_JAPAN, LIME3_SURFACE_JAPAN);
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    expect(result.recipe.id).not.toBe(LIME3_WATER_PERSPECTIVE_RECIPE_ID);
    expect(result.contributions.every((contribution) => contribution.factorId !== "geographic_perspective")).toBe(true);
  });

  it("表層水と地下水のペアは比較対象の不一致で止まり、レシピに到達しない(T-03)", () => {
    const result = buildPairwiseDecompositionV2({
      recordA: buildLime3Record(LIME3_GROUND_JAPAN),
      recordB: buildLime3Record(LIME3_SURFACE_JAPAN),
      subject,
      subjectA: buildWaterSubjectWithSource("ground"),
      subjectB: buildWaterSubjectWithSource("surface"),
      registry,
      versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
    });
    expect(result.status).toBe("stopped");
    if (result.status !== "stopped") return;
    expect(result.reason).toBe("different_subject");
    expect(result.detail).toContain("水源種別");
    expect(result.implication.kind).toBe("not_comparable");
  });

  it("採用列はトレースの一次資料引用から読み取れる(推定していない)", () => {
    const world = buildLime3Record(LIME3_SURFACE_WORLD_AVERAGE).trace!;
    const japan = buildLime3Record(LIME3_SURFACE_JAPAN).trace!;
    expect(readLime3Column(world)).toEqual({ flowId: "001511000", perspective: "consumption_world_average" });
    expect(readLime3Column(japan)).toEqual({ flowId: "001511000", perspective: "consumption_japan" });
  });
});
