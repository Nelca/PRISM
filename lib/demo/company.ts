/**
 * ダミーデータ:架空企業「東海化成株式会社」(仮)の生データ。
 *
 * 実データが入手できるまでの間、build-plan §7.1のGATE検証・UIシェルの動作確認に使う
 *架空データ。**実在の企業を参照しない、完全に架空の設定値。**
 *
 * 拠点3件:
 *  - site-042(本社工場・化学、座標既知・水ストレス地域・KBA近接・ENCORE依存度高)
 *  - site-050(金属加工工場・鉄鋼、座標既知・水ストレスのみ該当)
 *  - site-099(海外サプライヤー・繊維、住所のみでジオコーディングが失敗する設定)
 */

import { IDENTITY_CALIBRATION } from "@core/divergence/test-helpers";
import { exchangeAmount } from "@core/types/common";
import { buildNatureInterfaces } from "@core/site/locate";
import type { LayerLookup } from "@core/site/locate";
import type { NatureInterface, Site } from "@core/types/site";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput, ExchangeValuationRecord } from "@core/types/valuation";
import type { SiteRow } from "@core/site/ingest";
import type { Countermeasure } from "@core/types/decision";
import type { BaselineNpvInput } from "@core/types/financial-bridge";
import type { DisclosureClaim } from "@core/types/disclosure";

export const COMPANY_NAME = "東海化成株式会社(架空)";

export const SITE_ROWS: SiteRow[] = [
  { id: "site-042", name: "本社工場", siteType: "own_site", industrySector: "chemicals", lat: 35.1, lng: 136.9 },
  { id: "site-050", name: "金属加工工場", siteType: "own_site", industrySector: "steel", lat: 34.7, lng: 135.5 },
  { id: "site-099", name: "海外サプライヤー(繊維)", siteType: "supplier_site", industrySector: "textile", address: "未特定地区(バングラデシュ)" },
];

/** 架空のジオコーディングサービス。site-099の住所は解決できない設定。 */
export function demoGeocode(address: string): { lat: number; lng: number } | null {
  if (address === "未特定地区(バングラデシュ)") {
    return null;
  }
  return { lat: 23.8, lng: 90.4 };
}

const LAYER_LOOKUPS_BY_SITE: Record<string, LayerLookup[]> = {
  "site-042": [
    { layerType: "kba", dataSource: "IBAT Alliance", licenseMode: "pending_review", lookup: () => true },
    { layerType: "water_stress", dataSource: "WRI Aqueduct 4.0", licenseMode: "reference_only", lookup: () => true },
    { layerType: "dependency_impact", dataSource: "ENCORE", licenseMode: "reference_only", lookup: () => true },
  ],
  "site-050": [
    { layerType: "water_stress", dataSource: "WRI Aqueduct 4.0", licenseMode: "reference_only", lookup: () => true },
    { layerType: "dependency_impact", dataSource: "ENCORE", licenseMode: "reference_only", lookup: () => false },
  ],
};

export function interfacesByCategoryForSite(site: Site): Partial<Record<"water", NatureInterface[]>> {
  const lookups = LAYER_LOOKUPS_BY_SITE[site.id] ?? [];
  return { water: buildNatureInterfaces(site, lookups) };
}

export function excludedCategoriesForSite(): ("water")[] {
  return ["water"];
}

/** M2 D-1が要求するスクリーニング深度のM3実行結果(モック)。 */
export function screeningValuationForMaterialIssue(siteId: string): ExchangeValuationRecord {
  const centralValue = siteId === "site-042" ? 12_000_000 : 1_500_000;
  return {
    id: `screen-${siteId}`,
    methodId: "replacement-cost",
    methodVersion: "1.0.0",
    physicalQuantityId: `pq-${siteId}-screening`,
    siteId,
    aopCode: "not_applicable",
    aopSourceLabel: "screening",
    aopMappingConfidence: "high",
    quantileRange: { p5: centralValue * 0.8, p50: centralValue, p95: centralValue * 1.2 },
    parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
    transferFitness: { tier: "not_applicable" },
    discountRate: null,
    discountRateStatus: "no_time_dimension",
    geographicCalibration: IDENTITY_CALIBRATION,
    scopeExclusions: [],
    recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
    assumptionEntryIds: [],
    recalculationHash: "placeholder:screening",
    valueConcept: "exchange",
    centralValue: exchangeAmount(centralValue),
  };
}

/** 深掘り深度でのM3実行に使う設定(本社工場・水カテゴリのみ)。 */
export const DEEP_DIVE_PHYSICAL_QUANTITY_ID = "pq-site042-water-2027";

export const DEEP_DIVE_INPUT: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 45_000, // m3/年
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

export const DEEP_DIVE_CALIBRATION: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "世界銀行ICP 2024年版",
  pppValue: 1.0,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  deflator: 1.0,
  relativePriceEscalationRate: 1.0,
  elapsedYears: 0,
  areaScaling: 1.0,
};

export const DEEP_DIVE_CONFIG: MethodConfig = {
  depth: "deep_dive",
  unitReplacementCost: 620, // 円/m3(代替水源調達コスト、企業提供の想定値)
  externalValueFactors: {
    "lime3-water": 28_500,
    "ifvi-vfnutrition": 1.35,
    "ifvi-vfdisease": 1.05,
    "ifvi-vfes": 1.62,
    "ifvi-vfaccess": 0.34,
  },
  vfesFitnessDimensions: {
    ecologicalFit: 0.75,
    socioeconomicFit: 0.68,
    serviceDefinitionFit: 0.85,
    temporalDistance: 0.6,
    spatialScaleFit: 0.7,
  },
};

/** M6:本社工場の水リスク低減策(節水設備投資)。 */
export function buildCountermeasures(replacementCostRecordId: string): Countermeasure[] {
  return [
    {
      type: "reduction",
      targetSiteId: "site-042",
      investmentCost: { initial: 80_000_000, recurring: 3_000_000 },
      avoidedNatureCost: [
        { year: 0, amount: exchangeAmount(27_900_000), sourceValuationRecordId: replacementCostRecordId },
        { year: 1, amount: exchangeAmount(27_900_000), sourceValuationRecordId: replacementCostRecordId },
      ],
    },
  ];
}

export const BASELINE_NPV: BaselineNpvInput = {
  value: 1_200_000_000, // 円(企業提供の通常NPV)
  discountRate: 0.06,
  horizon: 10,
  source: "manual_entry",
};

/** M7:統合報告書の主張。要件定義書§1の具体例(水消費20%削減の将来約束)を模したもの。 */
export const DISCLOSURE_CLAIM: DisclosureClaim = {
  id: "claim-2027-report-p18-01",
  sourceDocument: "統合報告書2027",
  sourcePageOrSection: "p.18",
  rawText: "当社は2030年までに本社工場における水使用量を20%削減することを目指します。",
  claimType: "future_commitment",
  extractedMetadata: {
    category: "water",
    quantityMentioned: { value: 20, unit: "%" },
    periodMentioned: { startYear: 2027, endYear: 2030 },
    scopeMentioned: "本社工場",
  },
  extractionConfidence: "high",
};
