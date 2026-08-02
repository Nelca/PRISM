/**
 * M4 §4:対数空間Shapley分解エンジン(汎用実装、k=0〜3対応)。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §4.2・§4.3
 *
 * v(S)の中身(実際の「差し替えて再計算」ロジック)は factor-recalculation.ts が担い、
 * このモジュールは「与えられたv(S)から寄与を正しく按分する」という汎用の組合せ論のみを扱う。
 * これにより、将来 割引率・エンドポイント被覆の再計算式が追加されても、このモジュールの
 * 変更なしでk=2・k=3の分解に拡張できる(design note参照)。
 */

import type { DecompositionFactor } from "../types/divergence";

const EFFICIENCY_AXIOM_TOLERANCE = 1e-9;

export interface RawFactorContribution {
  factor: DecompositionFactor;
  /** c_i(対数空間でのShapley寄与)。 */
  logContribution: number;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

/**
 * §4.2の式をそのまま実装する。全順列について限界寄与を対数空間で計算し、平均する。
 * 効率性公理(F-7)を内部で検証し、逸脱時は結果を返さずエラーを投げる
 * (「誤った分解を出すより出さない」という要件定義書の方針)。
 */
export function computeShapleyContributions(
  effectiveFactors: DecompositionFactor[],
  v: (subset: Set<DecompositionFactor>) => number
): RawFactorContribution[] {
  if (effectiveFactors.length === 0) {
    return [];
  }

  const perms = permutations(effectiveFactors);
  const sums = new Map<DecompositionFactor, number>(effectiveFactors.map((factor) => [factor, 0]));

  for (const perm of perms) {
    const included = new Set<DecompositionFactor>();
    let previousValue = v(included);
    for (const factor of perm) {
      included.add(factor);
      const newValue = v(new Set(included));
      const marginal = Math.log(newValue) - Math.log(previousValue);
      sums.set(factor, sums.get(factor)! + marginal);
      previousValue = newValue;
    }
  }

  const contributions = effectiveFactors.map((factor) => ({
    factor,
    logContribution: sums.get(factor)! / perms.length,
  }));

  // F-7: 効率性公理の数値検証。対数空間Shapleyは構成上厳密に一致するため、逸脱は実装バグを意味する。
  const sumOfContributions = contributions.reduce((total, c) => total + c.logContribution, 0);
  const expected = Math.log(v(new Set(effectiveFactors))) - Math.log(v(new Set()));
  if (Math.abs(sumOfContributions - expected) >= EFFICIENCY_AXIOM_TOLERANCE) {
    throw new Error(
      `M4 F-7: Shapley分解の効率性公理が満たされません(Σc_i=${sumOfContributions}, 期待値=${expected})。v(S)の実装を確認してください。`
    );
  }

  return contributions;
}
