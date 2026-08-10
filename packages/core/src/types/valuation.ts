/**
 * M3:貨幣化エンジン。
 * 参照元: docs/requirements/m3-monetization-engine.md
 */

import type {
  AoPCode,
  Distribution,
  DiscountRateStatus,
  ExchangeAmount,
  ImpactCategory,
  LicenseMode,
  QuantileRange,
  SpecifiedLevel,
  ValueConcept,
  WelfareAmount,
} from "./common";
import type { AssessmentDepth } from "./assessment";

export interface PhysicalQuantityInput {
  category: ImpactCategory;
  physicalQuantity: number;
  unit: string;
  siteId: string;
  /** 係数の出典地域。地理較正ブリッジの入力(M3 D-3)。 */
  sourceRegion: string;
  /** 評価対象地域(通常は日本)。 */
  targetRegion: string;
}

export interface MethodConfig {
  /** M2のパイプラインから渡される深度。M3のESVD使用範囲(D-6)を左右する。 */
  depth: AssessmentDepth;
  /**
   * 代替費用法が使う、物理量1単位あたりの代替調達コスト(円)。企業提供のデータであり、
   * PRISM側で推定しない(D-15「推定で埋めない」)。代替費用法以外のプラグインは無視してよい。
   */
  unitReplacementCost?: number;
  /**
   * 外部手法(IFVI・LIME3等)が公表する係数セットから、この物理量・地点向けに引き当てた
   * 単位あたりの価値係数(較正前・source region基準)。係数自体は既存資産を使い自前構築しない
   * という原則(design-rationale-log D-03)により、プラグインは値を計算せずここで受け取るのみ。
   * 実際の係数データベース照会(Global Value Factor Database・LIME3重み付けテーブル等)は
   * 将来のデータ接続実装で行う。MVPでは呼び出し側が既知の値を直接渡す。
   */
  externalValueFactors?: Record<string, number>;
  /**
   * IFVIのVFes深掘り評価(D-6)で使う5次元適合度スコア。ESVD個別レコード照合の実装は
   * MVPスコープ外のため、外部(将来的なESVD検索機能)から渡される値として受け取る。
   * 未指定の場合、深掘りモードでもスクリーニング同様ティアC扱いにフォールバックする。
   */
  vfesFitnessDimensions?: {
    ecologicalFit: number;
    socioeconomicFit: number;
    serviceDefinitionFit: number;
    temporalDistance: number;
    spatialScaleFit: number;
  };
}

/**
 * CICES参照(依存側:どの生態系サービスが対象か)。
 *
 * **版を必ず持つ(2026-08-09追加)。**公式スプレッドシートの突き合わせにより、
 * V5.2 が V5.1 のコードを大きく組み替えていることが判明した。同じコード文字列が
 * 版によって別のサービスを指す(例:`4.2.1.1` は V5.1 で「飲用の表流水」、
 * V5.2 では「鉱物性物質」)。**版のないコードは解釈が定まらない。**
 * 詳細: `docs/data/cices-v51-notes.md` §4
 */
export interface CicesReference {
  cicesCode: string;
  specifiedLevel: SpecifiedLevel;
  /** 例 "V5.1" / "V5.2"。省略不可(D-15:版なしのコードを受け入れない)。 */
  cicesVersion: string;
}

/**
 * 適合度ティア。"not_applicable" は「便益移転という行為自体が発生していない」ことを表し、
 * A/B/C(移転はしたが精度が異なる)とは理由が異なる。表示・集計で A や C に読み替えないこと(M3 D-4.2)。
 */
export type TransferFitnessTier = "A" | "B" | "C" | "not_applicable";

/** 便益移転の適合度(M3 D-4・D-5)。層iiが構造的に適用できない場合は"not_applicable"。 */
export interface TransferFitness {
  tier: TransferFitnessTier;
  /** tierが A/B/C の場合のみ埋まる。 */
  dimensions?: {
    ecologicalFit: number;
    socioeconomicFit: number;
    serviceDefinitionFit: number;
    temporalDistance: number;
    spatialScaleFit: number;
  };
}

/**
 * 手法プラグインが返す、較正前(source region のまま)の1件の内訳値。
 * 1手法が複数のMethodOutputを返しうる(M3 D-1、IFVIは4本に分解)。
 */
export interface MethodOutput {
  /** 例 "VFnutrition"。単純な手法では手法IDと同一でよい。 */
  subFactorId: string;
  valueConcept: ValueConcept;
  /** "not_applicable" はAoPCode自体に含まれる(代替費用モデル等)。 */
  aopCode: AoPCode;
  /** 手法側の原表記(例 "一次生産")。 */
  aopSourceLabel: string;
  /** AoP対応付けの確度。"unmapped"の場合、推定で埋めない(D-15)。 */
  aopMappingConfidence: "high" | "medium" | "unmapped";
  metric?: "DALY" | "PDF" | "MSA" | null;
  cicesRef?: CicesReference;
  /** 較正前(source region)の値。 */
  centralValue: number;
  /** 層i:パラメータ不確実性。 */
  parameterUncertainty: Distribution;
  /** 層ii:移転誤差。 */
  transferFitness: TransferFitness;
  discountRate: number | null;
  discountRateStatus: DiscountRateStatus;
  /** 層iii:除外事項(数値に混ぜない)。 */
  scopeExclusions: string[];
}

export interface GoldenTestVector {
  input: PhysicalQuantityInput;
  expectedAggregate: number;
  /** 例 "IFVI Basis for Conclusions, worked example 1"。 */
  source: string;
}

