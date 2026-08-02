/**
 * LIME3(水消費)。
 * 参照元: docs/data/method-recalculability.md §3、docs/data/aop-mapping-v1.md §2
 *
 * 水消費の損害は100%人間健康エンドポイントに配分される(Yamasaki, Ikaga & Itsubo 2020, Table 2)。
 * 割引率メカニズムは「社会資産」エンドポイント限定であり、水には作動しないため
 * discountRateStatus は"no_time_dimension"。G20各国への直接調査データの可能性が高く、
 * ベネフィット・トランスファーではないため transferFitness は"not_applicable"(要確認、M3 D-4.2)。
 *
 * 係数自体(LIME3の重み付けテーブルから導かれる$/DALY相当の価値係数)は既存資産であり、
 * 自前で計算しない(D-03)。MethodConfig.externalValueFactors["lime3-water"]として受け取る。
 */

import type { MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput, MethodConfig } from "../../types/valuation";

const VALUE_FACTOR_KEY = "lime3-water";

export const lime3WaterPlugin: MonetizationMethodPlugin = {
  methodId: "lime3-water",
  version: "3.0.0", // LIME3
  licenseMode: "bring_your_own_license", // ライセンス条件は licensing.md で未確認(次のアクション)
  supportedCategories: ["water"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    const valueFactor = config.externalValueFactors?.[VALUE_FACTOR_KEY];
    if (valueFactor === undefined) {
      throw new Error(
        `LIME3の価値係数(MethodConfig.externalValueFactors["${VALUE_FACTOR_KEY}"])が必要です。` +
          "係数は既存資産であり、PRISM側で推定・計算しません(D-03・D-15)。"
      );
    }

    const centralValue = input.physicalQuantity * valueFactor;

    const output: MethodOutput = {
      subFactorId: "lime3-water",
      valueConcept: "welfare",
      aopCode: "human_health",
      aopSourceLabel: "人間健康(Human health)",
      aopMappingConfidence: "high",
      cicesRef: undefined,
      centralValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.25 },
      transferFitness: { tier: "not_applicable" },
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: [
        "一次生産(農業用水不足経由)への分岐は、標準実装(Yamasaki et al. 2020)には反映されていないため含めない",
      ],
    };

    return [output];
  },
};
