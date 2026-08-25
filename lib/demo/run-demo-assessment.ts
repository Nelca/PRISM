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

const CLIMATE_SITE_ID = "site-070";

export function runDemoAssessment(
  userSites: UserSiteEntry[],
  interactions: InteractionState,
  idSequence: ReturnType<typeof createIdSequence>,
  now: string
) {
  const manualOverrides = new Set([
    ...userSites.filter((entry) => entry.deepDive.forcePromote).map((entry) => `${entry.row.id}-mi-water`),
    "site-042-mi-water",
    `${CLIMATE_SITE_ID}-mi-climate`,
  ]);
  const manualDemotions = new Set<string>();
  for (const [materialIssueId, mode] of interactions.depthOverrides) {
    if (mode === "promote") manualOverrides.add(materialIssueId);
    else manualDemotions.add(materialIssueId);
  }

  return runAssessmentPipeline({
    rows: [...SITE_ROWS, ...userSites.map((entry) => entry.row)],
    geocode: demoGeocode,
    interfacesByCategoryForSite,
    excludedCategoriesForSite,
    resolveCriterion: resolveCriterionForDemo,
    screeningValuationForMaterialIssue: (issue) => screeningValuationForMaterialIssue(issue.siteId, issue.impactCategory),
    promotionOptions: { manualOverrides, manualDemotions },
    idSequence,
    now,
  });
}