/** 複合手法(MAX+加算等、非単純な集計関数を持つ手法)のみ実装する(M3 D-2)。 */
export interface ReconciliationSpec {
  reconstruct(outputs: MethodOutput[]): number;
  goldenTestVectors: GoldenTestVector[];
  tolerance: number;
}

export interface MonetizationMethodPlugin {
  methodId: string;
  version: string;
  licenseMode: LicenseMode;
  supportedCategories: ImpactCategory[];
  /** 較正前の値を返すこと。地理較正はコアエンジン側で一律適用する(M3 D-3)。 */
  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[];
  reconciliation?: ReconciliationSpec;
}

/**
 * 地理較正の記録(構想書8.4式、M3 D-3)。監査ドリルダウン・AssumptionEntryの両方に使う。
 *
 * 構想書8.4の補正式は5項の掛け算:
 *   PPP × 所得弾力性^η × デフレータ × 生態系サービス相対価格上昇係数^(経過年数) × 面積スケーリング
 * 2026-08-02のデータモデルレビューで、5項目目(相対価格上昇係数^経過年数)が
 * 実装から漏れていたことが判明したため追加した(M3要件定義書§3.3の数値例も同時に修正)。
 */
export interface GeographicCalibrationRecord {
  pppSource: string;
  pppValue: number;
  /** 所得弾力性(η)。所得弾力性調整 = (targetIncomeLevel / sourceIncomeLevel) ^ incomeElasticity。 */
  incomeElasticity: number;
  /**
   * 所得水準(研究地・対象地)。実装時に判明した欠落(2026-08-02追記):
   * 較正パラメータを完全に自己完結・後から再計算可能にするには、所得弾力性の指数(η)だけでなく
   * 比率の分母・分子(実際の所得水準)自体もレコードに残す必要がある。
   */
  sourceIncomeLevel: number;
  targetIncomeLevel: number;
  sourceRegion: string;
  targetRegion: string;
  deflator: number;
  /** 生態系サービス相対価格上昇係数(年率)。経過年数で累乗して適用する。 */
  relativePriceEscalationRate: number;
  /** 研究時点から評価年までの経過年数。 */
  elapsedYears: number;
  areaScaling: number;
}

/**
 * 貨幣化の原子単位(構想書8.7)。MethodOutputにコアエンジンが地理較正(D-3)と
 * 層i×層iiの不確実性合成(D-4)を適用した結果。M4の乖離分解が直接消費する入力。
 *
 * methodId は分解元を追跡できるよう `{親手法ID}.{内訳ID}` の形式を用いる
 * (例 "ifvi-water-consumption.VFnutrition"。M4要件定義書2026-08-01追記)。
 */
interface ValuationRecordCommon {
  id: string;
  methodId: string;
  methodVersion: string;
  physicalQuantityId: string;
  siteId: string;
  aopCode: AoPCode;
  /** 手法側の原表記(例 "一次生産")。M4要件定義書のEndpointCoverage.areasOfProtectionから継承。 */
  aopSourceLabel: string;
  /** AoP対応付けの確度。"unmapped"の場合、推定で埋めず`unmapped`のまま保持する(D-15)。 */
  aopMappingConfidence: "high" | "medium" | "unmapped";
  /** 損害の測定単位(該当する場合)。 */
  metric?: "DALY" | "PDF" | "MSA" | null;
  cicesRef?: CicesReference;
  /** 層i×層iiを合成した最終分位点(P5/P50/P95)。 */
  quantileRange: QuantileRange;
  /**
   * 層i(パラメータ不確実性)の分布パラメータ(2026-08-02追記、M6実装時に発見)。
   * M6 D-3が前提とする「M3のトルネード図」はM3実装時には作られておらず、複合後の
   * quantileRangeだけでは層i・層iiのどちらがレンジを支配しているか判別できなかった。
   * MethodOutputが既に持つ値をそのまま引き継ぐことで、M6がtransferFitness(層ii)と
   * 同じ尺度(対数正規sigma)で比較できるようにする。
   */
  parameterUncertainty: Distribution;
  transferFitness: TransferFitness;
  discountRate: number | null;
  discountRateStatus: DiscountRateStatus;
  geographicCalibration: GeographicCalibrationRecord;
  scopeExclusions: string[];
  /** F-4判定材料(M4要件定義書§5)。要因別の反実仮想再計算がそもそも可能かどうか。 */
  recalculability: {
    endpointBreakdownPublished: boolean;
    damageTimeProfilePublished: boolean;
  };
  assumptionEntryIds: string[];
  recalculationHash: string;
}

/**
 * valueConceptで判別可能なunion型にする(単なる`ValueConcept`フィールドではなく)。
 * これにより `centralValue` 自体がExchangeAmount/WelfareAmountのどちらかに確定し、
 * M6のDecisionRecordが交換価値のみを受け付けるという型ガード(M6 D-1)を、
 * `Extract<ValuationRecord, { valueConcept: "exchange" }>` という形で実際に強制できる。
 */
export type ValuationRecord =
  | (ValuationRecordCommon & { valueConcept: "exchange"; centralValue: ExchangeAmount })
  | (ValuationRecordCommon & { valueConcept: "welfare"; centralValue: WelfareAmount });

export type ExchangeValuationRecord = Extract<ValuationRecord, { valueConcept: "exchange" }>;
export type WelfareValuationRecord = Extract<ValuationRecord, { valueConcept: "welfare" }>;
