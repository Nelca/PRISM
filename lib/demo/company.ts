/**
 * ダミーデータ:架空企業「東海化成株式会社」(仮)の生データ。
 *
 * 実データが入手できるまでの間、build-plan §7.1のGATE検証・UIシェルの動作確認に使う
 *架空データ。**実在の企業を参照しない、完全に架空の設定値。**
 *
 * 拠点4件(waterStress・likelySignificantDependencyImpactはいずれもWRI Aqueduct 4.0・ENCORE
 * の実データ反映(2026-08-10、`docs/data/aqueduct-water-stress-notes.md`・
 * `docs/data/encore-materiality-notes.md`)に基づく):
 *  - site-042(本社工場・化学、座標既知・KBA近接(WDPAライセンス保留中)。水ストレスは
 *    「該当なし」(愛知県のbasinはMedium-High止まり)、ENCORE依存・影響は「該当あり」
 *    (化学工業の圧力レーティングが高い)
 *  - site-050(金属加工工場・鉄鋼、座標既知)。水ストレスは「該当なし」。ENCORE依存・影響は
 *    「該当あり」(鉄鋼業は水供給への依存・GHG等排出の圧力が高い。旧実装は座標・業種を
 *    無視した固定値でfalseにしていたが、実データで訂正した)
 *  - site-060(海外サプライヤー・繊維、インド・グジャラート州)。水ストレスは「該当あり」
 *    (Extremely High、>80%)。ENCORE依存・影響も「該当あり」の2基準が該当する実例
 *    (2026-08-10追加)
 *  - site-099(海外サプライヤー・繊維、住所のみでジオコーディングが失敗する設定)
 *
 * `rapidIntegrityDecline`(GAP-13)は拠点IDのハードコードではなく、`interfacesByCategoryForSite`
 * が拠点の座標から`@core/site/ecological-integrity-grid`を動的に引く(2026-08-10、
 * `docs/data/ecosystem-integrity-trend-notes.md` §8.6)。新規に追加される拠点にも自動的に適用される。
 */

import { IDENTITY_CALIBRATION } from "@core/divergence/test-helpers";
import type { ImpactCategory } from "@core/types/common";
import { computeRecordHash } from "@core/ledger/recalculation-hash";
import { exchangeAmount } from "@core/types/common";
import { buildNatureInterfaces } from "@core/site/locate";
import type { LayerLookup } from "@core/site/locate";
import { isHighBaselineWaterStress } from "@core/site/water-stress";
import type { BaselineWaterStressCategory } from "@core/site/water-stress";
import { hasHighMaterialityRating } from "@core/site/encore-materiality";
import type { EncoreMaterialityRating } from "@core/site/encore-materiality";
import { isRapidIntegrityDecline } from "@core/site/ecosystem-integrity-trend";
import { lookupEcologicalIntegrityTrend } from "@core/site/ecological-integrity-grid";
import { defaultResolveCriterion } from "@core/site/criteria";
import type { CriterionKey } from "@core/site/criteria";
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
  { id: "site-060", name: "海外サプライヤー(繊維・グジャラート州)", siteType: "supplier_site", industrySector: "textile", lat: 23.0, lng: 72.6 },
  { id: "site-099", name: "海外サプライヤー(繊維)", siteType: "supplier_site", industrySector: "textile", address: "未特定地区(バングラデシュ)" },
  // 気候カテゴリのMaterialIssueをGAP-11(NGFS/GX-ETSシナリオの数値差)実証のために追加した専用拠点
  // (2026-08-15、design-rationale-log D-128)。site-042に気候カテゴリを足す案は、
  // run-demo-pipeline.tsが「1拠点=1意思決定」を前提にしているため見送り、site-060追加時と
  // 同じ前例(単一の新機能を示すための専用拠点)に倣った。
  { id: "site-070", name: "四日市工場", siteType: "own_site", industrySector: "petrochemicals", lat: 34.965, lng: 136.625 },
];

