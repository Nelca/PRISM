/**
 * M8 D-4:ライセンスゲーティングを考慮した感応度スコアの再計算。
 * 参照元: docs/requirements/m8-ledger-versioning.md §4
 *
 * pending_reviewのデータソースに依存する評価・判定は実行しない。M1のcomputeSensitivityScore
 * (types/site.ts)は全5基準を単純カウントするため、ライセンス保留中の基準を除外する変種を
 * ここに実装する(M1の型・関数自体は変更しない)。
 */

import { isLicenseBlocked } from "../types/ledger";
import type { LicenseGate } from "../types/ledger";
import type { CriteriaMet } from "../types/site";

export interface GatedSensitivityResult {
  /** ライセンス保留中の基準を除いた、評価可能な基準のみでの充足数。 */
  score: number;
  /** 評価対象から除外された(保留中の)基準名。 */
  pendingCriteria: (keyof CriteriaMet)[];
}

/**
 * gatesで指定された基準のうちライセンスがブロックされているものは、真偽によらず
 * 集計から除外する(要件定義書D-4の具体例:WDPA pending時、highBiodiversityImportance基準を
 * 除いた残り4基準の充足数のみで暫定算出)。
 */
export function computeGatedSensitivityScore(
  criteria: CriteriaMet,
  gates: Partial<Record<keyof CriteriaMet, LicenseGate>>
): GatedSensitivityResult {
  const pendingCriteria: (keyof CriteriaMet)[] = [];
  let score = 0;

  for (const key of Object.keys(criteria) as (keyof CriteriaMet)[]) {
    const gate = gates[key];
    if (gate && isLicenseBlocked(gate)) {
      pendingCriteria.push(key);
      continue;
    }
    if (criteria[key]) {
      score += 1;
    }
  }

  return { score, pendingCriteria };
}
