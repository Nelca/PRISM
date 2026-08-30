import type { MethodConfig, MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput } from "../../types/valuation";

function requirePollutionFactor(input: Extract<PhysicalQuantityInput, { category: "pollution" }>, config: MethodConfig) {
  const resolution = config.factorResolution;
  if (!resolution) throw new Error("LIME3汚染算定にはレビュー済みfactorResolutionが必要です。");
  if (input.releaseMedium === "sewer" || input.releaseMedium === "offsite_waste") {
    throw new Error("PRTR移動量は汚染リリースとして貨幣化できません。");
  }
  const { factor } = resolution;
  const expectedMappingId = `lime3-pollution:${input.reportingYear}:${input.prtrListVersion}:${input.prtrSubstanceCode}:${input.releaseMedium}`;
  if (resolution.mappingId !== expectedMappingId) throw new Error("PRTR入力とLIME3対応表の物質・媒体が一致しません。");
  if (factor.methodId !== "lime3-pollution" || factor.methodVersion !== "3.0.0") {
    throw new Error("LIME3汚染係数の手法または版が一致しません。");
  }
  if (input.unit !== "kg" || factor.denominatorUnit !== "kg") throw new Error("LIME3汚染算定の単位はkgである必要があります。");
  if (factor.medium !== input.releaseMedium) throw new Error("PRTR排出媒体とLIME3係数の媒体が一致しません。");
  if (factor.sourceRegion !== "JP" || input.sourceRegion !== "JP" || input.targetRegion !== "JP") {
    throw new Error("LIME3日本・生産国係数は日本の入力にだけ適用できます。");
  }
  if (!Number.isFinite(input.physicalQuantity) || input.physicalQuantity < 0) throw new Error("PRTR排出量は0以上の有限値が必要です。");
  if (!Number.isFinite(factor.valuePerUnit)) throw new Error("LIME3汚染係数が有限値ではありません。");
  return factor;
}

export const lime3PollutionPlugin: MonetizationMethodPlugin = {
  methodId: "lime3-pollution",
  version: "3.0.0",
  licenseMode: "bring_your_own_license",
  supportedCategories: ["pollution"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    if (input.category !== "pollution") throw new Error("lime3-pollutionはpollution入力だけを受け付けます。");
    const factor = requirePollutionFactor(input, config);
    return [{
      subFactorId: "lime3-pollution",
      valueConcept: "welfare",
      aopCode: "unmapped",
      aopSourceLabel: "LIME3統合化(複数保護対象を含む)",
      aopMappingConfidence: "unmapped",
      centralValue: input.physicalQuantity * factor.valuePerUnit,
      parameterUncertainty: { kind: "not_available", reason: "抽出済みLIME3統合化係数に確率分布が公開されていない" },
      transferFitness: { tier: "not_applicable" },
      discountRate: 0.02,
      discountRateStatus: "explicit",
      scopeExclusions: ["統合化係数の保護対象別金額内訳を復元できないため単一AoPへ割り当てない"],
      skipGeographicCalibration: true,
    }];
  },
};
