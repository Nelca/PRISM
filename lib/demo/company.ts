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
import { computeRecordHash } from "@core/ledger/recalculation-hash";
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
/**
 * スクリーニング深度で使うパラメータ版(M3 D-6:ESVD要約統計を使うためティアC相当・
 * 5次元スコアは計算しない)。深掘りとは別の版として区別する。
 */
const SCREENING_VERSIONS = {
  calibrationSetVersion: "screening-identity-v1",
  fitnessTierThresholdVersion: "screening-not-applicable-v1",
  aopMappingVersion: "aop-mapping-v1",
};

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
    // 深掘り評価と同じ関数でハッシュを付ける(GAP-06)。スクリーニングだけ
    // プレースホルダーのまま残すと、M2の優先度算定の入力になったレコードだけ
    // 「何で計算したか」を辿れなくなる。
    recalculationHash: computeRecordHash("vr", {
      methodId: "replacement-cost",
      methodVersion: "1.0.0",
      physicalQuantityId: `pq-${siteId}-screening`,
      siteId,
      calibration: IDENTITY_CALIBRATION,
      versions: SCREENING_VERSIONS,
    }),
    valueConcept: "exchange",
    centralValue: exchangeAmount(centralValue),
  };
}

/**
 * 前年度に採用していた貨幣化手法(顧客提供の事実、M4 §7.4)。
 *
 * 実データでは顧客のサステナビリティ部門から受領する項目であり
 * (`docs/data/acquisition-runbook.md` D-9)、まだ受け入れテンプレートに欄がない。
 * ここでは架空企業のデモ値として固定する。**PRISM側が推定した値ではない。**
 * 代表値をこれと違う手法に変更すると、前年度手法での再計算値が並記される。
 */
export const PRIOR_YEAR_METHOD_BY_MATERIAL_ISSUE: Record<string, string> = {
  "site-042-mi-water": "replacement-cost",
};

/**
 * 企業提供の財務データ(M5)。PRISMは検証しない(M5 D-1・M6 D-4と同じ原則)。
 *
 * 実データでは財務・経理部門から受領する項目(`docs/data/acquisition-runbook.md` D-4)で、
 * 受け入れテンプレートにまだ欄がない。ここでは架空企業のデモ値として固定する。
 * **報告営業利益に通常NPVを流用しない**(以前のデモ実装は別概念の値を代入していた)。
 */
export const FLAGSHIP_FINANCIALS = {
  reportedOperatingProfit: exchangeAmount(1_200_000_000),
  /** 既に炭素税・水利用料等として実際に支払っている額。 */
  currentlyInternalizedCost: exchangeAmount(2_000_000),
  /** 既存の減損テスト前提(閾値)。 */
  existingImpairmentThreshold: exchangeAmount(50_000_000),
  /** 信用指標の算出に使う財務データ。 */
  creditMetrics: { netDebt: 2_400_000_000, ebitda: 1_500_000_000, interestExpense: 130_000_000 },
};

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

/**
 * M6:対策案。coreの`Countermeasure`型には案のラベル・回避物理量フィールドが無いため、
 * デモ層でこのサイドカー型に包んで保持する(M6画面で複数案を並べて比較するため)。
 */
export interface CountermeasureCandidate {
  key: Countermeasure["type"];
  label: string;
  avoidedPhysicalQuantity: number; // m3/年
  countermeasure: Countermeasure;
}

/** M6:本社工場の水リスク対策案4種(企業提供の想定値)。 */
export function buildCountermeasureCandidates(replacementCostRecordId: string): CountermeasureCandidate[] {
  return [
    {
      key: "reduction",
      label: "取水設備の効率化投資",
      avoidedPhysicalQuantity: 45_000,
      countermeasure: {
        type: "reduction",
        targetSiteId: "site-042",
        investmentCost: { initial: 80_000_000, recurring: 3_000_000 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(27_900_000), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(27_900_000), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "avoidance",
      label: "調達先の変更(水源の多様化)",
      avoidedPhysicalQuantity: 50_000,
      countermeasure: {
        type: "avoidance",
        targetSiteId: "site-042",
        investmentCost: { initial: 150_000_000, recurring: 2_000_000 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(20_000_000), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(31_000_000), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "transfer",
      label: "水リスク保険契約",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "transfer",
        targetSiteId: "site-042",
        investmentCost: { initial: 0, recurring: 5_000_000 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(8_000_000), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(8_000_000), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "acceptance",
      label: "対策を実施せず監視を継続",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "acceptance",
        targetSiteId: "site-042",
        investmentCost: { initial: 0, recurring: 500_000 },
        avoidedNatureCost: [],
      },
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
