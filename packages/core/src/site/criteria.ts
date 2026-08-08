/**
 * M1 D-2:TNFD LEAP L3の5基準判定(CriteriaMet)。
 * 参照元: docs/requirements/m1-target-definition.md §2、docs/requirements/m8-ledger-versioning.md §4
 *
 * NatureInterface.layerType(5値)とCriteriaMetの5基準は1:1に対応しない(plan file参照)。
 * protected_area・kbaの2つはhighBiodiversityImportanceという1つの基準にOR集約され、
 * ecosystem_integrityという1つのlayerTypeからは、水準(highEcosystemIntegrity)しか
 * 導出しない。rapidIntegrityDecline(急速な劣化=トレンド)はMVPのlayerType一覧に
 * 対応する専用データソースがなく、既定ではfalseのままとする(推定で埋めない)。
 * 傾向データを持つ呼び出し側は、resolveCriterionをカスタム実装して上書きできる。
 */

import { isLicenseBlocked } from "../types/ledger";
import type { CriteriaMet, CriterionKey, NatureInterface, UnevaluatedCriterion } from "../types/site";

export type { CriterionKey };

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

const EMPTY_CRITERIA: CriteriaMet = {
  highEcosystemIntegrity: false,
  rapidIntegrityDecline: false,
  highBiodiversityImportance: false,
  waterStress: false,
  likelySignificantDependencyImpact: false,
};

export function evaluateCriteriaMet(
  interfaces: NatureInterface[],
  resolveCriterion: (iface: NatureInterface) => CriterionKey | null = defaultResolveCriterion
): CriteriaMet {
  return assessCriteria(interfaces, resolveCriterion).criteriaMet;
}

export interface CriteriaAssessment {
  criteriaMet: CriteriaMet;
  /** 評価できなかった基準。空配列なら5基準すべてを評価した。 */
  unevaluatedCriteria: UnevaluatedCriterion[];
}

/**
 * 5基準を判定し、あわせて「評価できなかった基準とその理由」を返す(GAP-08 / GAP-13)。
 *
 * **ライセンス保留の扱い(M8 D-4):** `licenseMode: "pending_review"` のデータソースは、
 * 契約未締結のため判定に使ってはならない。当該基準を支えるNatureInterfaceが**すべて**
 * 保留中の場合、その基準は `license_pending` として評価対象から外し、`criteriaMet` は
 * falseのままとする(= 感応度スコアの充足数に加算されない)。1件でも利用可能な
 * データソースがあれば、そちらだけで判定する(保留中のレイヤの値は無視する)。
 *
 * **データソース不在の扱い:** 対応するNatureInterfaceが1件も渡されていない基準は
 * `no_data_source` とする。「falseだった」のではなく「評価していない」ことを区別する
 * ためであり、これがないと感応度スコアの分母が常に5であるかのように読めてしまう。
 *
 * `computeGatedSensitivityScore()`(M8)を呼び出さない理由: あちらは「基準 → LicenseGate」の
 * 対応表を呼び出し側が既に持っている前提のAPIで、データソース不在という状態を持たない。
 * ここではNatureInterface群から対応表と不在の両方を導出するため、判定を1箇所にまとめている。
 */
export function assessCriteria(
  interfaces: NatureInterface[],
  resolveCriterion: (iface: NatureInterface) => CriterionKey | null = defaultResolveCriterion
): CriteriaAssessment {
  const byCriterion = new Map<CriterionKey, NatureInterface[]>();
  for (const iface of interfaces) {
    const criterion = resolveCriterion(iface);
    if (criterion === null) {
      continue;
    }
    const list = byCriterion.get(criterion);
    if (list) {
      list.push(iface);
    } else {
      byCriterion.set(criterion, [iface]);
    }
  }

  const criteriaMet: CriteriaMet = { ...EMPTY_CRITERIA };
  const unevaluatedCriteria: UnevaluatedCriterion[] = [];

  for (const criterion of Object.keys(EMPTY_CRITERIA) as CriterionKey[]) {
    const candidates = byCriterion.get(criterion) ?? [];

    if (candidates.length === 0) {
      unevaluatedCriteria.push({ criterion, reason: "no_data_source", dataSources: [] });
      continue;
    }

    const usable = candidates.filter((iface) => !isLicenseBlocked({ dataSourceId: iface.dataSource, licenseMode: iface.licenseMode }));

    if (usable.length === 0) {
      unevaluatedCriteria.push({
        criterion,
        reason: "license_pending",
        dataSources: [...new Set(candidates.map((iface) => iface.dataSource))],
      });
      continue;
    }

    criteriaMet[criterion] = usable.some((iface) => isCriterionMet(iface.rawResult));
  }

  return { criteriaMet, unevaluatedCriteria };
}
