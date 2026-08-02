/**
 * M3 D-5:適合度ティア(A/B/C)の閾値。
 * 参照元: docs/requirements/m3-monetization-engine.md §5
 *
 * 「3段階のティア」自体はPRISM独自の設計判断(境界線に既存文献の裏付けはない)。
 * 各ティアに割り当てる誤差幅は、便益移転誤差の実証研究(Rosenberger 2015、
 * Johnston & Rosenberger 2010、Ready & Navrud、Brander et al. 2006)を
 * アンカーとして設定した。0.8/0.5という閾値・±20%/±40%/±75%という誤差幅は
 * いずれも暫定値であり、フェーズ0の実データで見直す(§5.4)。
 */

export interface FitnessDimensions {
  ecologicalFit: number;
  socioeconomicFit: number;
  serviceDefinitionFit: number;
  temporalDistance: number;
  spatialScaleFit: number;
}

export type FitnessTier = "A" | "B" | "C";

export interface FitnessTierResult {
  tier: FitnessTier;
  /** 5次元の加重幾何平均(均等加重)。 */
  compositeScore: number;
  /**
   * 層iiの誤差幅(変動係数、CV)。ティアA=0.20、B=0.40、C=0.75。
   * uncertainty.ts の層ii分布に、この値をそのまま使う。
   */
  errorBandCv: number;
}

const TIER_A_THRESHOLD = 0.8;
const TIER_B_THRESHOLD = 0.5;

const ERROR_BAND_CV: Record<FitnessTier, number> = {
  A: 0.2,
  B: 0.4,
  C: 0.75,
};

/** uncertainty.ts が層iiの誤差幅を導出する際に再利用する(定数の重複定義を避ける)。 */
export function errorBandCvForTier(tier: FitnessTier): number {
  return ERROR_BAND_CV[tier];
}

export function computeFitnessTier(dimensions: FitnessDimensions): FitnessTierResult {
  const values = [
    dimensions.ecologicalFit,
    dimensions.socioeconomicFit,
    dimensions.serviceDefinitionFit,
    dimensions.temporalDistance,
    dimensions.spatialScaleFit,
  ];

  // 均等加重の幾何平均: (v1 × v2 × ... × v5) ^ (1/5)
  const product = values.reduce((acc, v) => acc * v, 1);
  const compositeScore = product ** (1 / values.length);

  const tier: FitnessTier =
    compositeScore >= TIER_A_THRESHOLD ? "A" : compositeScore >= TIER_B_THRESHOLD ? "B" : "C";

  return { tier, compositeScore, errorBandCv: ERROR_BAND_CV[tier] };
}
