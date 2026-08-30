/**
 * M4 U-3:分位点(レンジの幅)の要因別分解。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §10 U-3・F-6
 *
 * M4のMVPは中心値のみを分解対象とし(F-6)、レンジは併記するだけだった。
 * §10 U-3は「レンジ(分位点)の要因別分解」を未決定事項として残していた。
 *
 * **中心値の3要因では幅の違いを説明できない。** これがこのモジュールの出発点である。
 * 地理較正・エンドポイント被覆・割引率は、対数空間で分布の**位置をずらすだけ**で
 * 幅を変えない(いずれも決定論的な倍率であり、中心値と分位点に同じ係数が掛かる)。
 * 幅を決めるのはM3の不確実性2層(構想書8.5)である:
 *   層i  パラメータ不確実性(同一条件の推計値の分布)
 *   層ii 移転誤差(適合度ティアから決まる誤差幅)
 * したがって**幅の分解は、中心値とは別の要因集合で行う。**
 *
 * 対数正規の仮定の下で、レンジの対数幅は
 *   ln(P95/P5) = (z95 − z5) × σ_total,  σ_total = √(σ_i² + σ_ii²)
 * となり、2手法の対数幅の比は σ_total の比に一致する((z95 − z5)が約分される)。
 * よって σ_total を対象に、中心値と**同じ対数空間Shapley**で按分する。
 */

import { computeShapleyContributions } from "./shapley";
import { cvToLognormalSigma } from "../monetization/uncertainty";
import { errorBandCvForTier } from "../monetization/fitness";
import type { ValuationRecord } from "../types/valuation";

/** 幅を決める要因。中心値の `DecompositionFactor` とは別の集合(§冒頭の理由)。 */
export type UncertaintyFactor = "parameterUncertainty" | "transferError";

export const UNCERTAINTY_FACTORS: UncertaintyFactor[] = ["parameterUncertainty", "transferError"];

export interface UncertaintyContribution {
  factor: UncertaintyFactor;
  logContribution: number;
  /** exp(c_i)。幅が何倍になったか。 */
  multiplier: number;
  /** 寄与割合。合計と逆符号の寄与がある場合はnull(F-9と同じ表示規律)。 */
  shareRatio: number | null;
}

export type QuantileDecompositionMode = "multiplicative" | "not_decomposed";

export interface QuantileRangeDecomposition {
  methodIdA: string;
  methodIdB: string;
  /** 対数幅の比(A / B)。not_decomposed のとき null。 */
  widthRatio: number | null;
  mode: QuantileDecompositionMode;
  contributions: UncertaintyContribution[];
  /** not_decomposed の理由。推定で埋めない(D-15)。 */
  notDecomposedReason?: string;
}

/** そのレコードの σ_i(層i:パラメータ不確実性)。 */
function parameterSigma(record: ValuationRecord): number {
  if (record.parameterUncertainty.kind === "not_available") {
    throw new Error(`ValuationRecord ${record.id} は不確実性分布が未取得です。`);
  }
  return record.parameterUncertainty.sigma;
}

/**
 * そのレコードの σ_ii(層ii:移転誤差)。
 * ティアが `not_applicable` の場合、便益移転という行為自体が発生していないため0
 * (M3 D-4.2。「精度が高い」のではなく「移転していない」)。
 */
function transferSigma(record: ValuationRecord): number {
  return record.transferFitness.tier === "not_applicable"
    ? 0
    : cvToLognormalSigma(errorBandCvForTier(record.transferFitness.tier));
}

function totalSigma(sigmaI: number, sigmaII: number): number {
  return Math.sqrt(sigmaI * sigmaI + sigmaII * sigmaII);
}

/**
 * 2つのValuationRecordのレンジ幅の差を、層i・層iiに分解する。
 *
 * どちらかの σ_total が0の場合(不確実性がまったくない = 幅ゼロ)、対数比が定義できないため
 * 分解しない。**幅ゼロを微小値で置き換えない**(F-1・F-3と同じ、推定で埋めない規律)。
 */
export function decomposeQuantileRange(a: ValuationRecord, b: ValuationRecord): QuantileRangeDecomposition {
  if (a.parameterUncertainty.kind === "not_available" || b.parameterUncertainty.kind === "not_available") {
    return {
      methodIdA: a.methodId,
      methodIdB: b.methodId,
      widthRatio: null,
      mode: "not_decomposed",
      contributions: [],
      notDecomposedReason:
        "いずれかの手法で不確実性分布が未取得のため、根拠のないレンジを補わず幅の分解を行いません。",
    };
  }
  const sigmaIA = parameterSigma(a);
  const sigmaIIA = transferSigma(a);
  const sigmaIB = parameterSigma(b);
  const sigmaIIB = transferSigma(b);

  const totalA = totalSigma(sigmaIA, sigmaIIA);
  const totalB = totalSigma(sigmaIB, sigmaIIB);

  if (totalA === 0 || totalB === 0) {
    return {
      methodIdA: a.methodId,
      methodIdB: b.methodId,
      widthRatio: null,
      mode: "not_decomposed",
      contributions: [],
      notDecomposedReason:
        "いずれかの手法の不確実性がゼロで、レンジに幅がありません。幅の比が定義できないため分解しません。",
    };
  }

  const v = (subset: Set<UncertaintyFactor>): number =>
    totalSigma(
      subset.has("parameterUncertainty") ? sigmaIA : sigmaIB,
      subset.has("transferError") ? sigmaIIA : sigmaIIB
    );

  const raw = computeShapleyContributions<UncertaintyFactor>(UNCERTAINTY_FACTORS, v);
  const totalLog = raw.reduce((sum, contribution) => sum + contribution.logContribution, 0);

  // F-9と同じ表示規律:合計と逆符号の寄与がある場合、割合表示を抑止する
  const hasOffsetting = raw.some((c) => c.logContribution !== 0 && Math.sign(c.logContribution) !== Math.sign(totalLog));

  return {
    methodIdA: a.methodId,
    methodIdB: b.methodId,
    widthRatio: totalA / totalB,
    mode: "multiplicative",
    contributions: raw.map((contribution) => ({
      factor: contribution.factor,
      logContribution: contribution.logContribution,
      multiplier: Math.exp(contribution.logContribution),
      shareRatio: hasOffsetting || totalLog === 0 ? null : contribution.logContribution / totalLog,
    })),
  };
}
