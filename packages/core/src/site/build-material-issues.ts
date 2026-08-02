/**
 * M1:トップレベル。カテゴリごとのNatureInterface群からMaterialIssue[]を組み立てる。
 * 参照元: docs/requirements/m1-target-definition.md §1(MaterialIssue = 拠点×影響カテゴリの組)
 *
 * どのNatureInterfaceをどのカテゴリの判定に使うかはこの関数では決めない(plan file論点4)。
 * 呼び出し側(データ取込層)がカテゴリごとに明示的に振り分けたNatureInterface群を渡す。
 */

import type { ImpactCategory } from "../types/common";
import { computeSensitivityScore } from "../types/site";
import type { MaterialIssue, NatureInterface } from "../types/site";
import { evaluateCriteriaMet } from "./criteria";
import type { CriterionKey } from "./criteria";

export function buildMaterialIssues(
  siteId: string,
  interfacesByCategory: Partial<Record<ImpactCategory, NatureInterface[]>>,
  resolveCriterion?: (iface: NatureInterface) => CriterionKey | null
): MaterialIssue[] {
  const issues: MaterialIssue[] = [];

  for (const [category, interfaces] of Object.entries(interfacesByCategory) as [ImpactCategory, NatureInterface[]][]) {
    const criteriaMet = evaluateCriteriaMet(interfaces, resolveCriterion);

    issues.push({
      id: `${siteId}-mi-${category}`,
      siteId,
      impactCategory: category,
      sensitivityScore: computeSensitivityScore(criteriaMet),
      criteriaMet,
      excluded: false,
      assumptionEntryIds: [],
    });
  }

  return issues;
}
