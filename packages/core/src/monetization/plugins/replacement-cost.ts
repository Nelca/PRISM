/**
 * 代替費用法(自社定義・外部方法論ではない)。
 * 参照元: docs/requirements/m3-monetization-engine.md §8.1、docs/data/aop-mapping-v1.md §3
 *
 * 「今この瞬間の代替調達コストはいくらか」という、時間次元を持たない交換価値ベースの
 * 最もシンプルな基準値。エンドポイントモデルを用いないため aopCode は"not_applicable"。
 * 割引現在価値化は含めない(M3 D-8.1)。便益移転を行わないため transferFitness も
 * "not_applicable"(M3 D-4.2)。
 */

import type { MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput, MethodConfig } from "../../types/valuation";

export const replacementCostPlugin: MonetizationMethodPlugin = {
  methodId: "replacement-cost",
  version: "1.0.0",
  licenseMode: "embedded", // 自社定義のため外部ライセンス不要
  supportedCategories: ["water"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    if (config.unitReplacementCost === undefined) {
      throw new Error(
        "代替費用法には物理量1単位あたりの代替調達コスト(MethodConfig.unitReplacementCost)が必須です。" +
          "企業提供のデータであり、PRISM側で推定値を補うことはしません(D-15)。"
      );
    }

    const centralValue = input.physicalQuantity * config.unitReplacementCost;

    const output: MethodOutput = {
      subFactorId: "replacement-cost",
      valueConcept: "exchange",
      aopCode: "not_applicable",
      aopSourceLabel: "代替費用法(自社定義、エンドポイントモデルを用いない直接コスト)",
      aopMappingConfidence: "high", // 対応付け自体を要さない構造上の判断であり、確度の問題ではない
      cicesRef: undefined,
      centralValue,
      // 自社定義のためパラメータ不確実性は控えめに固定(実データ接続時に見直す)。
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.1 },
      transferFitness: { tier: "not_applicable" },
      discountRate: null,
      discountRateStatus: "no_time_dimension", // M3 D-8.1
      scopeExclusions: ["将来の水ストレス悪化に伴うコスト上昇は見込んでいない(それはIFVIのVFaccessが担う)"],
    };

    return [output];
  },
};
