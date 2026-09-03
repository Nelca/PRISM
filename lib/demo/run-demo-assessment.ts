import { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import { createIdSequence } from "@core/pipeline/ids";
import {
  demoGeocode,
  excludedCategoriesForSite,
  interfacesByCategoryForSite,
  resolveCriterionForDemo,
  screeningValuationForMaterialIssue,
  SITE_ROWS,
} from "./company";
import type { InteractionState } from "./interaction-state";
import type { UserSiteEntry } from "./site-entry";
import type { PhysicalQuantityInput } from "@core/types/valuation";
import type { ImpactCategory } from "@core/types/common";

const CLIMATE_SITE_ID = "site-070";

export function runDemoAssessment(
  userSites: UserSiteEntry[],
  interactions: InteractionState,
  idSequence: ReturnType<typeof createIdSequence>,
  now: string,
  physicalInputs: PhysicalQuantityInput[] = [],
  activeMaterialIssueTargets: { siteId: string; category: ImpactCategory }[] = []
) {
  const userCategoryBySite = new Map(userSites.map((entry) => [entry.row.id, entry.deepDive.category ?? "water"] as const));
  const activeCategoriesBySite = new Map<string, Set<PhysicalQuantityInput["category"]>>();
  for (const entry of userSites) {
    activeCategoriesBySite.set(entry.row.id, new Set([entry.deepDive.category ?? "water"]));
  }
  for (const physicalInput of physicalInputs) {
    const categories = activeCategoriesBySite.get(physicalInput.siteId) ?? new Set();
    categories.add(physicalInput.category);
    activeCategoriesBySite.set(physicalInput.siteId, categories);
  }
  for (const target of activeMaterialIssueTargets) {
    const categories = activeCategoriesBySite.get(target.siteId) ?? new Set();
    categories.add(target.category);
    activeCategoriesBySite.set(target.siteId, categories);
  }
  const manualOverrides = new Set([
    ...userSites
      .filter((entry) => entry.deepDive.forcePromote)
      .map((entry) => `${entry.row.id}-mi-${entry.deepDive.category ?? "water"}`),
    "site-042-mi-water",
    `${CLIMATE_SITE_ID}-mi-climate`,
    ...physicalInputs.map((entry) => `${entry.siteId}-mi-${entry.category}`),
    ...activeMaterialIssueTargets.map((entry) => `${entry.siteId}-mi-${entry.category}`),
  ]);
  const manualDemotions = new Set<string>();
  for (const [materialIssueId, mode] of interactions.depthOverrides) {
    if (mode === "promote") {
      manualDemotions.delete(materialIssueId);
      manualOverrides.add(materialIssueId);
    } else {
      // 最新の明示操作を優先する。既定の手動昇格と同居させるとcoreでは昇格が勝つため除外する。
      manualOverrides.delete(materialIssueId);
      manualDemotions.add(materialIssueId);
    }
  }

  return runAssessmentPipeline({
    rows: [...SITE_ROWS, ...userSites.map((entry) => entry.row)],
    geocode: demoGeocode,
    interfacesByCategoryForSite: (site) => {
      const base = interfacesByCategoryForSite(site);
      const reusableInterfaces = Object.values(base)[0] ?? [];
      const directCategory = userCategoryBySite.get(site.id);
      if (directCategory) {
        const userBase: Partial<Record<ImpactCategory, typeof reusableInterfaces>> = {
          [directCategory]: reusableInterfaces,
        };
        for (const category of activeCategoriesBySite.get(site.id) ?? []) userBase[category] = reusableInterfaces;
        return userBase;
      }
      for (const category of activeCategoriesBySite.get(site.id) ?? []) {
        base[category] = reusableInterfaces;
      }
      return base;
    },
    excludedCategoriesForSite: (site) => [
      ...new Set([...excludedCategoriesForSite(), ...(activeCategoriesBySite.get(site.id) ?? [])]),
    ],
    resolveCriterion: resolveCriterionForDemo,
    screeningValuationForMaterialIssue: (issue) =>
      issue.impactCategory === "climate" || issue.impactCategory === "water"
        ? screeningValuationForMaterialIssue(issue.siteId, issue.impactCategory)
        : null,
    promotionOptions: { manualOverrides, manualDemotions },
    idSequence,
    now,
  });
}