/**
 * WRI Aqueduct 4.0 `baseline_annual`(GDBの`baseline_annual`レイヤ)から抽出した実データ
 * (取得日2026-08-10、`docs/data/aqueduct-water-stress-notes.md` §4)。拠点座標に対する
 * 厳密なpoint-in-polygon照会(fiona/OpenFileGDBドライバ)で該当basinを直接特定した値であり、
 * 都道府県/州単位の面積加重近似(同ノート旧版)とも一致することを確認済み。
 */
const BASELINE_WATER_STRESS_CATEGORY: Record<string, BaselineWaterStressCategory> = {
  "site-042": 2, // 愛知県のbasin、Medium-High(20-40%)、bws_raw=0.300
  "site-050": 1, // 大阪府のbasin、Low-Medium(10-20%)、bws_raw=0.200
  "site-060": 4, // インド・グジャラート州のbasin、Extremely High(>80%)、bws_raw=6.246
  // site-070は気候カテゴリ実証用の拠点であり、水ストレス区分は本題ではないため
  // site-042と同水準(Medium-High)を仮に採用した(個別のAqueduct照会は行っていない)。
  "site-070": 2,
};

/**
 * ENCORE知識ベース(2026年5月版)`06. Dependency mat ratings.csv`・`07. Pressure mat ratings.csv`
 * から抽出した実データ(取得日2026-08-10、`docs/data/encore-materiality-notes.md` §4)。
 * デモの業種をISIC業種に対応付け、High以上のレーティングのみを列挙している(N/A・ND・M以下は省略)。
 */
const ENCORE_HIGH_MATERIALITY_RATINGS: Record<string, EncoreMaterialityRating[]> = {
  // chemicals→C_20_201_2011(Manufacture of basic chemicals)。圧力: Disturbances=VH、
  // Emissions of toxic soil and water pollutants=VH。
  "site-042": ["VH", "VH"],
  // steel→C_24_241(Manufacture of basic iron and steel)。依存: Water supply=H、
  // Water flow regulation=H。圧力: Disturbances=VH、Emissions of GHG=H、
  // Emissions of non-GHG air pollutants=H、Emissions of toxic soil and water pollutants=VH。
  "site-050": ["H", "H", "VH", "H", "H", "VH"],
  // textile→C_13_131(Spinning, weaving and finishing of textiles)。依存:
  // Education, scientific and research services=VH。
  "site-060": ["VH"],
  // petrochemicals→石油化学もchemicalsのISIC区分(C_20_201_2011)を流用(site-042と同じ)。
  "site-070": ["VH", "VH"],
};

/**
 * `interfacesByCategoryForSite`で`rapidIntegrityDecline`を`highEcosystemIntegrity`と
 * 区別するための識別子。値そのものは`@core/site/ecological-integrity-grid`が座標から
 * 動的に引く(拠点IDのハードコードではない。2026-08-10、`docs/data/ecosystem-integrity-trend-notes.md`
 * §8.6。任意の新規拠点にも自動的に適用される)。
 */
const ECOLOGICAL_INTEGRITY_TREND_SOURCE = "Ecological Integrity Index (Sun et al. 2026)";

/** 座標を持つ`Site`(coordinates・またはgeocoded済みのaddress)からlat/lngを取り出す。 */
function siteCoordinates(site: Site): { lat: number; lng: number } | null {
  if (site.location.kind === "coordinates") {
    return { lat: site.location.lat, lng: site.location.lng };
  }
  if (site.location.geocoded && site.location.lat !== undefined && site.location.lng !== undefined) {
    return { lat: site.location.lat, lng: site.location.lng };
  }
  return null;
}

/**
 * `ecosystem_integrity`という1つのlayerTypeから2つの基準(highEcosystemIntegrity・
 * rapidIntegrityDecline)を導出するためのresolveCriterion(D-90が定めた注入パターン)。
 * dataSourceが上記トレンドデータの識別子であればrapidIntegrityDeclineへ、それ以外は
 * criteria.tsの既定(defaultResolveCriterion)に委ねる。
 */
