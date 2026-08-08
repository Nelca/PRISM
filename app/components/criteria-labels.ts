/**
 * TNFD LEAP L3の5基準と、評価できなかった理由の表示ラベル(GAP-08 / GAP-13)。
 * サーバーコンポーネントから呼べる純粋な定数・関数のみを置く(tag-utils.tsと同じ方針)。
 */

import type { CriterionKey, CriterionUnavailabilityReason, MaterialIssue } from "@core/types/site";
import { evaluatedCriteriaCount } from "@core/types/site";

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  highEcosystemIntegrity: "生態系の完全性が高い",
  rapidIntegrityDecline: "急速に劣化している",
  highBiodiversityImportance: "生物多様性の重要性が高い",
  waterStress: "水ストレスが高い",
  likelySignificantDependencyImpact: "依存・影響が大きい可能性",
};

export const UNAVAILABILITY_LABEL: Record<CriterionUnavailabilityReason, string> = {
  license_pending: "データ利用契約の確認待ち",
  no_data_source: "判定に使えるデータ源がない",
  site_not_located: "拠点の位置が特定できず未評価",
};

/** 「2/4」のように、評価できた基準数を分母にした表記を返す。分母を常に5にしない。 */
export function sensitivityFraction(issue: MaterialIssue): string {
  return `${issue.sensitivityScore}/${evaluatedCriteriaCount(issue.criteriaMet, issue.unevaluatedCriteria)}`;
}

/** 評価できなかった基準の内訳を1行の文にする。すべて評価できた場合は null。 */
export function unevaluatedCriteriaNote(issue: MaterialIssue): string | null {
  if (issue.unevaluatedCriteria.length === 0) {
    return null;
  }
  const details = issue.unevaluatedCriteria
    .map((entry) => {
      const source = entry.dataSources.length > 0 ? `:${entry.dataSources.join("・")}` : "";
      return `${CRITERION_LABEL[entry.criterion]}(${UNAVAILABILITY_LABEL[entry.reason]}${source})`;
    })
    .join("、");
  const total = Object.keys(issue.criteriaMet).length;
  const evaluated = evaluatedCriteriaCount(issue.criteriaMet, issue.unevaluatedCriteria);
  return `${total}基準中${evaluated}基準で評価しています。未評価:${details}`;
}
