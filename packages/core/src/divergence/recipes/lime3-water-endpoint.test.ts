/**
 * T-04/T-07:LIME3 水消費のエンドポイント配分要因(ゼロ寄与公理の実データ検証)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1
 *
 * (a) 同一列どうしのペアでは配分率 1.0 → 1.0 の差し替えとなり、寄与も両端差も厳密に 0 になる。
 * (b) 表層水 vs 地下水は比較対象の不一致(`different_subject`)で止まり、このレシピに到達しない。
 */
import { describe, expect, it } from "vitest";
import { buildPairwiseDecompositionV2 } from "../pairwise-decomposition-v2";
import { createProductionRegistry } from "./registry";
import { DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2 } from "../diagnostics/baseline-water-case";
import {
  buildLime3Record,
  buildWaterSubject,
  buildWaterSubjectWithSource,
  LIME3_GROUND_JAPAN,
  LIME3_SURFACE_JAPAN,
} from "../diagnostics/water-case-fixtures";
import { LIME3_WATER_ENDPOINT_RECIPE, LIME3_WATER_ENDPOINT_RECIPE_ID } from "./lime3-water-endpoint";

const registry = createProductionRegistry();
const subject = buildWaterSubject();

describe("lime3-water-endpoint(エンドポイント配分のゼロ寄与)", () => {
  it("(a) 同一列ペアでは寄与も両端差も厳密に 0 になる", () => {
    const recordA = { ...buildLime3Record(LIME3_SURFACE_JAPAN), id: "vr-lime3-a" };
    const recordB = { ...buildLime3Record(LIME3_SURFACE_JAPAN), id: "vr-lime3-b" };
    const result = buildPairwiseDecompositionV2({
      recordA,
      recordB,
      subject,
      registry,
      versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
    });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.recipe.id).toBe(LIME3_WATER_ENDPOINT_RECIPE_ID);
    expect(result.kind).toBe("full");
    expect(result.mode).toBe("multiplicative");

    expect(result.valueA).toBe(result.valueB);
    expect(result.totalDifference).toBe(0);
    expect(result.contributions).toHaveLength(1);
    const [contribution] = result.contributions;
    expect(contribution.factorId).toBe("endpoint_allocation");
    expect(contribution.category).toBe("coverage_pathway");
    expect(contribution.shapley).toBe(0);
    expect(contribution.isZero).toBe(true);
    // 全体差ゼロのため寄与割合・残差比率は表示不能(捏造しない)。
    expect(contribution.shareRatio).toBeNull();
    expect(result.residual.value).toBe(0);
    expect(result.residual.ratio).toBeNull();
    expect(result.residual.ratioUnavailableReason).toBe("total_difference_within_tolerance");
    expect(result.residual.unclassified).toBe(false);
  });

  it("(a) 差し替えは配分率 1.0 → 1.0(CSV の他3エンドポイント列が空欄であることが根拠)", () => {
    const result = buildPairwiseDecompositionV2({
      recordA: { ...buildLime3Record(LIME3_SURFACE_JAPAN), id: "vr-lime3-a" },
      recordB: { ...buildLime3Record(LIME3_SURFACE_JAPAN), id: "vr-lime3-b" },
      subject,
      registry,
      versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
    });
    if (result.status !== "decomposed") throw new Error("分解されませんでした");
    const swapped = result.subsets.find((entry) => entry.subset.length === 1)!.swapped;
    expect(swapped).toHaveLength(1);
    expect(swapped[0].settingKey).toBe("endpoint_allocation_fraction");
    expect(swapped[0].from.value).toBe(1);
    expect(swapped[0].to.value).toBe(1);

    const evidence = LIME3_WATER_ENDPOINT_RECIPE.evidence.map((entry) => entry.note ?? "").join(" ");
    expect(evidence).toContain("100%人間健康");
  });

  it("(b) 表層水 vs 地下水は different_subject で止まり、レシピに到達しない(T-03 の負例)", () => {
    const result = buildPairwiseDecompositionV2({
      recordA: buildLime3Record(LIME3_SURFACE_JAPAN),
      recordB: buildLime3Record(LIME3_GROUND_JAPAN),
      subject,
      subjectA: buildWaterSubjectWithSource("surface"),
      subjectB: buildWaterSubjectWithSource("ground"),
      registry,
      versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
    });
    expect(result.status).toBe("stopped");
    if (result.status !== "stopped") return;
    expect(result.reason).toBe("different_subject");
    expect(result.subjectIdentity?.kind).toBe("different_subject");
    expect(result.detail).toContain("水源種別");
    // 金額差は診断値として残る(表層水・日本 vs 地下水・日本 は比 2.5833)。
    expect(result.diagnostics.absoluteDifference).not.toBeNull();
  });

  it("列が違うペアはこのレシピの対象外(supports が拒否する)", () => {
    const surface = buildLime3Record(LIME3_SURFACE_JAPAN).trace!;
    const ground = buildLime3Record(LIME3_GROUND_JAPAN).trace!;
    const check = LIME3_WATER_ENDPOINT_RECIPE.supports(surface, ground);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("trace_insufficient");
  });
});
