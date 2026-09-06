/**
 * M4完成 §6.3:乗法・加法・停止条件の判定。T-08。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.3
 *
 * 判定順を固定し、両端(V_A・V_B)だけでなく**全 v(S)** を検証する。ゼロは符号不一致の判定から除く。
 *   1. 欠損・NaN・Infinity → `non_finite`(欠損を0へ置換しない)
 *   2. V_A と V_B の非ゼロ符号が異なる → `sign_mismatch`
 *      全 v(S) ∪ {V_A, V_B} の非ゼロ値に正負が混在 → `counterfactual_sign_mismatch`
 *   3. すべて正 → 対数空間Shapley(`multiplicative`)。
 *      レシピが `modePolicy.preferAdditive` を宣言していれば理由付きで `additive`
 *   4. ゼロを含む、または全て非正で符号の意味が一致 → 符号付き金額の `additive`(絶対値にしない)
 *   5. 両端0でも F が非空で符号条件を満たすなら `additive` を実行する(全体差0・相殺を保持し、
 *      割合は表示しない)。F が空なら停止(§6.2)
 *
 * F-3(極端な桁差)・F-8(軽微な乖離)の業務閾値は **H-06 未承認のため適用しない**。
 * 判定に使わないが、診断値(`magnitudeGapRatio` / `lnRatio` / `absoluteDifference`)は記録する。
 * 数値安定性の停止条件と業務上の表示・省略閾値を分離するため(§6.3-7)。
 */

import type { PairDiagnostics, StopReasonCode } from "../types/divergence";
import type { MethodComparisonRecipe } from "../types/recipe";

/** F-3 の桁差閾値を適用していないことを再計算ハッシュへ残すための版(T-02-9)。 */
export const F3_THRESHOLD_DISABLED_VERSION = "f3-disabled-pending-h06";
/** F-8 の軽微乖離閾値を適用していないことを再計算ハッシュへ残すための版(T-02-9)。 */
export const F8_THRESHOLD_DISABLED_VERSION = "f8-disabled-pending-h06";

export interface ModeSelectionInput {
  valueA: number;
  valueB: number;
  /** 全部分集合の v(S)(v(∅)=V_B、v(F)=V* を含む)。 */
  subsetValues: number[];
  /** 縮小後の要因数 |F|。0 なら数値分解成功としない。 */
  factorCount: number;
  recipe: Pick<MethodComparisonRecipe, "modePolicy">;
}

export type DecompositionModeV2 = "additive" | "multiplicative";

export type ModeSelectionResult =
  | { kind: "ok"; mode: DecompositionModeV2; reason: string; diagnostics: PairDiagnostics }
  | { kind: "stop"; reason: StopReasonCode; detail: string; diagnostics: PairDiagnostics };

export function buildPairDiagnostics(valueA: number, valueB: number): PairDiagnostics {
  const absA = Math.abs(valueA);
  const absB = Math.abs(valueB);
  const max = Math.max(absA, absB);
  return {
    magnitudeGapRatio: max === 0 || !Number.isFinite(max) ? null : Math.min(absA, absB) / max,
    lnRatio: valueA > 0 && valueB > 0 ? Math.log(valueA / valueB) : null,
    absoluteDifference: Number.isFinite(valueA) && Number.isFinite(valueB) ? valueA - valueB : null,
    f3ThresholdApplied: false,
    f8ThresholdApplied: false,
  };
}

export function selectDecompositionMode(input: ModeSelectionInput): ModeSelectionResult {
  const { valueA, valueB, subsetValues, factorCount, recipe } = input;
  const diagnostics = buildPairDiagnostics(valueA, valueB);
  const all = [valueA, valueB, ...subsetValues];

  // 1. 非有限・未定義
  const nonFinite = all.filter((value) => !Number.isFinite(value));
  if (nonFinite.length > 0) {
    return {
      kind: "stop",
      reason: "non_finite",
      detail: `両端または反実仮想値に有限でない値があります(V_A=${valueA}, V_B=${valueB}, 非有限 ${nonFinite.length} 件)。欠損を0へ置換しません。`,
      diagnostics,
    };
  }

  // 2. 符号
  const signA = Math.sign(valueA);
  const signB = Math.sign(valueB);
  if (signA !== 0 && signB !== 0 && signA !== signB) {
    return {
      kind: "stop",
      reason: "sign_mismatch",
      detail: `V_A(${valueA})と V_B(${valueB})の非ゼロ符号が異なります。意味のないハイブリッドを加法で救済しません。`,
      diagnostics,
    };
  }
  const nonZeroSigns = new Set(all.filter((value) => value !== 0).map((value) => Math.sign(value)));
  if (nonZeroSigns.size > 1) {
    return {
      kind: "stop",
      reason: "counterfactual_sign_mismatch",
      detail: `全 v(S) と両端を合わせた集合に正負が混在します(正 ${all.filter((v) => v > 0).length} 件 / 負 ${all.filter((v) => v < 0).length} 件)。`,
      diagnostics,
    };
  }

  // 5(先出し). F が空なら数値分解成功としない(§6.2)
  if (factorCount === 0) {
    return {
      kind: "stop",
      reason: "no_numerizable_factors",
      detail: "有効な要因集合 F が空です。両端が0でも数値分解成功とせず、定性差異と停止理由を返します。",
      diagnostics,
    };
  }

  // 3. すべて正 → 乗法(倍率比較)。ただしレシピが加法を宣言していれば加法。
  const allPositive = all.every((value) => value > 0);
  if (allPositive) {
    const preferAdditive = recipe.modePolicy.preferAdditive;
    if (preferAdditive) {
      return {
        kind: "ok",
        mode: "additive",
        reason: `全値が正ですが、レシピが倍率比較に適さないと宣言しているため加法を使います(理由: ${preferAdditive.reason})。`,
        diagnostics,
      };
    }
    return { kind: "ok", mode: "multiplicative", reason: "V_A・V_B・全 v(S) が正のため、対数空間Shapleyで倍率を分解します。", diagnostics };
  }

  // 4・5. ゼロを含む、または全て非正で符号の意味が一致 → 加法(符号付き金額)
  const containsZero = all.some((value) => value === 0);
  const allNonPositive = all.every((value) => value <= 0);
  if (containsZero || allNonPositive) {
    const bothEndsZero = valueA === 0 && valueB === 0;
    const reason = bothEndsZero
      ? "両端が0ですが有効な F があり全 v(S) の符号条件を満たすため、加法Shapleyを実行します(全体差0・相殺を保持し、割合は表示しません)。"
      : containsZero
        ? "ゼロを含むため、金額差による加法Shapleyを使います(絶対値へ変換しません)。"
        : "全値が非正で符号の意味が一致するため、符号付き金額の加法Shapleyを使います。";
    return { kind: "ok", mode: "additive", reason, diagnostics };
  }

  // 規則3〜5のいずれにも該当しない場合は既定で停止する(§6.3 冒頭)。
  return {
    kind: "stop",
    reason: "counterfactual_sign_mismatch",
    detail: "倍率比較にも共通の金額差にも意味を与えられない値の組合せです。既定で数値分解へ進めません。",
    diagnostics,
  };
}