export function resolveCriterionForDemo(iface: NatureInterface): CriterionKey | null {
  if (iface.dataSource === ECOLOGICAL_INTEGRITY_TREND_SOURCE) {
    return "rapidIntegrityDecline";
  }
  return defaultResolveCriterion(iface);
}

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
    {
      layerType: "water_stress",
      dataSource: "WRI Aqueduct 4.0",
      licenseMode: "reference_only",
      lookup: () => isHighBaselineWaterStress(BASELINE_WATER_STRESS_CATEGORY["site-042"]),
    },
    {
      layerType: "dependency_impact",
      dataSource: "ENCORE",
      licenseMode: "reference_only",
      lookup: () => hasHighMaterialityRating(ENCORE_HIGH_MATERIALITY_RATINGS["site-042"]),
    },
  ],
  "site-050": [
    {
      layerType: "water_stress",
      dataSource: "WRI Aqueduct 4.0",
      licenseMode: "reference_only",
      lookup: () => isHighBaselineWaterStress(BASELINE_WATER_STRESS_CATEGORY["site-050"]),
    },
    {
      layerType: "dependency_impact",
      dataSource: "ENCORE",
      licenseMode: "reference_only",
      lookup: () => hasHighMaterialityRating(ENCORE_HIGH_MATERIALITY_RATINGS["site-050"]),
    },
  ],
  "site-060": [
    { layerType: "kba", dataSource: "IBAT Alliance", licenseMode: "pending_review", lookup: () => true },
    {
      layerType: "water_stress",
      dataSource: "WRI Aqueduct 4.0",
      licenseMode: "reference_only",
      lookup: () => isHighBaselineWaterStress(BASELINE_WATER_STRESS_CATEGORY["site-060"]),
    },
    {
      layerType: "dependency_impact",
      dataSource: "ENCORE",
      licenseMode: "reference_only",
      lookup: () => hasHighMaterialityRating(ENCORE_HIGH_MATERIALITY_RATINGS["site-060"]),
    },
  ],
  "site-070": [
    {
      layerType: "water_stress",
      dataSource: "WRI Aqueduct 4.0",
      licenseMode: "reference_only",
      lookup: () => isHighBaselineWaterStress(BASELINE_WATER_STRESS_CATEGORY["site-070"]),
    },
    {
      layerType: "dependency_impact",
      dataSource: "ENCORE",
      licenseMode: "reference_only",
      lookup: () => hasHighMaterialityRating(ENCORE_HIGH_MATERIALITY_RATINGS["site-070"]),
    },
  ],
};

/**
 * `rapidIntegrityDecline`は拠点IDに紐づく固定値ではなく、拠点の座標から
 * `lookupEcologicalIntegrityTrend`(0.5度グリッド、全球をカバー)を動的に引く。
 * 座標が解決できた拠点であれば、既存の3拠点に限らず**新規に追加された拠点にも
 * 自動的に適用される**(2026-08-10、`docs/data/ecosystem-integrity-trend-notes.md` §8.6。
 * 従来はsite-042/050/060限定のハードコードだった制約を解消した)。
 */
/**
 * site-070(気候カテゴリ実証用、D-128)のみ`climate`キーで返し、他の拠点は従来どおり
 * `water`のみを返す。TNFD LEAP L3の5基準(`CriteriaMet`)はカテゴリ非依存の汎用モデルであり、
 * 気候固有の感応度基準は存在しないため、水と同じlookup機構をそのまま流用する
 * (`build-material-issues.test.ts`が同じ前提で"climate"カテゴリを組み立てているのと同型)。
 */
