/**
 * M3 D-4・D-7:層i(パラメータ不確実性)と層ii(移転誤差)の対数空間での乗法合成、
 * およびモンテカルロによる分位点算出。
 * 参照元: docs/requirements/m3-monetization-engine.md §4・§7、design-rationale-log D-19
 *
 * 層iと層iiは独立した誤差として対数空間で加算(実空間では乗算)する。
 * 単純な幅の合算(例:20%+40%=60%)より穏やかな挙動になる
 * (対数正規分布の変動係数(CV)は二乗和平方根に近い形で合成される)。
 */

import type { Distribution, QuantileRange } from "../types/common";
import type { TransferFitness } from "../types/valuation";
import { errorBandCvForTier } from "./fitness";

export const MONTE_CARLO_ITERATIONS = 10_000;

/** 変動係数(CV)を対数正規分布のsigmaパラメータに変換する。CV = sqrt(exp(sigma^2) - 1)の逆関数。 */
export function cvToLognormalSigma(cv: number): number {
  return Math.sqrt(Math.log(1 + cv * cv));
}

/** Box-Muller法による標準正規乱数の生成。 */
function sampleStandardNormal(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON); // 0を避ける(log(0)対策)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sortedValues: number[], p: number): number {
  const index = p * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export interface CombineUncertaintyOptions {
  iterations?: number;
  /** テストで再現可能にするため注入できる。省略時はMath.random(本番用)。 */
  rng?: () => number;
}

/**
 * 較正後の中心値に、層i(パラメータ不確実性)と層ii(移転誤差、tierがA/B/Cの場合のみ)を
 * 対数空間で乗法合成し、モンテカルロでP5/P50/P95を算出する。
 * tierが"not_applicable"の場合、層iiは寄与しない(層iのみで分布を決める)。
 */
export function combineUncertainty(
  calibratedCentralValue: number,
  parameterUncertainty: Distribution,
  transferFitness: TransferFitness,
  options: CombineUncertaintyOptions = {}
): QuantileRange {
  const iterations = options.iterations ?? MONTE_CARLO_ITERATIONS;
  const rng = options.rng ?? Math.random;

  const sigmaII =
    transferFitness.tier === "not_applicable" ? 0 : cvToLognormalSigma(errorBandCvForTier(transferFitness.tier));

  const samples: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const zI = sampleStandardNormal(rng);
    const logFactor = parameterUncertainty.mu + zI * parameterUncertainty.sigma + (sigmaII > 0 ? sampleStandardNormal(rng) * sigmaII : 0);
    samples[i] = calibratedCentralValue * Math.exp(logFactor);
  }
  samples.sort((a, b) => a - b);

  return {
    p5: percentile(samples, 0.05),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  };
}
