/**
 * M4完成 T-10a/T-07:LIME3 水消費の**地理的視点**(消費国・世界平均 vs 消費国・日本)の比較レシピ。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1(状態Aの実データ)、
 *         §5.5-5(手法固有の地域移転)、docs/data/lime3-coefficients-notes.md §3.2
 *
 * **これは手法間比較ではない。** 同一手法(LIME3 3.0.0)の内部変種であり、§3.3 の「2手法以上」を
 * 満たさないため `analysisUnit: "intra_method_variant"` / `countsTowardRealDataEvidence: false` とし、
 * 状態B(実データ実証)の件数へ算入しない(§7.2.1 の制約)。目的は、要因交換が固定倍率の合成ではなく
 * **実式の再実行**で行われていることを、外部から検算できる期待値(比 2.56623)で確かめることにある。
 *
 * ---
 *
 * **要因の粒度についての判断(指示書からの逸脱と根拠)。**
 * 指示書 §7.2.1 は「統合化係数 usd_per_daly は4通りとも 23,696.265 で一致するので固定」と書くが、
 * 実測値は 23696.26514 / 23696.26524 / 23696.26524 / 23696.26520 であり、有効数字9桁目で異なる。
 * DALY/m³ だけを差し替えて統合化係数を基準側に固定すると、到達値 V* は V_A に対して相対 4.06e-9
 * (表層水・45,000 m³・PPP 94.46 で約 6.0e-4 円)ずれ、tol-v1(money: atol 1e-6・rtol 1e-9、
 * scale ≈ 148,228 円 → 許容 1.49e-4 円)を超える。許容誤差は広げない規律のため、
 * **「地理的視点」を採用列そのものの切替として定義し、その列が供給する DALY/m³ と統合化係数を
 * 1つの要因として束ねて差し替える。** 一次資料でも両者は同じ列から読む値であり、片方だけを
 * 入れ替えた組合せは公表資料のどこにも存在しない(§4-5「実行可能なものだけ数値化する」)。
 * この定義では V* = V_A が厳密に成立し、残差はゼロになる。
 */

import type { MethodComparisonRecipe, RecipeSupportCheck } from "../../types/recipe";
import type { MethodEvaluationTrace } from "../../types/trace";
import { realDataSwapFactor } from "./trace-swap";
import {
  LIME3_CSV_EVIDENCE,
  LIME3_DALY_SELECTOR,
  LIME3_FLOW_LABEL,
  LIME3_NOTES_EVIDENCE,
  LIME3_PERSPECTIVE_LABEL,
  LIME3_PERSPECTIVE_SELECTOR,
  LIME3_USD_PER_DALY_SELECTOR,
  lime3LookupStepId,
  lime3UsdStepId,
  readLime3Column,
} from "./lime3-water-common";

export const LIME3_WATER_PERSPECTIVE_RECIPE_ID = "lime3-water-perspective";

/**
 * 同一手法の内部変種であるため、レジストリの `find` は methodId / subFactorId / 版だけでは
 * 「世界平均 vs 日本」のペアを他の LIME3×LIME3 ペアと区別できない。ここでトレースに記録された
 * 一次資料の列名を読み、A=世界平均・B=日本・同一基本フローの組でなければ実行を止める。
 * これが無いと、本番で同じ列どうしの LIME3 ペア(全体差ゼロ)が誤って分解されうる。
 */
