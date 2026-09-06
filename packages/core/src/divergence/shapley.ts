/**
 * M4 §4 / 完成実装 §6.2・T-07.7:Shapley寄与の按分エンジン。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §4.2・§4.3、
 *         docs/roadmap/divergence-decomposition-completion-directive.md §6.2「評価回数の予算」
 *
 * このモジュールは「与えられた v(S) から寄与を正しく按分する」という汎用の組合せ論だけを扱う。
 * v(S) の中身(トレースの再実行)は `counterfactual.ts` が担う。
 *
 * 2026-09-06(完成実装)で2系統になった。
 *   - 旧経路 `computeShapleyContributions`: 全順列を展開する対数空間Shapley。
 *     `quantile-decomposition.ts` と旧 `pairwise-decomposition.ts` が使う。**挙動を変えない。**
 *   - 新経路 `computeShapleyValues`: **部分集合の重み付き和**でφ_iを算出し、v(S)をビットマスクで
 *     メモ化する。v が実式の再実行になった時点で、全順列展開は1ペアあたり k!×k 回の手法再評価に
 *     なるため(§6.2)、新経路はこれを 2^k 回へ落とす。加法空間(符号付き金額)にも対応する。
 *
 * 効率性の検証は tol-v1(`tolerance.ts`)で行い、逸脱時は例外ではなく判別可能な結果を返す。
 * 誤った分解を出さないという方針は同じだが、上位が停止理由コードとして扱えるようにするため。
 */

import { TOLERANCE_POLICY, toleranceScale, withinTolerance, type TolerancePolicy } from "./tolerance";

const EFFICIENCY_AXIOM_TOLERANCE = 1e-9;

/**
 * 要因の集合は呼び出し側が決める(2026-08-09に汎用化)。
 * 中心値の分解は `DecompositionFactor`(エンドポイント被覆/割引率/地理較正)を使い、
 * 分位点の幅の分解は別の要因集合(層i/層ii)を使う。**同じ按分ロジックを共有する。**
 */
