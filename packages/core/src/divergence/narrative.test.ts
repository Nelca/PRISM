import { describe, expect, it } from "vitest";
import { applyF9DisplayRule, buildNarrative } from "./narrative";
import type { FactorContribution } from "../types/divergence";

function contribution(overrides: Partial<FactorContribution> & Pick<FactorContribution, "factor">): FactorContribution {
  return {
    logContribution: 0,
    multiplier: 1,
    shareRatio: null,
    status: "decomposed",
    ...overrides,
  };
}

describe("applyF9DisplayRule", () => {
  it("符号が全て一致する場合は通常通り寄与割合を計算する", () => {
    const contributions: FactorContribution[] = [
      contribution({ factor: "endpointCoverage", logContribution: Math.log(2.1), multiplier: 2.1 }),
      contribution({ factor: "discountRate", logContribution: Math.log(1.15), multiplier: 1.15 }),
      contribution({ factor: "geographicCalibration", logContribution: Math.log(1.1), multiplier: 1.1 }),
    ];

    const result = applyF9DisplayRule(contributions);
    const endpoint = result.find((c) => c.factor === "endpointCoverage")!;
    expect(endpoint.shareRatio).not.toBeNull();
    expect(endpoint.shareRatio!).toBeGreaterThan(0.7);
    expect(endpoint.shareRatio!).toBeLessThan(0.8);
  });

  it("寄与の符号が合計と逆の場合、全項目でshareRatioをnullにする(F-9)", () => {
    // 合計は正だが、1要因だけ負(相殺)
    const contributions: FactorContribution[] = [
      contribution({ factor: "endpointCoverage", logContribution: Math.log(3), multiplier: 3 }),
      contribution({ factor: "discountRate", logContribution: -Math.log(1.2), multiplier: 1 / 1.2 }),
    ];

    const result = applyF9DisplayRule(contributions);
    expect(result.every((c) => c.shareRatio === null)).toBe(true);
  });

  it("not_recalculableな要因は常にshareRatioがnull", () => {
    const contributions: FactorContribution[] = [
      contribution({ factor: "endpointCoverage", logContribution: Math.log(2), multiplier: 2 }),
      contribution({ factor: "discountRate", status: "not_recalculable", exclusionReason: "test" }),
    ];

    const result = applyF9DisplayRule(contributions);
    const discount = result.find((c) => c.factor === "discountRate")!;
    expect(discount.shareRatio).toBeNull();
  });
});

describe("buildNarrative", () => {
  it("not_decomposedの場合はshortCircuitReasonをそのまま返す", () => {
    const narrative = buildNarrative({
      methodIdA: "A",
      methodIdB: "B",
      mode: "not_decomposed",
      shortCircuitReason: "符号乖離のため分解しません。",
      ratio: null,
      contributions: [],
      residual: null,
    });
    expect(narrative).toBe("符号乖離のため分解しません。");
  });

  it("multiplicativeモードで要因分解と残差を含む文章を生成する", () => {
    const contributions: FactorContribution[] = applyF9DisplayRule([
      contribution({ factor: "geographicCalibration", logContribution: Math.log(1.1), multiplier: 1.1 }),
    ]);

    const narrative = buildNarrative({
      methodIdA: "ifvi-water-consumption.VFes",
      methodIdB: "lime3-water",
      mode: "multiplicative",
      ratio: 2.67,
      contributions: [
        ...contributions,
        contribution({
          factor: "endpointCoverage",
          status: "not_recalculable",
          exclusionReason: "AoP不一致のため再計算不能",
        }),
      ],
      residual: { multiplier: 1.5 },
    });

    expect(narrative).toContain("2.67倍");
    expect(narrative).toContain("地理較正");
    expect(narrative).toContain("分解不能");
    expect(narrative).toContain("残差");
  });

  it("全要因がゼロ寄与/分解不能の場合(§7.3.1)、100%残差である旨を明示する", () => {
    const narrative = buildNarrative({
      methodIdA: "ifvi-water-consumption.VFnutrition",
      methodIdB: "lime3-water",
      mode: "multiplicative",
      ratio: 1.3,
      contributions: [],
      residual: { multiplier: 1.3 },
    });

    expect(narrative).toContain("説明されない残差");
  });
});
