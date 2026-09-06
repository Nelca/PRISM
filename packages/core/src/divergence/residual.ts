/**
 * M4完成 §6.4:寄与と残差の構造化。T-09。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.2 の契約表・§6.4・§6.5
 *
 * | モード | 効率性 | 残差 | 全体差の復元 |
 * |---|---|---|---|
 * | 加法 | Σφ_i = V* − V_B | R = V_A − V* | V_A − V_B = Σφ_i + R |
 * | 乗法 | Σc_i = ln V* − ln V_B | r = ln V_A − ln V* | ln V_A − ln V_B = Σc_i + r |
 *
 * 残差を架空の「その他」要因にしない。既知の定性差異を記述できても、その差異へ残差の金額を
 * 割り当てたことにはならないため、`knownUnquantified` に金額を持たせない(§6.4)。
 * 完全分解を宣言したレシピで V* ≠ V_A(許容誤差外)なら不正として停止し、自動で部分分解へ変えない。
 */

import type { StructuredResidual } from "../types/divergence";
import type { DataAcquisitionAction, KnownDifference, MethodComparisonRecipe } from "../types/recipe";
import type { ExcludedFactor } from "./counterfactual";
import type { DecompositionModeV2 } from "./mode-selection";
import { TOLERANCE_POLICY, isZeroWithinTolerance, toleranceScale, withinTolerance } from "./tolerance";

export interface BuildResidualInput {
  mode: DecompositionModeV2;
  valueA: number;
  valueB: number;
  /** 到達値 V* = v(F)。 */
  vStar: number;
  /** 各要因の Shapley 寄与(加法はφ_i、乗法はc_i)。 */
  contributions: number[];
  recipe: Pick<MethodComparisonRecipe, "decompositionKind" | "fixedDifferences">;
  excludedFactors: ExcludedFactor[];
}

export type BuildResidualResult =
  | { ok: true; residual: StructuredResidual; knownUnquantified: KnownDifference[] }
  | { ok: false; reason: "full_decomposition_endpoint_mismatch"; detail: string };

/** 除外した数値化不能要因を、金額を割り当てない定性差異として構造化する(§6.4)。 */
export function excludedFactorsAsKnownDifferences(excluded: ExcludedFactor[]): KnownDifference[] {
  return excluded.map((factor) => ({
    category: factor.category,
    description: `${factor.label}(${factor.factorId}):反実仮想を定義できないため数値化していません。${factor.reason}`,
    sideA: "手法Aの設定(差し替え先)",
    sideB: "手法Bの設定(基準側に固定)",
    evidence: factor.evidence,
    acquisitionAction: factor.missingData[0],
  }));
}

function dedupeActions(actions: DataAcquisitionAction[]): DataAcquisitionAction[] {
  const seen = new Set<string>();
  const result: DataAcquisitionAction[] = [];
  for (const action of actions) {
    const key = `${action.item}|${action.candidateSource}|${action.gate ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

export function buildResidual(input: BuildResidualInput): BuildResidualResult {
  const { mode, valueA, valueB, vStar, contributions, recipe, excludedFactors } = input;
  const spec = mode === "multiplicative" ? TOLERANCE_POLICY.log : TOLERANCE_POLICY.money;

  const endpointScale = toleranceScale([valueA, vStar, valueB]);
  if (recipe.decompositionKind === "full" && !withinTolerance(vStar, valueA, endpointScale, TOLERANCE_POLICY.money)) {
    return {
      ok: false,
      reason: "full_decomposition_endpoint_mismatch",
      detail: `完全分解を宣言したレシピですが、到達値 V*(${vStar})が V_A(${valueA})と許容誤差(${TOLERANCE_POLICY.version})内で一致しません。自動で部分分解へ変更しません。`,
    };
  }

  const residualValue = mode === "multiplicative" ? Math.log(valueA) - Math.log(vStar) : valueA - vStar;
  const denominator = mode === "multiplicative" ? Math.log(valueA) - Math.log(valueB) : valueA - valueB;

  const scale = toleranceScale([...contributions, residualValue, denominator, ...(mode === "multiplicative" ? [] : [valueA, valueB, vStar])]);

  let ratio: number | null = null;
  let ratioUnavailableReason: StructuredResidual["ratioUnavailableReason"];

  const nonZeroTerms = [...contributions, residualValue].filter((value) => !isZeroWithinTolerance(value, scale, spec));
  const mixedSigns = new Set(nonZeroTerms.map((value) => Math.sign(value))).size > 1;

  if (isZeroWithinTolerance(denominator, scale, spec)) {
    ratioUnavailableReason = "total_difference_within_tolerance";
  } else if (mixedSigns) {
    ratioUnavailableReason = "mixed_signs";
  } else {
    ratio = residualValue / denominator;
  }

  const knownUnquantified = [...recipe.fixedDifferences, ...excludedFactorsAsKnownDifferences(excludedFactors)];
  const residualIsZero = isZeroWithinTolerance(residualValue, scale, spec);

  const nextActions = dedupeActions([
    ...knownUnquantified.map((difference) => difference.acquisitionAction).filter((action): action is DataAcquisitionAction => action !== undefined),
    ...excludedFactors.flatMap((factor) => factor.missingData),
  ]);

  return {
    ok: true,
    knownUnquantified,
    residual: {
      mode,
      value: residualValue,
      displayMultiplier: mode === "multiplicative" ? Math.exp(residualValue) : null,
      ratio,
      ...(ratioUnavailableReason ? { ratioUnavailableReason } : {}),
      knownUnquantified,
      unclassified: !residualIsZero && knownUnquantified.length === 0,
      nextActions,
    },
  };
}
