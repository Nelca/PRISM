/**
 * M4 §5 F-0〜F-3/F-8:ペア単位の事前条件チェック。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §5
 *
 * F-0が要求する「全2^k個のv(S)の符号・桁差・乖離度チェック」のうち、
 * 手法A・手法Bの中心値(v(∅)=V_B, v(F)=V_A)だけで判定できる部分をここで行う。
 * 要因ごとの再計算可能性判定(F-4/F-5、"全て算出可能か")は factor-recalculation.ts が担う。
 */

import type { DecompositionMode } from "../types/divergence";

const MAGNITUDE_GAP_RATIO = 1e-6;
const NEGLIGIBLE_DIVERGENCE_LN_THRESHOLD = Math.log(1.05);

export type PairPreconditionFallback = "F-1" | "F-2" | "F-3" | "F-8";

export type PairPrecondition =
  | { proceed: true }
  | { proceed: false; mode: DecompositionMode; fallback: PairPreconditionFallback; reason: string };

/**
 * V_A(手法A中心値)・V_B(手法B中心値)から、Shapley分解に進めるかを判定する。
 * 判定順序はF-0の記載順(符号一致 → 正値 → 桁差 → 閾値)に従う。
 */
/**
 * @deprecated 旧経路。F-3(桁差)・F-8(軽微な乖離)の業務閾値を含むが、これらは H-06 未承認のため
 *   新経路では適用しない(`mode-selection.ts` の `F3_THRESHOLD_DISABLED_VERSION` /
 *   `F8_THRESHOLD_DISABLED_VERSION` を参照)。新runは `selectDecompositionMode` を使う。
 */
export function classifyPairPrecondition(valueA: number, valueB: number): PairPrecondition {
  const signA = Math.sign(valueA);
  const signB = Math.sign(valueB);

  // F-2: 符号が異なる(ゼロは除く。ゼロはF-1で扱う)
  if (signA !== 0 && signB !== 0 && signA !== signB) {
    return {
      proceed: false,
      mode: "not_decomposed",
      fallback: "F-2",
      reason:
        "手法Aと手法Bで符号が異なります(費用/便益の定性的な不一致)。倍率の算出および要因分解を行いません。",
    };
  }

  // F-1: ゼロまたは負の値を含む(符号は同一)
  if (valueA <= 0 || valueB <= 0) {
    return {
      proceed: false,
      mode: "additive",
      fallback: "F-1",
      reason: "いずれかの値がゼロまたは負のため、乗法分解ではなく絶対額での加法分解にフォールバックします。",
    };
  }

  const min = Math.min(valueA, valueB);
  const max = Math.max(valueA, valueB);

  // F-3: 極端な桁差(実質ゼロ)
  if (min < MAGNITUDE_GAP_RATIO * max) {
    return {
      proceed: false,
      mode: "not_decomposed",
      fallback: "F-3",
      reason:
        "一方の値が実質ゼロ近傍(6桁超の差)です。被覆範囲の差であり、倍率の算出を行いません。",
    };
  }

  // F-8: 乖離が軽微(5%未満)
  const lnRatio = Math.log(valueA / valueB);
  if (Math.abs(lnRatio) < NEGLIGIBLE_DIVERGENCE_LN_THRESHOLD) {
    return {
      proceed: false,
      mode: "not_decomposed",
      fallback: "F-8",
      reason: "乖離が5%未満のため、有意な乖離なしと判定します。",
    };
  }

  return { proceed: true };
}
