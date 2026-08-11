/**
 * M1:生態系完全性トレンド(`rapidIntegrityDecline`)のboolean化。
 * 参照元: docs/data/ecosystem-integrity-trend-notes.md、docs/data/acquisition-runbook.md §3.9(A-11)
 *
 * データ源: Sun, T., Hughes, A. C., He, K., & Yu, L. (2026). "Ecological Integrity Index,
 * timely annual tracking of biodiversity change." Scientific Data. CC BY 4.0.
 * Zenodo record 15598796(年次2015-2023・1kmラスタ)。BII・Global Human Modification
 * footprint・NPPを合成した複合指標で、値は0(完全性が最も低い)〜1(最も高い)。
 *
 * 「急速な劣化」の閾値定義について:このデータ自体はIFVI/Aqueductと同様の外部の実測値だが、
 * 「何%の低下を"急速"と呼ぶか」はデータではなく人間の判断であり、独自の閾値を発明しない
 * (D-15と同じ原則を閾値選択にも適用する)。ここではIUCN Red List Categories and Criteria
 * v3.1のCriterion A2(個体数減少によるVulnerable判定:10年で30%以上の減少)を借用する。
 * EIIは個体数そのものではないが、STAR(`app.ibat-alliance.org`のSTARブリーフィングノート、
 * IUCN Red Listに基づく)など生物多様性分野の既存指標がIUCN基準を援用する前例と整合させた
 * (`docs/data/ecosystem-integrity-trend-notes.md` §5)。この判断はE-8として記録されている。
 */

export interface EcologicalIntegrityTrend {
  startValue: number;
  startYear: number;
  endValue: number;
  endYear: number;
}

/** IUCN Red List Categories and Criteria v3.1、Criterion A2(Vulnerable)の閾値。 */
export const RAPID_DECLINE_THRESHOLD_FRACTION = 0.3;

/**
 * `startValue`から`endValue`への相対的な低下率が閾値以上なら「急速な劣化」とする。
 * `startValue <= 0`の場合は低下率(分母)を定義できないためfalseを返す
 * (完全性が既に最低の状態であり、これ以上の相対的な低下を測れない)。
 */
export function isRapidIntegrityDecline(trend: EcologicalIntegrityTrend): boolean {
  if (trend.startValue <= 0) {
    return false;
  }
  const relativeDecline = (trend.startValue - trend.endValue) / trend.startValue;
  return relativeDecline >= RAPID_DECLINE_THRESHOLD_FRACTION;
}
