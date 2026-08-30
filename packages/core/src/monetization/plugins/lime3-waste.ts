import type { MethodConfig, MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput } from "../../types/valuation";

function requireWasteFactor(input: Extract<PhysicalQuantityInput, { category: "waste" }>, config: MethodConfig) {
  const resolution = config.factorResolution;
  if (!resolution) throw new Error("LIME3廃棄物算定にはレビュー済みfactorResolutionが必要です。");
  const expectedMappingId = `lime3-waste:${input.wasteTypeCode}:${input.treatmentRoute}:${input.treatmentLocation}`;
  if (resolution.mappingId !== expectedMappingId) throw new Error("廃棄物入力とLIME3対応表の種類・処理経路が一致しません。");
  const { factor } = resolution;
  if (factor.methodId !== "lime3-waste" || factor.methodVersion !== "3.0.0") throw new Error("LIME3廃棄物係数の手法または版が一致しません。");
  if (input.unit !== "kg" || factor.denominatorUnit !== "kg") throw new Error("LIME3廃棄物算定の単位はkgである必要があります。");
  if (factor.medium !== undefined) throw new Error("廃棄物係数にPRTR排出媒体を設定できません。");
  if (factor.sourceRegion !== "JP" || input.sourceRegion !== "JP" || input.targetRegion !== "JP") {
    throw new Error("LIME3日本・生産国係数は日本の入力にだけ適用できます。");
  }
  if (!Number.isFinite(input.physicalQuantity) || input.physicalQuantity < 0) throw new Error("廃棄物量は0以上の有限値が必要です。");
  if (!Number.isFinite(factor.valuePerUnit)) throw new Error("LIME3廃棄物係数が有限値ではありません。");
  return factor;
}

export const lime3WastePlugin: MonetizationMethodPlugin = {
  methodId: "lime3-waste",
  version: "3.0.0",
  licenseMode: "bring_your_own_license",
  supportedCategories: ["waste"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    if (input.category !== "waste") throw new Error("lime3-wasteはwaste入力だけを受け付けます。");
    const factor = requireWasteFactor(input, config);
    return [{
      subFactorId: "lime3-waste",
      valueConcept: "welfare",
      aopCode: "unmapped",
      aopSourceLabel: "LIME3統合化(複数保護対象を含む)",
      aopMappingConfidence: "unmapped",
      centralValue: input.physicalQuantity * factor.valuePerUnit,
      parameterUncertainty: { kind: "not_available", reason: "抽出済みLIME3統合化係数に確率分布が公開されていない" },
      transferFitness: { tier: "not_applicable" },
      discountRate: 0.02,
      discountRateStatus: "explicit",
      scopeExclusions: [
        "統合化係数の保護対象別金額内訳を復元できないため単一AoPへ割り当てない",
        "企業が支払う処理費用は含めず、LIME3の厚生価値だけを表示する",
      ],
      skipGeographicCalibration: true,
    }];
  },
};