export function interfacesByCategoryForSite(site: Site): Partial<Record<ImpactCategory, NatureInterface[]>> {
  const lookups = [...(LAYER_LOOKUPS_BY_SITE[site.id] ?? [])];
  const coordinates = siteCoordinates(site);

  if (coordinates) {
    lookups.push({
      layerType: "ecosystem_integrity",
      dataSource: ECOLOGICAL_INTEGRITY_TREND_SOURCE,
      licenseMode: "reference_only",
      lookup: () => isRapidIntegrityDecline(lookupEcologicalIntegrityTrend(coordinates.lat, coordinates.lng)),
    });
  }

  if (site.id === "site-070") {
    return { climate: buildNatureInterfaces(site, lookups) };
  }
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

export function screeningValuationForMaterialIssue(
  siteId: string,
  category: ImpactCategory = "water"
): ExchangeValuationRecord {
  // 気候カテゴリ(site-070):8,000 tCO2e × GX-ETS調整基準取引価格(¥1,700/tCO2、令和8年度)の概算。
  // 水カテゴリの既存分岐は変更しない。
  const centralValue = category === "climate" ? 8_000 * 1_700 : siteId === "site-042" ? 12_000_000 : 1_500_000;
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

/**
 * pppValue=94.46円/国際ドル(日本、2024年、PA.NUS.PPP、World Bank ICP。
 * `docs/data/calibration-parameters-v1.md` §1、取得日2026-08-08)。
 * IFVIのGlobal Perspective値(VFnutrition/VFdisease/VFes/VFaccess)は国際ドルで
 * 表現されている(方法論Appendix B §B37-B41)ため、円で表示するにはこの換算が必須。
 * 旧仮値(1.0=恒等変換)のままだと生の米ドル数値がそのまま「円」として表示されてしまう
 * (`docs/data/acquisition-runbook.md` §3.4のフォローアップで発見)。
 * sourceRegion=targetRegion="JP"のため所得弾力性調整(所得比100/100=1)・
 * デフレータ・相対価格上昇(elapsedYears=0)は実質無効化されており、この案件では
 * pppValueのみが実際に効く。
 */
export const DEEP_DIVE_CALIBRATION: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "世界銀行ICP 2024年版(PA.NUS.PPP、docs/data/calibration-parameters-v1.md §1)",
  pppValue: 94.46,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  deflator: 1.0,
  relativePriceEscalationRate: 1.0,
  elapsedYears: 0,
  areaScaling: 1.0,
};

/**
 * IFVI Water Consumption Topic Methodology, Appendix D Table D1、日本(Japan)の行より転記
 * (Global Perspective、USD(2024)/m3、national/minimum option。取得日2026-08-10、
 * `docs/data/acquisition-runbook.md` §3.4)。プラグインは較正前(source region)の値を
 * 受け取る前提のため、PPP等の変換は行わずIFVI公表値をそのまま渡す
 * (`packages/core/src/monetization/calibration.ts`が地理較正を一元的に適用する)。
 * 旧仮値(1.35 / 1.05 / 1.62 / 0.34)からの差し替え。
 */
export const DEEP_DIVE_CONFIG: MethodConfig = {
  depth: "deep_dive",
  unitReplacementCost: 620, // 円/m3(代替水源調達コスト、企業提供の想定値)
  externalValueFactors: {
    // AIST-IDEA Ver.4.0(LIME3)、取水(表層水)・利子率2%・消費国=日本の統合化スコア(US$/m3、較正前)。
    // アスエネ社が保有するライセンス(標準版、有効期限2027-06-30)の範囲内で利用。
    // 表層水/地下水の選択・価格基準年は未確認の仮定を含む(docs/data/lime3-coefficients-notes.md §3.2)。
    "lime3-water": 0.0135886259,
    "ifvi-vfnutrition": 0.0,
    "ifvi-vfdisease": 0.0,
    "ifvi-vfes": 2.97,
    "ifvi-vfaccess": 0.0,
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
 * 気候カテゴリ(site-070、四日市工場)の深掘り評価設定(GAP-11実証用、D-128)。
 * `ghg-carbon-price-conversion.ts`の2値(社会的費用・GX-ETS価格)を使う。
 */
export const CLIMATE_DEEP_DIVE_PHYSICAL_QUANTITY_ID = "pq-site070-climate-2027";

/** 8,000 tCO2e/年(企業提供の想定値、Scope1+2相当)。実在の数値ではない架空デモ値。 */
export const CLIMATE_DEEP_DIVE_INPUT: PhysicalQuantityInput = {
  category: "climate",
  physicalQuantity: 8_000,
  unit: "tCO2e",
  siteId: "site-070",
  sourceRegion: "JP",
  targetRegion: "JP",
};

/**
 * 社会的費用(USD建て)にはDEEP_DIVE_CALIBRATIONと同じPPP係数を適用する(IFVIのvfesと同種の
 * 国際ドル建て値のため)。GX-ETS価格は`skipGeographicCalibration: true`(プラグイン側で設定済み、
 * D-127・D-128)によりこの較正の影響を受けない。
 */
export const CLIMATE_DEEP_DIVE_CALIBRATION: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> =
  DEEP_DIVE_CALIBRATION;

/**
 * `carbon-social-cost-usd-per-tco2`:IFVI GHG Emissions Topic Methodology、2023年価格水準
 * (`docs/data/acquisition-runbook.md` §2.4)。
 * `gx-ets-adjustment-baseline-price-jpy-per-tco2`:令和8年度(2026年度)調整基準取引価格
 * (`docs/data/carbon-price-scenarios.md` §2)。
 */
export const CLIMATE_DEEP_DIVE_CONFIG: MethodConfig = {
  depth: "deep_dive",
  externalValueFactors: {
    "carbon-social-cost-usd-per-tco2": 236,
    "gx-ets-adjustment-baseline-price-jpy-per-tco2": 1_700,
  },
};

/** 四日市工場の企業提供財務データ(架空デモ値)。FLAGSHIP_FINANCIALSより小規模な事業単位という設定。 */
export const CLIMATE_FINANCIALS = {
  reportedOperatingProfit: exchangeAmount(800_000_000),
  /** 既に炭素税・省エネ法対応費用等として実際に支払っている額。 */
  currentlyInternalizedCost: exchangeAmount(2_000_000),
  existingImpairmentThreshold: exchangeAmount(30_000_000),
  creditMetrics: { netDebt: 1_600_000_000, ebitda: 900_000_000, interestExpense: 80_000_000 },
};

export const CLIMATE_BASELINE_NPV: BaselineNpvInput = {
  value: 800_000_000,
  discountRate: 0.06,
  horizon: 10,
  source: "manual_entry",
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

/** M6:四日市工場のGHG削減対策案3種(企業提供の想定値)。 */
export function buildClimateCountermeasureCandidates(gxEtsRecordId: string): CountermeasureCandidate[] {
  return [
    {
      key: "reduction",
      label: "省エネ設備投資・燃料転換",
      avoidedPhysicalQuantity: 2_000, // tCO2e/年
      countermeasure: {
        type: "reduction",
        targetSiteId: "site-070",
        investmentCost: { initial: 120_000_000, recurring: 4_000_000 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(3_400_000), sourceValuationRecordId: gxEtsRecordId },
          { year: 1, amount: exchangeAmount(3_400_000), sourceValuationRecordId: gxEtsRecordId },
        ],
      },
    },
    {
      key: "transfer",
      label: "排出権(クレジット)の購入",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "transfer",
        targetSiteId: "site-070",
        investmentCost: { initial: 0, recurring: 10_000_000 },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(13_600_000), sourceValuationRecordId: gxEtsRecordId },
          { year: 1, amount: exchangeAmount(13_600_000), sourceValuationRecordId: gxEtsRecordId },
        ],
      },
    },
    {
      key: "acceptance",
      label: "対策を実施せず監視を継続",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "acceptance",
        targetSiteId: "site-070",
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
