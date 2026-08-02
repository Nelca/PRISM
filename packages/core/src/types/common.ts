/**
 * 共通プリミティブ型。
 * 価値概念(交換価値/厚生価値)は branded type で分離し、
 * 異なる概念同士の加算を型レベルで拒否する(構想書8.2、design-rationale-log D-11)。
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 交換価値(市場でやり取りされる価格に相当)。厚生価値と加算できない。 */
export type ExchangeAmount = Brand<number, "ExchangeValue">;
/** 厚生価値(支払意思額基準)。交換価値と加算できない。 */
export type WelfareAmount = Brand<number, "WelfareValue">;

export function exchangeAmount(value: number): ExchangeAmount {
  return value as ExchangeAmount;
}
export function welfareAmount(value: number): WelfareAmount {
  return value as WelfareAmount;
}

/** 交換価値同士のみ加算できる。ExchangeAmountとWelfareAmountを混ぜて呼ぶとコンパイルエラーになる。 */
export function sumExchangeAmounts(amounts: ExchangeAmount[]): ExchangeAmount {
  return amounts.reduce((total, a) => (total + a) as ExchangeAmount, 0 as ExchangeAmount);
}
/** 厚生価値同士のみ加算できる。 */
export function sumWelfareAmounts(amounts: WelfareAmount[]): WelfareAmount {
  return amounts.reduce((total, a) => (total + a) as WelfareAmount, 0 as WelfareAmount);
}

export type ValueConcept = "exchange" | "welfare";

/** 構想書7.1のカテゴリ。MVPは気候・水・汚染の3つ(M2要件定義書§0)。 */
export type ImpactCategory = "climate" | "water" | "pollution";

/**
 * 正規化AoPコード(M4要件定義書§6.2)。
 * "unmapped" = 対応付けを試みたが判断できなかった(推定で埋めない)。
 * "not_applicable" = エンドポイントモデルを用いない手法(代替費用法等)。M4 2026-08-01追記でAoPCode自体に統合。
 */
export type AoPCode =
  | "human_health"
  | "ecosystem_quality"
  | "resource_availability"
  | "social_assets"
  | "unmapped"
  | "not_applicable";

export type SpecifiedLevel = "section" | "division" | "group" | "class";

/** モンテカルロの分位点(M3 D-7:反復数10,000回・P5/P50/P95を報告する)。 */
export interface QuantileRange {
  p5: number;
  p50: number;
  p95: number;
}

/** 層i(パラメータ不確実性)の分布パラメータ。MVPでは対数正規分布を前提とする(M3 D-4)。 */
export interface Distribution {
  kind: "lognormal";
  mu: number;
  sigma: number;
}

/** 割引率の扱い(M4要件定義書F-5、M3各手法で使用)。 */
export type DiscountRateStatus = "explicit" | "documented_zero" | "no_time_dimension";

/** ライセンス区分(M1 D-1、M8 D-4)。"pending_review"は契約未締結の状態を明示する。 */
export type LicenseMode = "embedded" | "reference_only" | "bring_your_own_license" | "pending_review";

/**
 * 「未確定」を null や省略ではなく明示的な状態として持たせるための共通ユーティリティ型。
 * M6 D-10(承認閾値のpending)・M8 D-4(ライセンスのpending_review)で繰り返し使うパターン。
 */
export type Pending = "pending";