function supports(traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace): RecipeSupportCheck {
  const columnA = readLime3Column(traceA);
  const columnB = readLime3Column(traceB);
  if (!columnA || !columnB) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        "LIME3 の採用列(基本フロー・地理的視点)をトレースの一次資料引用から読み取れません。" +
        "係数の構成要素(MethodConfig.lime3WaterCoefficient)が供給されていない可能性があります。列を推定しません。",
    };
  }
  if (columnA.flowId !== columnB.flowId) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        `基本フローが異なります(A: ${columnA.flowId} ${LIME3_FLOW_LABEL[columnA.flowId] ?? ""} / ` +
        `B: ${columnB.flowId} ${LIME3_FLOW_LABEL[columnB.flowId] ?? ""})。水源種別の違いは地理的視点の要因では説明しません。`,
    };
  }
  if (columnA.perspective !== "consumption_world_average" || columnB.perspective !== "consumption_japan") {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        "このレシピが扱うのは A=消費国・世界平均 / B=消費国・日本 の組だけです" +
        `(実際: A ${LIME3_PERSPECTIVE_LABEL[columnA.perspective]} / B ${LIME3_PERSPECTIVE_LABEL[columnB.perspective]})。` +
        "同じ列どうしのペアを地理的視点の差として分解しません。",
    };
  }
  return { ok: true };
}

/** 採用列の切替。DALY/m³・採用列マーカー・統合化係数を同じ公表列から一括で差し替える。 */
const GEOGRAPHIC_PERSPECTIVE_FACTOR = realDataSwapFactor({
  id: "geographic_perspective",
  category: "geographic_model",
  label: "地理的視点(消費国・世界平均 ⇄ 消費国・日本)の採用列",
  evidence: [LIME3_CSV_EVIDENCE, LIME3_NOTES_EVIDENCE],
  targets: [
    { resolveStepId: lime3LookupStepId, selectors: [LIME3_DALY_SELECTOR, LIME3_PERSPECTIVE_SELECTOR] },
    { resolveStepId: lime3UsdStepId, selectors: [LIME3_USD_PER_DALY_SELECTOR] },
  ],
});

export const LIME3_WATER_PERSPECTIVE_RECIPE: Omit<MethodComparisonRecipe, "hash"> = {
  id: LIME3_WATER_PERSPECTIVE_RECIPE_ID,
  version: "1.0.0",
  category: "water",
  methodA: { methodId: "lime3-water", subFactorId: "lime3-water", versionRange: "3.*" },
  methodB: { methodId: "lime3-water", subFactorId: "lime3-water", versionRange: "3.*" },
  analysisUnit: "intra_method_variant",
  countsTowardRealDataEvidence: false,
  review: {
    status: "evidence_verified",
    reviewer: { kind: "ai" },
    reviewedAt: "2026-09-06",
    verification: [
      "AIST-IDEA v4.0 標準版 CSV の該当4列(基本フロー001511000/001515000 × 消費国・世界平均/日本)を、" +
        "docs/data/lime3-coefficients-notes.md §5.1 の照合済み抽出から確認",
      "独立検算: 統合化 US$/m³ 列の比(世界平均 ÷ 日本)= 2.56623 が、DALY/m³ × 統合化係数の経路で得た" +
        "寄与倍率と一致することを packages/core/src/divergence/recipes/lime3-water-perspective.test.ts で確認",
    ],
  },
  evidence: [LIME3_CSV_EVIDENCE, LIME3_NOTES_EVIDENCE],
  comparableScope: {
    valueConcept: "welfare",
    requiredSubjectAttributes: ["category", "flow", "quantity", "location", "period", "timeBasis"],
    pathwayNote:
      "同一手法・同一因果経路(取水→水不足→人間健康DALY→統合化)。違いは採用する地理的視点の列だけであり、被覆経路は一致する。",
  },
  supports,
  /**
   * 比較前正規化は無い。PPP 94.46 による円換算は手法内部の地理較正ステップ(role: method_model、
   * D-127・D-128)であり、両側で同一のため寄与に影響しない。reconciliation として二重計上しない(§5.5)。
   */
  normalization: [],
  factors: [GEOGRAPHIC_PERSPECTIVE_FACTOR],
  decompositionKind: "full",
  baseline: "B",
  reverseCompatible: true,
  fixedDifferences: [],
  modePolicy: {},
  budget: { maxFactors: 1, maxEvaluations: 2 },
};
