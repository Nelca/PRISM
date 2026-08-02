/**
 * templates/配下の記入例が、実際にloadCompanyDataset()→packages/core/src/pipeline/*を
 * 最後まで通ることを検証する(実装計画フェーズ6の検証)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCompanyDataset } from "./load-company-dataset";
import { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import { runValuationPipeline } from "@core/pipeline/valuation-pipeline";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import { runDisclosurePipeline } from "@core/pipeline/disclosure-pipeline";
import { createIdSequence } from "@core/pipeline/ids";
import { ALL_PLUGINS } from "@core/monetization/registry";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeValuationRecord } from "@core/types/valuation";
import type { EvidenceCandidate } from "@core/disclosure/evidence-match";
import type { DisclosureClaim } from "@core/types/disclosure";

const TEMPLATES_DIR = join(__dirname, "templates");
const NOW = "2027-02-14T09:12:00Z";

function readTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), "utf-8");
}

describe("templates/の記入例からM1〜M8を通しで実行できる", () => {
  it("loadCompanyDataset()が記入例を検証済みCompanyDatasetとして返す", () => {
    const { dataset, errors } = loadCompanyDataset(
      readTemplate("sites.csv"),
      readTemplate("nature-interfaces.csv"),
      readTemplate("engagement-config.json")
    );
    expect(errors).toHaveLength(0);
    expect(dataset).not.toBeNull();
  });

  it("記入例のデータでM1→M2→M3→M4→M6→M7が最後まで通る", () => {
    const { dataset } = loadCompanyDataset(
      readTemplate("sites.csv"),
      readTemplate("nature-interfaces.csv"),
      readTemplate("engagement-config.json")
    );
    if (!dataset) throw new Error("dataset must be loaded for this test");

    const idSequence = createIdSequence("ae");
    const targetSiteId = dataset.engagementConfig.deepDive.siteId;

    // M1→M2
    const assessment = runAssessmentPipeline({
      rows: dataset.siteRows,
      geocode: (address) => (address ? { lat: 0, lng: 0 } : null),
      interfacesByCategoryForSite: (site) => ({
        [dataset.engagementConfig.deepDive.category]: dataset.natureInterfaceLookupsBySite[site.id] ?? [],
      }),
      excludedCategoriesForSite: () => [dataset.engagementConfig.deepDive.category],
      screeningValuationForMaterialIssue: (issue): ExchangeValuationRecord => ({
        id: `screen-${issue.id}`,
        methodId: "replacement-cost",
        methodVersion: "1.0.0",
        physicalQuantityId: `pq-${issue.siteId}-screening`,
        siteId: issue.siteId,
        aopCode: "not_applicable",
        aopSourceLabel: "screening",
        aopMappingConfidence: "high",
        quantileRange: issue.siteId === targetSiteId ? { p5: 8_000_000, p50: 10_000_000, p95: 12_000_000 } : { p5: 100, p50: 100, p95: 100 },
        parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
        transferFitness: { tier: "not_applicable" },
        discountRate: null,
        discountRateStatus: "no_time_dimension",
        geographicCalibration: {
          ...dataset.engagementConfig.calibration,
          sourceRegion: dataset.engagementConfig.deepDive.sourceRegion,
          targetRegion: dataset.engagementConfig.deepDive.targetRegion,
        },
        scopeExclusions: [],
        recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
        assumptionEntryIds: [],
        recalculationHash: "placeholder:screening",
        valueConcept: "exchange",
        centralValue: exchangeAmount(issue.siteId === targetSiteId ? 10_000_000 : 100),
      }),
      idSequence,
      now: NOW,
    });

    const promoted = assessment.depthDecisions.filter((d) => d.depth === "deep_dive" && d.materialIssueId.includes(targetSiteId));
    expect(promoted.length).toBeGreaterThan(0);

    // M3(深掘り)→M4
    const valuation = runValuationPipeline({
      materialIssueIds: promoted.map((d) => d.materialIssueId),
      deepDiveConfigForMaterialIssue: () => ({
        physicalQuantityId: dataset.engagementConfig.physicalQuantityId,
        input: dataset.engagementConfig.deepDive,
        config: dataset.engagementConfig.methodConfig,
        calibration: dataset.engagementConfig.calibration,
        plugins: ALL_PLUGINS,
        calibrationSetVersion: "ifvi-water-consumption-v1",
        reconciliationFunctionVersion: "ifvi-reconciliation-v1",
      }),
      decompositionVersions: {
        algorithmVersion: "shapley-v1",
        cicesMatchLevel: "group",
        aopMappingVersion: "aop-mapping-v1",
        f3ThresholdVersion: "f3-v1",
        f8ThresholdVersion: "f8-v1",
      },
      idSequence,
      now: NOW,
    });

    const records = Object.values(valuation.valuationRecordsByMaterialIssue).flat();
    expect(records.length).toBeGreaterThan(0);

    // countermeasureのsourceValuationMethodId(手法ID)を、実際に生成されたValuationRecordのIDに解決する
    // (amountは既にengagement-config.tsがExchangeAmountとして構築済み)
    const recordIdByMethodId = new Map(records.map((r) => [r.methodId, r.id]));
    const countermeasures = dataset.engagementConfig.countermeasures.map((cm) => ({
      type: cm.type,
      targetSiteId: cm.targetSiteId,
      investmentCost: cm.investmentCost,
      avoidedNatureCost: cm.avoidedNatureCost.map((ac) => ({
        year: ac.year,
        amount: ac.amount,
        sourceValuationRecordId: recordIdByMethodId.get(ac.sourceValuationMethodId) ?? ac.sourceValuationMethodId,
      })),
    }));

    const replacementCost = records.find((r) => r.methodId === "replacement-cost") as ExchangeValuationRecord | undefined;
    expect(replacementCost).toBeDefined();

    // M6
    const decision = runDecisionPipeline({
      id: `dr-${targetSiteId}`,
      decisionTarget: "investment_approval",
      decisionMaker: "テスト",
      decisionDate: "2027-02-14",
      approvalThreshold: dataset.engagementConfig.approvalThreshold,
      relatedValuationRecords: [replacementCost!],
      baselineNpv: dataset.engagementConfig.baselineNpv,
      countermeasures,
      valuationRecordsById: { [replacementCost!.id]: replacementCost! },
      bindingMechanism: dataset.engagementConfig.bindingMechanism,
      idSequence,
      now: NOW,
    });
    expect(["does_not_cross", "crosses", "pending"]).toContain(decision.decisionRecord.verdict);

    // M7
    const claims: DisclosureClaim[] = dataset.engagementConfig.disclosureClaims.map((c) => ({
      id: c.id,
      sourceDocument: c.sourceDocument,
      sourcePageOrSection: c.sourcePageOrSection,
      rawText: c.rawText,
      claimType: c.claimType,
      extractedMetadata: {
        category: c.category,
        quantityMentioned: c.quantityValue !== undefined && c.quantityUnit ? { value: c.quantityValue, unit: c.quantityUnit } : null,
        periodMentioned:
          c.periodStartYear !== undefined && c.periodEndYear !== undefined
            ? { startYear: c.periodStartYear, endYear: c.periodEndYear }
            : null,
        scopeMentioned: c.scopeMentioned ?? null,
      },
      extractionConfidence: c.extractionConfidence,
    }));

    const disclosure = runDisclosurePipeline({
      claims,
      candidatesForClaim: (claim): EvidenceCandidate[] =>
        records
          .filter((r) => r.siteId === targetSiteId)
          .map((r) => ({
            recordId: r.id,
            category: claim.extractedMetadata.category,
            period: claim.extractedMetadata.periodMentioned,
            scope: claim.extractedMetadata.scopeMentioned,
            transferFitnessTier: r.transferFitness.tier,
          })),
      idSequence,
      now: NOW,
    });
    expect(disclosure.gapFindings).toHaveLength(claims.length);
  });
});
