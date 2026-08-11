/**
 * 気候カテゴリの貨幣化プラグイン(GAP-14)。
 * 参照元: docs/requirements/mvp-completion-gap.md GAP-14、docs/data/carbon-price-scenarios.md
 *
 * **X4(GHGインベントリ算定エンジンは作らない)を踏み越えない設計:** このプラグインは
 * Scope1・2・3等のGHG排出量そのものを算定しない。企業が既に算定したGHG排出量(tCO2e)を
 * `PhysicalQuantityInput.physicalQuantity` として受け取り、既存資産(社会的費用・GX-ETS価格)
 * との掛け算のみを行う変換器である(代替費用法(replacement-cost.ts)と同じ「自社定義の変換式・
 * 係数自体は外部提供」という構造)。
 *
 * 2本の内訳値を返す(IFVI水消費プラグインと同じ「1手法が複数のMethodOutputを返しうる」構造。M3 D-1):
 * - 炭素の社会的費用(厚生価値。IFVI GHG Emissions Topic Methodologyが採用するモデル
 *   (Climate Impact Lab DSCIM・Resources for the Future GIVE)の統合値。2023年価格水準)
 * - GX-ETS調整基準取引価格(交換価値。日本の炭素排出量取引制度における実勢価格に相当)
 *
 * 交換価値と厚生価値は型レベルで加算不可(ExchangeAmount/WelfareAmount、design-rationale-log D-11)
 * であり、この2本を1つの集計値に合成することはそもそも構造的に発生しない。したがって
 * IFVIプラグインのような reconciliation(複合手法の集計検証)は不要。
 */

import type {
  MethodOutput,
  MonetizationMethodPlugin,
  PhysicalQuantityInput,
  MethodConfig,
} from "../../types/valuation";

const SUB_FACTOR = {
  socialCost: "ghg-social-cost",
  gxEtsPrice: "ghg-gx-ets-price",
} as const;

const VALUE_FACTOR_KEYS = {
  /** USD/tCO2、2023年価格水準。docs/data/carbon-price-scenarios.md参照。 */
  socialCost: "carbon-social-cost-usd-per-tco2",
  /** 円/tCO2。GX-ETS調整基準取引価格(年度ごとに変わるため直接渡す)。 */
  gxEtsPrice: "gx-ets-adjustment-baseline-price-jpy-per-tco2",
} as const;

function requireValueFactor(config: MethodConfig, key: string): number {
  const value = config.externalValueFactors?.[key];
  if (value === undefined) {
    throw new Error(
      `気候カテゴリの価値係数(MethodConfig.externalValueFactors["${key}"])が必要です。` +
        "係数はIFVI GHG Emissions Topic MethodologyまたはGX-ETS公式価格という既存資産であり、" +
        "PRISM側で推定・計算しません(D-15)。"
    );
  }
  return value;
}

export const ghgCarbonPriceConversionPlugin: MonetizationMethodPlugin = {
  methodId: "ghg-carbon-price-conversion",
  version: "1.0.0",
  licenseMode: "embedded", // 変換式自体は自社定義。係数の出典はIFVI/GX-ETS(externalValueFactorsで受け取る)
  supportedCategories: ["climate"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    const socialCostValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.socialCost);
    const gxEtsValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.gxEtsPrice);

    const socialCost: MethodOutput = {
      subFactorId: SUB_FACTOR.socialCost,
      valueConcept: "welfare",
      // DSCIM/GIVEは統合的な損害関数であり、単一のAoPへの分解が公表資料から判断できない(D-15)。
      aopCode: "unmapped",
      aopSourceLabel: "Social cost of carbon (Climate Impact Lab DSCIM / RFF GIVE, IFVI GHG Emissions Topic Methodology)",
      aopMappingConfidence: "unmapped",
      cicesRef: undefined,
      centralValue: socialCostValue,
      // モデル間のばらつきが大きい(DSCIM/GIVEの推定値は数倍のレンジを持つ)ためIFVIのVFesと同等の不確実性を仮置き。
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.3 },
      // 地点固有の適合度評価をPRISM側で行っていない(グローバル平均値をそのまま使用)ため、
      // IFVIのVFesスクリーニング既定と同じくティアC固定。
      transferFitness: { tier: "C" },
      discountRate: null,
      discountRateStatus: "no_time_dimension", // 2023年価格水準の時点推定値であり、多年度NPV化はこの手法では行わない
      scopeExclusions: [],
    };

    const gxEtsPrice: MethodOutput = {
      subFactorId: SUB_FACTOR.gxEtsPrice,
      valueConcept: "exchange",
      aopCode: "not_applicable", // 市場価格の直接適用であり、エンドポイントモデルを用いない(replacement-cost.tsと同じ構造)
      aopSourceLabel: "GX-ETS調整基準取引価格(排出量取引制度における交換価値の代理指標)",
      aopMappingConfidence: "high", // 対応付け自体を要さない構造上の判断であり、確度の問題ではない
      cicesRef: undefined,
      centralValue: gxEtsValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 }, // 公式価格の直接適用のため不確実性は小さく見積もる
      transferFitness: { tier: "not_applicable" }, // 便益移転を行わない(市場価格そのもの)
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: [
        "参考上限取引価格(¥4,300/tCO2、2026年度)は上限であり実勢価格ではないため使用していない。" +
          "調整基準取引価格のみを使用する(docs/data/carbon-price-scenarios.md §2)。",
      ],
    };

    return [socialCost, gxEtsPrice];
  },
};
