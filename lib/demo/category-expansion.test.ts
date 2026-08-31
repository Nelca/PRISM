import { describe, expect, it } from "vitest";
import { getPluginsForCategory } from "@core/monetization/registry";
import type { PollutionReleaseInput } from "@core/types/valuation";
import { buildCategoryExpansionRuntime } from "@/lib/pipeline/category-expansion-runtime";
import { DEMO_CATEGORY_EXPANSION_BATCHES, DEMO_CATEGORY_EXPANSION_RECORDS } from "./category-expansion-data";
import { emptyInteractionState } from "./interaction-state";
import { runDemoPipeline } from "./run-demo-pipeline";

const input: PollutionReleaseInput = {
  category: "pollution",
  physicalQuantity: 10,
  unit: "kg",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
  reportingYear: 2023,
  prtrListVersion: "2023",
  facilityId: "facility-1",
  prtrSubstanceCode: "009",
  casRns: ["107-13-1"],
  releaseMedium: "air",
  sourceKind: "customer_prtr",
  sourceRecordId: "row-1",
  sourceRecordHash: "sha256:row-1",
};

describe("追加カテゴリのM1〜M8接続", () => {
  it("配布サンプルと同じPRTR・廃棄物・土地利用データをデモ算定へ接続する", async () => {
    const expansion = await buildCategoryExpansionRuntime(
      DEMO_CATEGORY_EXPANSION_RECORDS,
      DEMO_CATEGORY_EXPANSION_BATCHES,
      new Date("2026-08-29T00:00:00+09:00")
    );
    const result = runDemoPipeline({
      userSites: [],
      interactions: emptyInteractionState(),
      rngSeed: 42,
      physicalInputs: expansion.physicalInputs,
      activeMaterialIssueTargets: expansion.activeMaterialIssueTargets,
      deepDiveConfigsByMaterialIssue: expansion.deepDiveConfigsByMaterialIssue,
      coverageByMaterialIssue: expansion.coverageByMaterialIssue,
      methodAvailabilityByMaterialIssue: expansion.methodAvailabilityByMaterialIssue,
      inputBatchHashes: expansion.inputBatchHashes,
      financialEffectSourceHashes: expansion.financialEffectSourceHashes,
    });

    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-pollution"]).toHaveLength(2);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-waste"]).toHaveLength(2);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-land_use"]).toHaveLength(4);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-pollution"]).toHaveLength(1);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-waste"]).toHaveLength(1);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-land_use"]).toHaveLength(2);
    expect(expansion.coverageByMaterialIssue["site-042-mi-pollution"]).toMatchObject({
      sourceKind: "demo_sample",
      rowCounts: { total: 6, calculated: 1, unmapped: 2, transferOnly: 2, blocked: 1 },
    });
    expect(expansion.inputBatchHashes).toHaveLength(3);
    expect(expansion.financialEffectSourceHashes).toHaveLength(4);

    const headquartersDecision = result.decisions.find((entry) => entry.siteId === "site-042");
    expect(headquartersDecision?.materialIssueId).toBe("site-042-mi-water");
    expect(headquartersDecision?.financialBridge.contributionBreakdown).toHaveLength(5);
    expect(
      headquartersDecision?.financialBridge.contributionBreakdown
        .filter((entry) => ["pollution", "waste", "land_use"].includes(entry.category))
        .map((entry) => entry.category)
    ).toEqual(["pollution", "waste", "land_use", "land_use"]);
    expect(headquartersDecision?.financialBridge.bridge1.verifiedIncrementalBenefit).toBe(12_000);
    expect(result.decisions.filter((entry) => entry.siteId === "site-042")).toHaveLength(1);

    const yokkaichiRecords = ["pollution", "waste", "land_use"].flatMap(
      (category) => result.valuation.valuationRecordsByMaterialIssue[`site-070-mi-${category}`] ?? []
    );
    expect(yokkaichiRecords.every((record) => record.valueConcept === "welfare")).toBe(true);
    expect(result.decisions.filter((entry) => entry.siteId === "site-070")).toHaveLength(1);
    expect(result.decisions.find((entry) => entry.siteId === "site-070")?.financialBridge.contributionBreakdown).toHaveLength(1);
    expect(result.recalculationHash.inputs.financialEffectSourceHashes).toEqual(expansion.financialEffectSourceHashes);
  });

  it("PRTR入力を独立MaterialIssueとして算定し、LIME3厚生価値を企業意思決定へ混入させない", () => {
    const result = runDemoPipeline({
      userSites: [],
      interactions: emptyInteractionState(),
      rngSeed: 42,
      physicalInputs: [input],
      inputBatchHashes: ["sha256:batch-1"],
      deepDiveConfigsByMaterialIssue: {
        "site-042-mi-pollution": [
          {
            physicalQuantityId: "prtr-row-1",
            input,
            config: {
              depth: "deep_dive",
              factorResolution: {
                mappingId: "lime3-pollution:2023:2023:009:air",
                mappingVersion: "1.0.0",
                mappingHash: "sha256:mapping-1",
                factor: {
                  factorId: "lime3-v4:002P22009:production-japan-integrated",
                  methodId: "lime3-pollution",
                  methodVersion: "3.0.0",
                  sourceFlowId: "002P22009",
                  sourceFlowName: "排出, アクリロニトリル, 大気, 不特定",
                  medium: "air",
                  valuePerUnit: 2.5,
                  denominatorUnit: "kg",
                  currency: "USD",
                  priceYear: null,
                  geographicPerspective: "生産国・日本・統合化",
                  sourceRegion: "JP",
                  sourceHash: "sha256:lime3-v4",
                  licenseMode: "bring_your_own_license",
                  licenseValidUntil: "2027-06-30",
                },
              },
              currencyConversion: {
                fromCurrency: "USD",
                toCurrency: "JPY",
                rate: 94.46,
                rateDate: "2024",
                source: "World Bank PA.NUS.PPP",
              },
            },
            calibration: {
              pppSource: "not_applicable:currency-converted-separately",
              pppValue: 1,
              incomeElasticity: 0,
              sourceIncomeLevel: 1,
              targetIncomeLevel: 1,
              deflator: 1,
              relativePriceEscalationRate: 0,
              elapsedYears: 0,
              areaScaling: 1,
            },
            plugins: getPluginsForCategory("pollution").filter((plugin) => plugin.methodId === "lime3-pollution"),
            calibrationSetVersion: "jpy-identity-v1",
            reconciliationFunctionVersion: "none",
            fitnessTierThresholdVersion: "not-applicable-v1",
          },
        ],
      },
      coverageByMaterialIssue: {
        "site-042-mi-pollution": {
          sourceKind: "customer_prtr",
          reportingPeriod: "2023",
          quantities: [{
            unit: "kg", total: 10, calculated: 10, unmapped: 0, transferOnly: 0, blocked: 0,
            rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
          }],
          rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
          mappingVersion: "1.0.0",
          coefficientVersion: "3.0.0",
        },
      },
      methodAvailabilityByMaterialIssue: {
        "site-042-mi-pollution": [
          { methodId: "lime3-pollution", licenseMode: "bring_your_own_license", status: "available" },
        ],
      },
    });

    const issue = result.assessment.materialIssues.find((entry) => entry.id === "site-042-mi-pollution");
    expect(issue).toBeDefined();
    const [record] = result.valuation.valuationRecordsByMaterialIssue[issue!.id];
    expect(record.valueConcept).toBe("welfare");
    expect(record.centralValue).toBeCloseTo(10 * 2.5 * 94.46);
    expect(record.quantileRange).toBeNull();
    expect(result.valuation.divergenceDecompositions.some((entry) => entry.id.includes("pollution"))).toBe(false);
    expect(result.decisions.some((entry) => entry.materialIssueId === issue!.id)).toBe(false);
    expect(result.recalculationHash.inputs.activeInputBatchHashes).toEqual(["sha256:batch-1"]);
    expect(result.assumptionEntries.some((entry) => entry.payload.kind === "input_mapping")).toBe(true);
  });

  it("カバレッジ総量の不一致を拒否する", () => {
    expect(() =>
      runDemoPipeline({
        userSites: [],
        interactions: emptyInteractionState(),
        rngSeed: 42,
        coverageByMaterialIssue: {
          "site-042-mi-pollution": {
            sourceKind: "customer_prtr",
            reportingPeriod: "2023",
            quantities: [{
              unit: "kg", total: 10, calculated: 9, unmapped: 0, transferOnly: 0, blocked: 0,
              rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
            }],
            rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
          },
        },
      })
    ).toThrow("カバレッジ内訳");
  });
});
