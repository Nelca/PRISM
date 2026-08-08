/**
 * M1:トップレベル。カテゴリごとのNatureInterface群からMaterialIssue[]を組み立てる。
 * 参照元: docs/requirements/m1-target-definition.md §1(MaterialIssue = 拠点×影響カテゴリの組)
 *
 * どのNatureInterfaceをどのカテゴリの判定に使うかはこの関数では決めない(plan file論点4)。
 * 呼び出し側(データ取込層)がカテゴリごとに明示的に振り分けたNatureInterface群を渡す。
 */

import type { ImpactCategory } from "../types/common";
import { computeSensitivityScore } from "../types/site";
import type { CriterionKey, MaterialIssue, NatureInterface, UnevaluatedCriterion } from "../types/site";
import { assessCriteria } from "./criteria";

export function buildMaterialIssues(
  siteId: string,
  interfacesByCategory: Partial<Record<ImpactCategory, NatureInterface[]>>,
  resolveCriterion?: (iface: NatureInterface) => CriterionKey | null
): MaterialIssue[] {
  const issues: MaterialIssue[] = [];

  for (const [category, interfaces] of Object.entries(interfacesByCategory) as [ImpactCategory, NatureInterface[]][]) {
    const { criteriaMet, unevaluatedCriteria } = assessCriteria(interfaces, resolveCriterion);

    issues.push({
      id: `${siteId}-mi-${category}`,
      siteId,
      impactCategory: category,
      // 評価不能な基準は criteriaMet 上で false のままなので、充足数カウントに入らない(M8 D-4)。
      sensitivityScore: computeSensitivityScore(criteriaMet),
      criteriaMet,
      unevaluatedCriteria,
      excluded: false,
      assumptionEntryIds: [],
    });
  }

  return issues;
}

const UNEVALUATED_CRITERIA: MaterialIssue["criteriaMet"] = {
  highEcosystemIntegrity: false,
  rapidIntegrityDecline: false,
  highBiodiversityImportance: false,
  waterStress: false,
  likelySignificantDependencyImpact: false,
};

const ALL_CRITERIA_NOT_LOCATED: UnevaluatedCriterion[] = (
  Object.keys(UNEVALUATED_CRITERIA) as CriterionKey[]
).map((criterion) => ({ criterion, reason: "site_not_located" as const, dataSources: [] }));

/**
 * M1 D-3:座標・住所ともに解決できずLocateを実行できなかった場合、MaterialIssueを生成しない
 * のではなく、excluded=true・exclusionReason付きの監査可能なレコードとして残す
 * (「生成せず」は「評価を実行せず」の意であり、除外の事実自体は記録する。M2の除外理由記録と
 * 同じ原則)。5基準はいずれも評価していないためすべてfalse、sensitivityScoreは0とする。
 */
export function buildExcludedMaterialIssue(siteId: string, category: ImpactCategory, exclusionReason: string): MaterialIssue {
  return {
    id: `${siteId}-mi-${category}`,
    siteId,
    impactCategory: category,
    sensitivityScore: 0,
    criteriaMet: UNEVALUATED_CRITERIA,
    unevaluatedCriteria: ALL_CRITERIA_NOT_LOCATED,
    excluded: true,
    exclusionReason,
    assumptionEntryIds: [],
  };
}
