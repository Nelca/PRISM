/**
 * M4完成 T-04/T-07:LIME3 水消費の**エンドポイント配分**要因(ゼロ寄与公理の実データ検証)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1、
 *         docs/data/method-recalculability.md §3.3、Yamasaki, Ikaga & Itsubo (2020) Table 2
 *
 * LIME3 の水消費は損害の100%が人間健康エンドポイントへ配分され、社会資産・生物多様性・
 * 一次生産の3列は CSV でも空欄である。したがって「エンドポイント配分を相手手法のものへ差し替える」
 * 反実仮想は、同じ列どうしでは配分率 1.0 → 1.0 の差し替えになり、**寄与は厳密にゼロ**になる。
 * これを合成データではなく実データの構造(公表列の空欄)で確かめるのがこのレシピの目的である。
 *
 * `analysisUnit: "intra_method_variant"`(同一手法の内部変種)であり、状態Bの実証件数へ算入しない。
 *
 * **同一列であることを `supports` で要求する。** 表層水と地下水、世界平均と日本のように列が違う
 * ペアをこのレシピで扱うと、配分率以外の差(係数そのものの差)を「配分要因では説明できない残差」
 * として押し出すだけになり、ゼロ寄与の検証にならない。列が違うペアはこのレシピの対象外とする
 * (水源種別が異なるペアは、そもそも比較対象の不一致として `different_subject` で止まる。T-03)。
 */

import type { MethodComparisonRecipe, RecipeSupportCheck } from "../../types/recipe";
import type { MethodEvaluationTrace } from "../../types/trace";
import { realDataSwapFactor } from "./trace-swap";
import {
  LIME3_ALLOCATION_EVIDENCE,
  LIME3_ALLOCATION_SELECTOR,
  LIME3_CSV_EVIDENCE,
  LIME3_FLOW_LABEL,
  LIME3_PERSPECTIVE_LABEL,
  lime3AllocationStepId,
  readLime3Column,
} from "./lime3-water-common";

export const LIME3_WATER_ENDPOINT_RECIPE_ID = "lime3-water-endpoint";

function supports(traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace): RecipeSupportCheck {
  const columnA = readLime3Column(traceA);
  const columnB = readLime3Column(traceB);
  if (!columnA || !columnB) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        "LIME3 の採用列(基本フロー・地理的視点)をトレースの一次資料引用から読み取れません。" +
        "エンドポイント配分の反実仮想を、どの列に対して行うのか特定できません。",
    };
  }
  if (columnA.flowId !== columnB.flowId || columnA.perspective !== columnB.perspective) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        "このレシピが扱うのは同一列(同じ基本フロー・同じ地理的視点)どうしのペアだけです" +
        `(A: ${columnA.flowId} ${LIME3_FLOW_LABEL[columnA.flowId] ?? ""} / ${LIME3_PERSPECTIVE_LABEL[columnA.perspective]}、` +
        `B: ${columnB.flowId} ${LIME3_FLOW_LABEL[columnB.flowId] ?? ""} / ${LIME3_PERSPECTIVE_LABEL[columnB.perspective]})。` +
        "列が違う差をエンドポイント配分の要因として説明しません。",
    };
  }
  if (!lime3AllocationStepId(traceA) || !lime3AllocationStepId(traceB)) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail: "エンドポイント配分ステップを持たないトレースです(構成要素が供給されていません)。",
    };
  }
  return { ok: true };
}

const ENDPOINT_ALLOCATION_FACTOR = realDataSwapFactor({
  id: "endpoint_allocation",
  category: "coverage_pathway",
  label: "エンドポイント配分(人間健康 100%)",
  evidence: [LIME3_ALLOCATION_EVIDENCE, LIME3_CSV_EVIDENCE],
  targets: [{ resolveStepId: lime3AllocationStepId, selectors: [LIME3_ALLOCATION_SELECTOR] }],
});

export const LIME3_WATER_ENDPOINT_RECIPE: Omit<MethodComparisonRecipe, "hash"> = {
  id: LIME3_WATER_ENDPOINT_RECIPE_ID,
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
      "Yamasaki, Ikaga & Itsubo (2020) Table 2 と AIST-IDEA v4.0 CSV の該当3列(社会資産・生物多様性・" +
        "一次生産)が空欄であることを docs/data/method-recalculability.md §3.3 経由で確認",
      "独立検算: 配分率 1.0 → 1.0 の差し替えでは v({endpoint_allocation}) = v(∅) となり寄与が厳密に0に" +
        "なることを packages/core/src/divergence/recipes/lime3-water-endpoint.test.ts で確認",
    ],
  },
  evidence: [LIME3_ALLOCATION_EVIDENCE, LIME3_CSV_EVIDENCE],
  comparableScope: {
    valueConcept: "welfare",
    requiredSubjectAttributes: ["category", "flow", "quantity", "location", "period", "timeBasis"],
    pathwayNote: "同一手法・同一列。エンドポイント配分は両側とも人間健康100%であり、被覆経路は一致する。",
  },
  supports,
  normalization: [],
  factors: [ENDPOINT_ALLOCATION_FACTOR],
  decompositionKind: "full",
  baseline: "B",
  reverseCompatible: true,
  fixedDifferences: [],
  modePolicy: {},
  budget: { maxFactors: 1, maxEvaluations: 2 },
};
