/**
 * NGFS炭素価格軌道(GAP-11・D-127)。
 * 参照元: docs/data/carbon-price-scenarios.md §1、
 * docs/data/external/ngfs-phase5.1-carbon-price-gcam-remind.csv
 *
 * NGFS Climate Scenarios Data Set v5.1(IIASA Scenario Explorer、2026-08-15取得)より、
 * GCAM 6.0 NGFS / REMIND-MAgPIE 3.3-4.8の2モデル(単一モデルを代表値とせず、
 * レンジとして扱う。design-rationale-log D-127)。単位は US$2010/t CO2(2010年基準の実質米ドル)。
 *
 * **まだ`computeNatureDebt()`には接続していない。** USD(実質2010年)→円(名目)の換算に
 * 必要な為替レート・実質→名目の変換係数が未確定のため(推定値で埋めない、D-15)。
 * 接続する際は、この定数から`period`に対応する年を引き、物理量(tCO2)・為替レートと
 * 掛け合わせて`Partial<Record<CarbonPriceScenario, ExchangeAmount>>`を組み立てる。
 */

export type NgfsCarbonPriceModel = "gcam" | "remind";
export type NgfsCarbonPriceScenario = "net_zero_2050" | "current_policies";
export type NgfsCarbonPriceRegion = "japan" | "world";

export const NGFS_CARBON_PRICE_UNIT = "US$2010/t CO2" as const;

/** 年 → 価格(US$2010/tCO2)。2025〜2050、5年刻み。 */
export type NgfsCarbonPriceTrajectory = Record<number, number>;

/**
 * `docs/data/external/ngfs-phase5.1-carbon-price-gcam-remind.csv`から転記。
 * キー: `${scenario}:${model}:${region}`
 */
export const NGFS_CARBON_PRICE_TRAJECTORIES: Record<string, NgfsCarbonPriceTrajectory> = {
  "current_policies:gcam:japan": { 2025: 0, 2030: 0, 2035: 0, 2040: 0, 2045: 0, 2050: 0 },
  "current_policies:remind:japan": {
    2025: 16.843765344,
    2030: 16.975015456,
    2035: 17.19376568,
    2040: 17.500015904,
    2045: 17.89376624,
    2050: 18.375016688,
  },
  "current_policies:gcam:world": { 2025: 0, 2030: 0, 2035: 0, 2040: 0, 2045: 0, 2050: 0 },
  "current_policies:remind:world": {
    2025: 10.693263392,
    2030: 10.295612768,
    2035: 10.155810896,
    2040: 10.251047408,
    2045: 10.589696432,
    2050: 11.127344144,
  },
  "net_zero_2050:gcam:japan": {
    2025: 11.5387323463636,
    2030: 85.828572243,
    2035: 196.3438303104,
    2040: 366.973113945109,
    2045: 651.933829878545,
    2050: 1350.1221422328,
  },
  "net_zero_2050:remind:japan": {
    2025: 153.19648344,
    2030: 283.697191568,
    2035: 414.197899696,
    2040: 544.698607936,
    2045: 675.199316064,
    2050: 708.799346528,
  },
  "net_zero_2050:gcam:world": {
    2025: 12.454283336185,
    2030: 102.019050480328,
    2035: 198.309476538417,
    2040: 336.746266044859,
    2045: 658.868773537624,
    2050: 1260.06508156468,
  },
  "net_zero_2050:remind:world": {
    2025: 98.377705216,
    2030: 183.301552448,
    2035: 294.946447488,
    2040: 433.765962448,
    2045: 614.370843632,
    2050: 748.8032356,
  },
};

export function lookupNgfsCarbonPrice(
  scenario: NgfsCarbonPriceScenario,
  model: NgfsCarbonPriceModel,
  region: NgfsCarbonPriceRegion,
  year: number
): number {
  const trajectory = NGFS_CARBON_PRICE_TRAJECTORIES[`${scenario}:${model}:${region}`];
  if (trajectory === undefined) {
    throw new Error(`NGFS炭素価格軌道が見つかりません: ${scenario}:${model}:${region}`);
  }
  const value = trajectory[year];
  if (value === undefined) {
    throw new Error(
      `NGFS炭素価格軌道は5年刻み(2025〜2050)のみ保持しています。年=${year}は含まれていません。` +
        "推定で補間しない(D-15)。"
    );
  }
  return value;
}

/**
 * US$2010(2010年基準の実質米ドル)→円 の換算係数(GAP-11・D-127、2026-08-15 [HUMAN確認])。
 *
 * 2段階で構成する(直接「2010年の為替レート」を使わない。NGFSの価格は実質値であり、
 * 名目の為替レートをそのまま掛けると2010年の物価水準のまま計算してしまうため):
 *   1. 米国GDPデフレータで実質2010年USD→名目{currentYear}年USDに補正
 *   2. {currentYear}年の円/ドル為替レート(期中平均)で円に換算
 *
 * 出典(いずれもWorld Bank WDI、2026-08-15 API直接取得):
 * - `NY.GDP.DEFL.ZS`(米国、基準年2020=100):2010年=85.06、2025年=122.36
 * - `PA.NUS.FCRF`(日本、Official exchange rate・期中平均):2025年=149.66円/USD
 *
 * **年が変わるたびに更新が必要。**`docs/data/calibration-parameters-v1.md`のPPP係数(94.46円)と
 * 同じ運用(直近の確定年のWDI値に定期的に差し替える)。PPP(購買力平価)とは別物であり、
 * `calibration.ts`の地理較正には使わない(D-127)。
 */
export interface NgfsUsdToJpyCalibration {
  usGdpDeflatorBaseYear: number;
  usGdpDeflatorBaseValue: number;
  usGdpDeflatorCurrentYear: number;
  usGdpDeflatorCurrentValue: number;
  jpyPerUsdCurrentYear: number;
  source: string;
}

export const NGFS_USD_TO_JPY_CALIBRATION: NgfsUsdToJpyCalibration = {
  usGdpDeflatorBaseYear: 2010,
  usGdpDeflatorBaseValue: 85.06,
  usGdpDeflatorCurrentYear: 2025,
  usGdpDeflatorCurrentValue: 122.36,
  jpyPerUsdCurrentYear: 149.66,
  source:
    "World Bank WDI, NY.GDP.DEFL.ZS (USA, base year 2020=100) & PA.NUS.FCRF (Japan, period average). 取得日2026-08-15。",
};

/** 1 US$2010 が何円に相当するか(`NGFS_USD_TO_JPY_CALIBRATION`時点)。 */
export function jpyPerNgfsUsd2010(calibration: NgfsUsdToJpyCalibration = NGFS_USD_TO_JPY_CALIBRATION): number {
  const deflatorAdjustment = calibration.usGdpDeflatorCurrentValue / calibration.usGdpDeflatorBaseValue;
  return deflatorAdjustment * calibration.jpyPerUsdCurrentYear;
}

/** US$2010/tCO2の価格を円/tCO2に換算する。 */
export function convertNgfsPriceToJpy(
  usd2010PerTco2: number,
  calibration: NgfsUsdToJpyCalibration = NGFS_USD_TO_JPY_CALIBRATION
): number {
  return usd2010PerTco2 * jpyPerNgfsUsd2010(calibration);
}
