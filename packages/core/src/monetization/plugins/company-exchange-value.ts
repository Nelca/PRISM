import type { MethodConfig, MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput } from "../../types/valuation";

function requireEffect(input: PhysicalQuantityInput, config: MethodConfig) {
  const effect = config.corporateFinancialEffect;
  if (!effect) throw new Error("企業交換価値の算定にはcorporateFinancialEffectが必要です。");
  if (input.category !== "pollution" && input.category !== "waste" && input.category !== "land_use") {
    throw new Error("企業交換価値は汚染・廃棄物・土地利用入力だけを受け付けます。");
  }
  if (effect.siteId !== input.siteId || effect.category !== input.category) {
    throw new Error("企業交換価値と物理量入力の拠点・カテゴリが一致しません。");
  }
  if (!Number.isFinite(effect.grossCost) || effect.grossCost < 0) throw new Error("企業負担総額は0以上の有限値が必要です。");
  if (
    !Number.isFinite(effect.alreadyInternalizedCost) ||
    effect.alreadyInternalizedCost < 0 ||
    effect.alreadyInternalizedCost > effect.grossCost
  ) {
    throw new Error("内部化済み費用は0以上かつ企業負担総額以下である必要があります。");
  }
  if (!Number.isFinite(effect.verifiedIncrementalBenefit) || effect.verifiedIncrementalBenefit < 0) {
    throw new Error("確認済み増分便益は0以上の有限値が必要です。");
  }
  if (!effect.doubleCountKey || !/^[0-9a-f]{64}$/.test(effect.sourceHash)) {
    throw new Error("企業交換価値には二重計上防止キーとSHA-256形式の出典ハッシュが必要です。");
  }
  if (!Number.isFinite(effect.uncertaintySigma) || effect.uncertaintySigma <= 0) {
    throw new Error("企業交換価値には0より大きい不確実性sigmaが必要です。");
  }
  if (
    effect.internalizationScenarios.length === 0 ||
    effect.internalizationScenarios.some(
      (scenario) =>
        !Number.isFinite(scenario.probability) ||
        scenario.probability < 0 ||
        scenario.probability > 1 ||
        !Number.isInteger(scenario.period) ||
        scenario.period < 0
    )
  ) {
    throw new Error("企業交換価値には有効な内部化シナリオ・確率・時期が必要です。");
  }
  return effect;
}

export const companyExchangeValuePlugin: MonetizationMethodPlugin = {
  methodId: "company-exchange-value",
  version: "1.0.0",
  licenseMode: "embedded",
  supportedCategories: ["pollution", "waste", "land_use"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    const effect = requireEffect(input, config);
    return [{
      subFactorId: "company-exchange-value",
      valueConcept: "exchange",
      aopCode: "not_applicable",
      aopSourceLabel: "企業提供の回避・対応費用（交換価値）",
      aopMappingConfidence: "high",
      centralValue: effect.grossCost,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: effect.uncertaintySigma },
      transferFitness: { tier: "not_applicable" },
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: [
        "LIME3の厚生価値は企業負担額へ変換せず別表示する",
        "既に報告営業利益へ織り込み済みの費用と確認済み増分便益は財務ブリッジで別々に処理する",
      ],
      skipGeographicCalibration: true,
    }];
  },
};
