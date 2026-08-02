import { describe, expect, it } from "vitest";
import { loadCompanyDataset } from "./load-company-dataset";

const SITES_CSV = `site_id,name,site_type,industry_sector,lat,lng,address
site-001,本社工場,own_site,chemicals,35.1,136.9,
`;

const NATURE_INTERFACES_CSV = `site_id,layer_type,data_source,raw_result,license_mode
site-001,kba,IBAT Alliance,true,pending_review
site-001,water_stress,WRI Aqueduct 4.0,true,reference_only
`;

function engagementConfigJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    physicalQuantityId: "pq-site001-water-2027",
    deepDive: {
      category: "water",
      physicalQuantity: 45000,
      unit: "m3",
      siteId: "site-001",
      sourceRegion: "JP",
      targetRegion: "JP",
    },
    methodConfig: { depth: "deep_dive", unitReplacementCost: 620 },
    calibration: {
      pppSource: "test",
      pppValue: 1,
      incomeElasticity: 0.7,
      sourceIncomeLevel: 100,
      targetIncomeLevel: 100,
      deflator: 1,
      relativePriceEscalationRate: 1,
      elapsedYears: 0,
      areaScaling: 1,
    },
    baselineNpv: { value: 1_000_000_000, discountRate: 0.06, horizon: 10, source: "manual_entry" },
    approvalThreshold: "pending",
    bindingMechanism: { kind: "weak_reference" },
    countermeasures: [
      {
        type: "reduction",
        targetSiteId: "site-001",
        investmentCost: { initial: 1000, recurring: 0 },
        avoidedNatureCost: [{ year: 0, amount: 1000, sourceValuationMethodId: "replacement-cost" }],
      },
    ],
    disclosureClaims: [],
    ...overrides,
  });
}

describe("loadCompanyDataset", () => {
  it("3つの入力から検証済みのCompanyDatasetを組み立てる", () => {
    const { dataset, errors } = loadCompanyDataset(SITES_CSV, NATURE_INTERFACES_CSV, engagementConfigJson());
    expect(errors).toHaveLength(0);
    expect(dataset?.siteRows).toHaveLength(1);
    expect(dataset?.natureInterfaceLookupsBySite["site-001"]).toHaveLength(2);
    expect(dataset?.engagementConfig.deepDive.siteId).toBe("site-001");
  });

  it("nature-interfaces.csvが未知のsite_idを参照している場合はエラーになる", () => {
    const badNatureCsv = "site_id,layer_type,data_source,raw_result,license_mode\nsite-999,kba,X,true,reference_only";
    const { dataset, errors } = loadCompanyDataset(SITES_CSV, badNatureCsv, engagementConfigJson());
    expect(dataset).toBeNull();
    expect(errors.some((e) => e.includes("site-999"))).toBe(true);
  });

  it("engagement-config.jsonのdeepDive.siteIdが未知の場合はエラーになる", () => {
    const { dataset, errors } = loadCompanyDataset(
      SITES_CSV,
      NATURE_INTERFACES_CSV,
      engagementConfigJson({ deepDive: { category: "water", physicalQuantity: 1, unit: "m3", siteId: "site-999", sourceRegion: "JP", targetRegion: "JP" } })
    );
    expect(dataset).toBeNull();
    expect(errors.some((e) => e.includes("deepDive.siteId"))).toBe(true);
  });

  it("countermeasureのtargetSiteIdが未知の場合はエラーになる", () => {
    const { dataset, errors } = loadCompanyDataset(
      SITES_CSV,
      NATURE_INTERFACES_CSV,
      engagementConfigJson({
        countermeasures: [
          {
            type: "reduction",
            targetSiteId: "site-999",
            investmentCost: { initial: 1000, recurring: 0 },
            avoidedNatureCost: [],
          },
        ],
      })
    );
    expect(dataset).toBeNull();
    expect(errors.some((e) => e.includes("countermeasure.targetSiteId"))).toBe(true);
  });
});
