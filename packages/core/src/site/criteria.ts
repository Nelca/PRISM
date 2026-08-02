/**
 * M1 D-2:TNFD LEAP L3の5基準判定(CriteriaMet)。
 * 参照元: docs/requirements/m1-target-definition.md §2
 *
 * NatureInterface.layerType(5値)とCriteriaMetの5基準は1:1に対応しない(plan file参照)。
 * protected_area・kbaの2つはhighBiodiversityImportanceという1つの基準にOR集約され、
 * ecosystem_integrityという1つのlayerTypeからは、水準(highEcosystemIntegrity)しか
 * 導出しない。rapidIntegrityDecline(急速な劣化=トレンド)はMVPのlayerType一覧に
 * 対応する専用データソースがなく、既定ではfalseのままとする(推定で埋めない)。
 * 傾向データを持つ呼び出し側は、resolveCriterionをカスタム実装して上書きできる。
 */

import type { CriteriaMet } from "../types/site";
import type { NatureInterface } from "../types/site";

export type CriterionKey = keyof CriteriaMet;

export function defaultResolveCriterion(iface: NatureInterface): CriterionKey | null {
  switch (iface.layerType) {
    case "protected_area":
    case "kba":
      return "highBiodiversityImportance";
    case "water_stress":
      return "waterStress";
    case "dependency_impact":
      return "likelySignificantDependencyImpact";
    case "ecosystem_integrity":
      return "highEcosystemIntegrity";
  }
}

/**
 * boolean値はそのまま使う。数値(STARスコア等)は「0より大きければ基準を満たす」という
 * 構造的な既定判定にする(ドメイン固有の閾値を独自に発明しない)。カテゴリ固有の
 * 閾値判定が必要な場合、呼び出し側がrawResultを事前にboolean化しておく。
 */
function isCriterionMet(rawResult: boolean | number): boolean {
  return typeof rawResult === "boolean" ? rawResult : rawResult > 0;
}

export function evaluateCriteriaMet(
  interfaces: NatureInterface[],
  resolveCriterion: (iface: NatureInterface) => CriterionKey | null = defaultResolveCriterion
): CriteriaMet {
  const criteria: CriteriaMet = {
    highEcosystemIntegrity: false,
    rapidIntegrityDecline: false,
    highBiodiversityImportance: false,
    waterStress: false,
    likelySignificantDependencyImpact: false,
  };

  for (const iface of interfaces) {
    const criterion = resolveCriterion(iface);
    if (criterion === null) {
      continue;
    }
    if (isCriterionMet(iface.rawResult)) {
      criteria[criterion] = true;
    }
  }

  return criteria;
}