export interface RawFactorContribution<F extends string = string> {
  factor: F;
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
 *
 * @deprecated 新経路(反実仮想の実式再実行)では `computeShapleyValues` を使う。
 *   この関数は v(S) が固定倍率の合成である旧経路(`quantile-decomposition.ts`・
 *   旧 `pairwise-decomposition.ts`)専用として、メモ化せず全順列を展開する挙動のまま残す。
 */
export function computeShapleyContributions<F extends string>(
  effectiveFactors: F[],
  v: (subset: Set<F>) => number
): RawFactorContribution<F>[] {
  if (effectiveFactors.length === 0) {
    return [];
  }

  const perms = permutations(effectiveFactors);
  const sums = new Map<F, number>(effectiveFactors.map((factor) => [factor, 0]));

  for (const perm of perms) {
    const included = new Set<F>();
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

// ---------------------------------------------------------------------------
// 新経路(完成実装 T-07.7)
// ---------------------------------------------------------------------------

/** 寄与を計算する空間。乗法(倍率比較)は対数、加法(符号付き金額)はそのまま。 */
export type ShapleySpace = "log" | "additive";

export interface ShapleyBudget {
  /** 数値化要因数の上限。 */
  maxFactors: number;
  /** 1ペアあたりの v(S) 評価回数の上限(2^k と比較する)。 */
  maxEvaluations: number;
}

export interface ShapleyValue<F extends string = string> {
  factorId: F;
  /** 加法: φ_i(共通通貨)。乗法: c_i(対数)。 */
  value: number;
}

export interface ComputeShapleyValuesOptions<F extends string> {
  factorIds: F[];
  /** v(S)。部分集合(要因IDの配列)を受け取り、その反実仮想値を返す。 */
  valueOf: (subset: readonly F[]) => number;
  space: ShapleySpace;
  budget: ShapleyBudget;
  tolerance?: TolerancePolicy;
}

export type ShapleyValuesResult<F extends string = string> =
  | {
      kind: "ok";
      values: ShapleyValue<F>[];
      /** メモ化後に実際に評価した部分集合の数(= 2^k)。 */
      evaluationCount: number;
      /** 空間内での v(∅)。加法は V_B、乗法は ln V_B。 */
      baseValue: number;
      /** 空間内での v(F)。加法は V*、乗法は ln V*。 */
      fullValue: number;
      toleranceVersion: string;
    }
  | { kind: "budget_exceeded"; detail: string; requiredEvaluations: number; budget: ShapleyBudget }
  | { kind: "efficiency_violation"; detail: string; sum: number; expected: number; toleranceVersion: string }
  /** 対数空間で v(S) ≤ 0、または非有限の v(S) を検出した(上位は non_finite として停止する)。 */
  | { kind: "invalid_value"; detail: string; subset: string[]; value: number };

function transform(space: ShapleySpace, value: number): number {
  return space === "log" ? Math.log(value) : value;
}

/** k!/(|S|!(k−|S|−1)!) の逆数。φ_i = Σ_S weight(|S|,k) × (v(S∪{i}) − v(S))。 */
function shapleyWeight(subsetSize: number, factorCount: number): number {
  // |S|! (k − |S| − 1)! / k! を階乗のオーバーフローなしに積で計算する。
  let weight = 1 / factorCount;
  for (let j = 0; j < subsetSize; j++) {
    weight *= (j + 1) / (factorCount - 1 - j);
  }
  return weight;
}

/**
 * 部分集合の重み付き和による Shapley 値。
 *   φ_i = Σ_{S⊆F∖{i}} |S|!(k−|S|−1)!/k! × (v(S∪{i}) − v(S))
 * v(S) はビットマスクでメモ化し、同じ S を再評価しない(§6.2 評価回数の予算)。
 * 全順列展開(`permutationAverageShapley`)と数学的に同値であることをテストで固定する。
 */
export function computeShapleyValues<F extends string>(options: ComputeShapleyValuesOptions<F>): ShapleyValuesResult<F> {
  const { factorIds, valueOf, space, budget } = options;
  const tolerance = options.tolerance ?? TOLERANCE_POLICY;
  const k = factorIds.length;
  const spec = space === "log" ? tolerance.log : tolerance.money;

  if (k === 0) {
    const only = valueOf([]);
    if (!Number.isFinite(only) || (space === "log" && only <= 0)) {
      return { kind: "invalid_value", detail: "v(∅) が評価できません。", subset: [], value: only };
    }
    const transformed = transform(space, only);
    return {
      kind: "ok",
      values: [],
      evaluationCount: 1,
      baseValue: transformed,
      fullValue: transformed,
      toleranceVersion: tolerance.version,
    };
  }

  const requiredEvaluations = 2 ** k;
  if (k > budget.maxFactors || requiredEvaluations > budget.maxEvaluations) {
    return {
      kind: "budget_exceeded",
      detail: `要因数 ${k}(上限 ${budget.maxFactors})、必要な v(S) 評価回数 ${requiredEvaluations}(上限 ${budget.maxEvaluations})。要因を減らす方針はレシピに委ねず停止します。`,
      requiredEvaluations,
      budget,
    };
  }

  const memo = new Map<number, number>();
  // クロージャ内の代入は制御フロー解析に載らないため、判定は配列の長さで行う。
  const invalidSubsets: { subset: string[]; value: number }[] = [];
  let evaluationCount = 0;

  const evaluate = (mask: number): number => {
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;
    const subset = factorIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const raw = valueOf(subset);
    evaluationCount++;
    if (!Number.isFinite(raw) || (space === "log" && raw <= 0)) {
      invalidSubsets.push({ subset: [...subset], value: raw });
      memo.set(mask, Number.NaN);
      return Number.NaN;
    }
    const value = transform(space, raw);
    memo.set(mask, value);
    return value;
  };

  const sums = new Array<number>(k).fill(0);
  const fullMask = requiredEvaluations - 1;

  for (let i = 0; i < k; i++) {
    const bit = 1 << i;
    for (let mask = 0; mask <= fullMask; mask++) {
      if ((mask & bit) !== 0) continue; // S ⊆ F∖{i}
      const subsetSize = countBits(mask);
      const weight = shapleyWeight(subsetSize, k);
      const withI = evaluate(mask | bit);
      const withoutI = evaluate(mask);
      sums[i] += weight * (withI - withoutI);
    }
  }

  if (invalidSubsets.length > 0) {
    const first = invalidSubsets[0];
    const label = `v({${first.subset.join(", ")}}) = ${first.value}`;
    const detail =
      space === "log"
        ? `対数空間では v(S) > 0 が必要ですが、${label} です。`
        : `${label} は有限値ではありません。欠損を0へ置換しません。`;
    return { kind: "invalid_value", detail, subset: first.subset, value: first.value };
  }

  const baseValue = evaluate(0);
  const fullValue = evaluate(fullMask);
  const sum = sums.reduce((total, value) => total + value, 0);
  const expected = fullValue - baseValue;
  const scale = toleranceScale([...memo.values(), ...sums, expected]);

  if (!withinTolerance(sum, expected, scale, spec)) {
    return {
      kind: "efficiency_violation",
      detail: `効率性(Σφ_i = ${space === "log" ? "ln V* − ln V_B" : "V* − V_B"})が許容誤差(${tolerance.version})を超えて満たされません(Σ=${sum}, 期待値=${expected})。`,
      sum,
      expected,
      toleranceVersion: tolerance.version,
    };
  }

  return {
    kind: "ok",
    values: factorIds.map((factorId, index) => ({ factorId, value: sums[index] })),
    evaluationCount,
    baseValue,
    fullValue,
    toleranceVersion: tolerance.version,
  };
}

function countBits(mask: number): number {
  let count = 0;
  let rest = mask;
  while (rest !== 0) {
    rest &= rest - 1;
    count++;
  }
  return count;
}

export const PERMUTATION_AVERAGE_MAX_FACTORS = 4;

/**
 * テスト用の参照実装。全順序(k! 通り)の限界寄与の平均をそのまま計算する。
 * 相互作用のある v(S)(MAX・積・非線形)で `computeShapleyValues` と一致することを検証するために使う。
 * 計算量が k!×k のため k ≤ 4 に制限する(§6.2 の予算方針と同じ理由)。
 */
export function permutationAverageShapley<F extends string>(options: {
  factorIds: F[];
  valueOf: (subset: readonly F[]) => number;
  space: ShapleySpace;
}): ShapleyValue<F>[] {
  const { factorIds, valueOf, space } = options;
  if (factorIds.length > PERMUTATION_AVERAGE_MAX_FACTORS) {
    throw new Error(
      `permutationAverageShapley は参照実装のため要因数 ${PERMUTATION_AVERAGE_MAX_FACTORS} 以下でのみ使えます(指定: ${factorIds.length})。`
    );
  }
  if (factorIds.length === 0) return [];

  const perms = permutations(factorIds);
  const sums = new Map<F, number>(factorIds.map((factorId) => [factorId, 0]));

  for (const perm of perms) {
    const included: F[] = [];
    let previous = transform(space, valueOf([]));
    for (const factorId of perm) {
      included.push(factorId);
      const current = transform(space, valueOf([...included]));
      sums.set(factorId, sums.get(factorId)! + (current - previous));
      previous = current;
    }
  }

  return factorIds.map((factorId) => ({ factorId, value: sums.get(factorId)! / perms.length }));
}
