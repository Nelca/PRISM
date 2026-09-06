import { describe, expect, it } from "vitest";
import { buildNarrativeV2, type NarrativeV2DecomposedInput, type NarrativeV2StoppedInput } from "./narrative-v2";
import type { NumericContribution, StructuredResidual } from "../types/divergence";

const EVIDENCE = [{ source: "テスト", tier: "primary" as const }];

function contribution(overrides: Partial<NumericContribution> = {}): NumericContribution {
  return {
    factorId: "alpha",
    category: "coverage_pathway",
    label: "被覆係数α",
    shapley: 10,
    displayAmount: 10,
    displayMultiplier: null,
    shareRatio: 0.5,
    isZero: false,
    swapped: [],
    evidence: EVIDENCE,
    ...overrides,
  };
}

const RESIDUAL: StructuredResidual = {
  mode: "additive",
  value: 10,
  displayMultiplier: null,
  ratio: 0.5,
  knownUnquantified: [
    {
      category: "underlying_model_data",
      description: "損害関数が異なる。",
      sideA: "A の損害関数",
      sideB: "B の損害関数",
      evidence: EVIDENCE,
      acquisitionAction: { item: "損害関数の公開式", candidateSource: "方法論文書", enablesRecalculation: true, gate: "H-02" },
    },
  ],
  unclassified: false,
  nextActions: [{ item: "損害関数の公開式", candidateSource: "方法論文書", enablesRecalculation: true, gate: "H-02" }],
};

const DECOMPOSED: NarrativeV2DecomposedInput = {
  kind: "decomposed",
  methodIdA: "method-a",
  methodIdB: "method-b",
  mode: "additive",
  decompositionKind: "partial",
  valueA: 30,
  valueB: 10,
  vStar: 20,
  totalDifference: 20,
  explainedSum: 10,
  contributions: [contribution()],
  residual: RESIDUAL,
  implication: { kind: "representative_choice", summary: "代表値を選べます。" },
  normalizationApplied: ["A: 通貨換算"],
  qualitativeDifferences: RESIDUAL.knownUnquantified,
};

describe("buildNarrativeV2(決定論的テンプレート)", () => {
  it("結論 → 含意 → 数値寄与 → 既知の差異 → 残差と次アクション の順に並べる", () => {
    const narrative = buildNarrativeV2(DECOMPOSED);
    const order = ["結論:", "意思決定への含意:", "数値寄与", "既知だが数値化できない差異:", "残差:", "次に取得すべきデータ:"];
    let cursor = -1;
    for (const marker of order) {
      const index = narrative.indexOf(marker);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  it("手法IDをそのまま埋め、同じ入力からは同じ文字列を返す", () => {
    const narrative = buildNarrativeV2(DECOMPOSED);
    expect(narrative).toContain("method-a");
    expect(narrative).toContain("method-b");
    expect(buildNarrativeV2(DECOMPOSED)).toBe(narrative);
  });

  it("残差を既知のモデル差へ数値配分する文を生成しない", () => {
    const narrative = buildNarrativeV2(DECOMPOSED);
    expect(narrative).not.toMatch(/モデル差が残差の/);
    expect(narrative).toContain("金額は割り当てていません");
    expect(narrative).toContain("残差の数値的配分は未解決です");
  });

  it("乗法モードでは倍率で結論を述べる", () => {
    const narrative = buildNarrativeV2({
      ...DECOMPOSED,
      mode: "multiplicative",
      contributions: [contribution({ displayAmount: null, displayMultiplier: 2, shapley: Math.log(2) })],
      residual: { ...RESIDUAL, mode: "multiplicative", displayMultiplier: 1.5 },
    });
    expect(narrative).toContain("倍です");
    expect(narrative).toContain("×2");
  });

  it("残差比率が表示できない場合はその理由を明示する", () => {
    const mixed = buildNarrativeV2({
      ...DECOMPOSED,
      residual: { ...RESIDUAL, ratio: null, ratioUnavailableReason: "mixed_signs" },
    });
    expect(mixed).toContain("残差比率は表示できません");
    expect(mixed).toContain("正負が混在");

    const zeroDifference = buildNarrativeV2({
      ...DECOMPOSED,
      residual: { ...RESIDUAL, ratio: null, ratioUnavailableReason: "total_difference_within_tolerance" },
    });
    expect(zeroDifference).toContain("全体差が許容誤差内で0");
  });

  it("未分類残差はその旨を明示する", () => {
    const narrative = buildNarrativeV2({
      ...DECOMPOSED,
      residual: { ...RESIDUAL, knownUnquantified: [], unclassified: true, nextActions: [] },
      qualitativeDifferences: [],
    });
    expect(narrative).toContain("既知だが数値化できない差異: 特定されていません。");
    expect(narrative).toContain("未分類残差です");
    expect(narrative).toContain("次に取得すべきデータ: 特定できていません。");
  });

  it("停止結果では理由コードと日本語ラベル、次アクションを出す", () => {
    const stopped: NarrativeV2StoppedInput = {
      kind: "stopped",
      methodIdA: "method-a",
      methodIdB: "method-b",
      reason: "trace_insufficient",
      detail: "ゼロ意味が確定していません。",
      missingData: [{ item: "ゼロ意味の出典", candidateSource: "一次資料", enablesRecalculation: true }],
      implication: { kind: "additional_investigation", summary: "追加調査が必要です。" },
      qualitativeDifferences: [],
    };
    const narrative = buildNarrativeV2(stopped);
    expect(narrative).toContain("数値分解しませんでした");
    expect(narrative).toContain("trace_insufficient");
    expect(narrative).toContain("反実仮想に必要な計算トレースが不足しています");
    expect(narrative).toContain("ゼロ意味の出典");
  });
});
