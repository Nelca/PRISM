import type { MethodConfig, MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput } from "../../types/valuation";

function expectedMappingId(input: Extract<PhysicalQuantityInput, { category: "land_use" }>): string {
  return input.activityKind === "conversion"
    ? `lime3-land-use:conversion:${input.landClassBefore}:${input.landClassAfter}`
    : `lime3-land-use:occupation:${input.landClass}`;
}

function requireLandFactor(input: Extract<PhysicalQuantityInput, { category: "land_use" }>, config: MethodConfig) {
  const resolution = config.factorResolution;
  if (!resolution) throw new Error("LIME3土地利用算定にはレビュー済みfactorResolutionが必要です。");
  if (resolution.mappingId !== expectedMappingId(input)) throw new Error("土地入力とLIME3対応表の活動種別・土地クラスが一致しません。");
  const { factor } = resolution;
  if (factor.methodId !== "lime3-land-use" || factor.methodVersion !== "3.0.0") throw new Error("LIME3土地利用係数の手法または版が一致しません。");
  const expectedUnit = input.activityKind === "conversion" ? "m2" : "m2year";
  if (input.unit !== expectedUnit || factor.denominatorUnit !== expectedUnit) {
    throw new Error(`LIME3土地${input.activityKind === "conversion" ? "改変" : "占有"}算定の単位は${expectedUnit}である必要があります。`);
  }
  if (factor.medium !== undefined) throw new Error("土地利用係数にPRTR排出媒体を設定できません。");
  if (factor.sourceRegion !== "JP" || input.sourceRegion !== "JP" || input.targetRegion !== "JP") {
    throw new Error("LIME3日本・生産国係数は日本の入力にだけ適用できます。");
  }
  if (!Number.isFinite(input.physicalQuantity) || input.physicalQuantity < 0) throw new Error("土地活動量は0以上の有限値が必要です。");
  if (!Number.isFinite(factor.valuePerUnit)) throw new Error("LIME3土地利用係数が有限値ではありません。");
  return factor;
}

export const lime3LandUsePlugin: MonetizationMethodPlugin = {
  methodId: "lime3-land-use",
  version: "3.0.0",
  licenseMode: "bring_your_own_license",
  supportedCategories: ["land_use"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    if (input.category !== "land_use") throw new Error("lime3-land-useはland_use入力だけを受け付けます。");
    const factor = requireLandFactor(input, config);
    return [{
      subFactorId: "lime3-land-use",
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
