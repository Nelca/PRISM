/**
 * M5:財務接続。
 * 参照元: docs/requirements/m5-financial-bridge.md
 *
 * 実装注記: 2つのブリッジは共通の親インターフェースを持たない。
 * ExchangeAmount/WelfareAmount(common.ts)の branded type により、
 * 両者の値を同じ配列・同じ合計に入れる関数はコンパイルエラーになる(design-rationale-log D-24)。
 * 要件定義書のスケッチにあった `valueConceptGuard: "exchange"` のような文字列タグは、
 * Bridge1/Bridge2が互いにフィールド構成の異なる独立インターフェースであるため付与していない
 * (フィールド名が重複せず、同じ配列に混在させる操作自体が存在しないため、判別用タグは不要と判断)。
 */

import type { ExchangeAmount, ImpactCategory, WelfareAmount } from "./common";
import type { CorporateFinancialScenario } from "./valuation";

/** 全出力に構造的に付与する(M5 D-6)。Optionalにしない。 */
export interface NonGaapLabel {
  label: "非GAAP指標";
  appliesTo: string[];
}

export interface BaselineNpvInput {
  value: number;
  /** 対応手段の割引現在価値化にも流用する(M5 D-4.4)。 */
  discountRate: number;
  horizon: number;
  source: "manual_entry" | "csv_upload";
}

export interface Bridge1NatureAdjustedProfit {
  /** 監査済み報告営業利益。企業提供・PRISMは検証しない。 */
  reportedOperatingProfit: ExchangeAmount;
  dependencyRiskNormalization: ExchangeAmount;
  futureInternalizationCost: ExchangeAmount;
  /** 報告営業利益へ未反映の確認済み増分便益。損失・減損リスクとは相殺しない。 */
  verifiedIncrementalBenefit: ExchangeAmount;
  natureAdjustedOperatingProfit: ExchangeAmount;
  nonGaapLabel: NonGaapLabel;
}

export interface Bridge2SocialCostView {
  socialCost: WelfareAmount;
  internalizationRate: number;
  nonGaapLabel: NonGaapLabel;
  /** 「投資判断には接続されていません」を常時付与する(X7の可視化、M5 D-2)。 */
  disclosureOnlyLabel: true;
}

export interface InternalizationStatus {
  totalExternalCost: ExchangeAmount;
  /** 既に炭素税・水利用料等の形で実際に支払われている額(企業提供)。 */
  currentlyInternalizedCost: ExchangeAmount;
  internalizationRate: number;
  uninternalizedCost: ExchangeAmount;
}

/**
 * M5 D-4.2:NGFS 2種 + GX-ETS公式価格帯。独自シナリオは発明しない。
 *
 * NGFS 2種はモデル別(GCAM 6.0 NGFS / REMIND-MAgPIE 3.3-4.8)に分けている(design-rationale-log D-127)。
 * 同じシナリオでもモデルによって炭素価格が大きく異なり(2050年Net Zero 2050・日本:
 * GCAM $1,350 vs REMIND-MAgPIE $709、docs/data/carbon-price-scenarios.md §1)、単一モデルを
 * 「代表値」として選ばず、2モデルをレンジとして扱う判断による。MESSAGEix-GLOBIOMは
 * 日本単体の内訳を持たないため対象外。
 */
export type CarbonPriceScenario =
  | "ngfs_net_zero_2050_gcam"
  | "ngfs_net_zero_2050_remind"
  | "ngfs_current_policies_gcam"
  | "ngfs_current_policies_remind"
  | "gx_ets_official";

export type NatureDebtScenario = CarbonPriceScenario | CorporateFinancialScenario;

/** 企業が主観的に設定する。デフォルトは均等割り(各1/3)、PRISMは特定シナリオを推奨しない(M5 D-4.3)。 */
export interface InternalizationProbability {
  scenario: NatureDebtScenario;
  probability: number;
  period: number;
}

/**
 * 自然債務(M5 D-4、2026-08-02追記)。要件定義書の算出式
 * 「自然債務 = Σ[未内部化コスト × 内部化確率(シナリオ,時期) × 割引係数]」の結果を保持する型が
 * 実装検討まで存在しなかったため追加した。`ComparisonTargets.operatingProfitRatio`が使う
 * 「期待損失」はこの`totalDebt`を指す。
 */
export interface NatureDebt {
  totalDebt: ExchangeAmount;
  breakdown: {
    scenario: NatureDebtScenario;
    period: number;
    probability: number;
    discountedAmount: ExchangeAmount;
    sourceValuationRecordId?: string;
    materialIssueId?: string;
    category?: ImpactCategory;
  }[];
  nonGaapLabel: NonGaapLabel;
}

export interface FinancialBridgeContributionSummary {
  sourceValuationRecordId: string;
  materialIssueId: string;
  category: ImpactCategory;
  grossCost: ExchangeAmount;
  alreadyInternalizedCost: ExchangeAmount;
  uninternalizedCost: ExchangeAmount;
  verifiedIncrementalBenefit: ExchangeAmount;
  natureDebt: ExchangeAmount;
  amountBasis: "annual" | "one_time";
  doubleCountKey: string;
  sourceHash?: string;
  dataVersion?: string;
}

/**
 * 信用格付機関が一般的に参照する財務指標の変化(M5 D-5.2)。
 * 変化後の値は自然債務・自然調整後利益から**単純な算術で導出する**(企業に入力させない)。
 * 分母が0で比率が定義できない場合はnull(推定で埋めない)。
 */
export interface CreditRatioChange {
  label: string;
  before: number | null;
  after: number | null;
}

export interface ComparisonTargets {
  /** 期待損失 ÷ 報告営業利益。 */
  operatingProfitRatio: number;
  impairmentTestImpact: {
    changesAssumption: boolean;
    details: string;
  };
  /** 定量モデルは持たない(M5 D-5.1、構想書11.2「未実証」)。 */
  ratingCostOfCapitalImpact: {
    /** 全顧客・全ケース共通の固定テンプレート文言。AIで生成しない(D-5.2)。 */
    qualitativeNote: string;
    /** 注記文に埋め込んだ数値そのもの。画面が表として組み直せるように構造でも持つ。 */
    ratios: CreditRatioChange[];
  };
  /** M5のすべての出力に必須(D-6)。2026-08-02のレビューで欠落を発見し追加。 */
  nonGaapLabel: NonGaapLabel;
}
