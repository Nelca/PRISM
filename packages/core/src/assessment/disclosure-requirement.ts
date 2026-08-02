/**
 * M2 D-2:開示必須性(カテゴリ×現行規制の対応表)。
 * 参照元: docs/requirements/m2-assessment-execution.md §2
 *
 * 構想書のSSBJタイムライン(気候先行、自然関連(水・汚染含む)は2029〜2031年見込み)から
 * 機械的に導出する。恣意的な数値ではない。将来の自然カテゴリ全般(現行のImpactCategoryに
 * 含まれない生物多様性等)は「低」に該当するが、MVPのImpactCategory(climate/water/pollution)
 * には該当するカテゴリがないため、この対応表には含めない。
 */

import type { ImpactCategory } from "../types/common";

export const DISCLOSURE_REQUIREMENT_TABLE: Record<ImpactCategory, number> = {
  climate: 3, // 高:SSBJが既に義務化
  water: 2, // 中:自然関連、2029〜2031年見込み
  pollution: 2, // 中:自然関連、2029〜2031年見込み
};

export function getDisclosureRequirement(category: ImpactCategory): number {
  return DISCLOSURE_REQUIREMENT_TABLE[category];
}
