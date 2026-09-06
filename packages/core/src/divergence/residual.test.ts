import { describe, expect, it } from "vitest";
import { buildResidual, excludedFactorsAsKnownDifferences } from "./residual";
import type { ExcludedFactor } from "./counterfactual";
import type { KnownDifference } from "../types/recipe";

const EVIDENCE = [{ source: "テスト", tier: "primary" as const }];

const FIXED_DIFFERENCE: KnownDifference = {
  category: "underlying_model_data",
  description: "損害関数が異なるが、反実仮想の式を定義できない。",
  sideA: "A の損害関数",
  sideB: "B の損害関数",
  evidence: EVIDENCE,
  acquisitionAction: { item: "損害関数の公開式", candidateSource: "方法論文書", enablesRecalculation: true },
};

const EXCLUDED: ExcludedFactor = {
  factorId: "epsilon",
  category: "underlying_model_data",
  label: "疫学モデルε",
  reason: "設定キーが存在しません。",
  reasonKind: "swap_failed",
  missingData: [{ item: "疫学モデルεの係数", candidateSource: "一次論文", enablesRecalculation: true }],
  evidence: EVIDENCE,
};

const PARTIAL = { decompositionKind: "partial" as const, fixedDifferences: [] };

describe("buildResidual(§6.2 契約表・§6.4)", () => {
  it("加法: R = V_A − V*、残差比率 = R/(V_A − V_B)", () => {
    // 指示書 §6.2 の数値例: V_B=100、V*=120、V_A=150 → 寄与合計20・残差30
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 120,
      contributions: [12, 8],
      recipe: PARTIAL,
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.value).toBe(30);
    expect(result.residual.ratio).toBeCloseTo(30 / 50, 12);
    expect(result.residual.displayMultiplier).toBeNull();
    // 寄与合計 20 + 残差 30 = 全体差 50 を復元する
    expect(12 + 8 + result.residual.value).toBe(150 - 100);
  });

  it("乗法: r = ln V_A − ln V*、残差比率 = r/(ln V_A − ln V_B)", () => {
    const result = buildResidual({
      mode: "multiplicative",
      valueA: 8,
      valueB: 1,
      vStar: 4,
      contributions: [Math.log(2), Math.log(2)],
      recipe: PARTIAL,
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.value).toBeCloseTo(Math.log(2), 12);
    expect(result.residual.displayMultiplier).toBeCloseTo(2, 12);
    expect(result.residual.ratio).toBeCloseTo(Math.log(2) / Math.log(8), 12);
  });

  it("全体差が許容誤差内で0なら残差比率を null にする(相殺を保持し割合を表示しない)", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 0,
      valueB: 0,
      vStar: 0,
      contributions: [5, -5],
      recipe: PARTIAL,
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.value).toBe(0);
    expect(result.residual.ratio).toBeNull();
    expect(result.residual.ratioUnavailableReason).toBe("total_difference_within_tolerance");
  });

  it("寄与・残差の非ゼロ項に正負が混在すれば残差比率を null にする", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 180,
      contributions: [100, -20],
      recipe: PARTIAL,
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.value).toBe(-30);
    expect(result.residual.ratio).toBeNull();
    expect(result.residual.ratioUnavailableReason).toBe("mixed_signs");
  });

  it("完全分解で V* ≠ V_A なら停止する(自動で部分分解へ変えない)", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 120,
      contributions: [20],
      recipe: { decompositionKind: "full", fixedDifferences: [] },
      excludedFactors: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("full_decomposition_endpoint_mismatch");
  });

  it("完全分解で V* = V_A なら残差はゼロで通過する", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 150,
      contributions: [30, 20],
      recipe: { decompositionKind: "full", fixedDifferences: [] },
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.value).toBe(0);
    expect(result.residual.unclassified).toBe(false);
  });

  it("既知の固定差異と除外要因を knownUnquantified へ構造化し、金額を割り当てない", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 120,
      contributions: [20],
      recipe: { decompositionKind: "partial", fixedDifferences: [FIXED_DIFFERENCE] },
      excludedFactors: [EXCLUDED],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.knownUnquantified).toHaveLength(2);
    expect(result.residual.unclassified).toBe(false);
    expect(JSON.stringify(result.residual.knownUnquantified)).not.toContain('"amount"');
    // 次アクションは重複排除して集約する
    expect(result.residual.nextActions).toHaveLength(2);
    expect(result.residual.nextActions.map((action) => action.item)).toEqual(["損害関数の公開式", "疫学モデルεの係数"]);
  });

  it("非ゼロ残差があり候補理由も無ければ unclassified を立てる", () => {
    const result = buildResidual({
      mode: "additive",
      valueA: 150,
      valueB: 100,
      vStar: 120,
      contributions: [20],
      recipe: PARTIAL,
      excludedFactors: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.residual.unclassified).toBe(true);
    expect(result.residual.nextActions).toEqual([]);
  });
});

describe("excludedFactorsAsKnownDifferences", () => {
  it("除外理由と不足データを引き継ぐ(金額は持たせない)", () => {
    const [difference] = excludedFactorsAsKnownDifferences([EXCLUDED]);
    expect(difference.category).toBe("underlying_model_data");
    expect(difference.description).toContain("疫学モデルε");
    expect(difference.description).toContain("数値化していません");
    expect(difference.acquisitionAction?.item).toBe("疫学モデルεの係数");
  });
});
