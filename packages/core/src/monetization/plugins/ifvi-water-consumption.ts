/**
 * IFVI Water Consumption Topic Methodology(最終版・VTPC承認済み、2026年3月)。
 * 参照元: docs/requirements/m3-monetization-engine.md D-1・D-2・D-4.2・D-8.2、
 *         docs/data/aop-mapping-v1.md §1.3
 *
 * IFVIの公式集計式(Eq.2): VFH2O = VFaccess + MAX(VFnutrition, VFdisease, VFes)
 *
 * この集計値をそのまま1本のValuationRecordにはせず、4本の内訳値に分解して取り込む(M3 D-1)。
 * VFnutrition・VFdisease・VFesはWTPベース(厚生価値)、VFaccessは代替費用モデル(交換価値)。
 * 分解した内訳と元の集計式が一致することを reconciliation で検証する(M3 D-2)。
 */

import type {
  MethodOutput,
  MonetizationMethodPlugin,
  PhysicalQuantityInput,
  MethodConfig,
  GoldenTestVector,
} from "../../types/valuation";
import { computeFitnessTier } from "../fitness";

const SUB_FACTOR = {
  nutrition: "VFnutrition",
  disease: "VFdisease",
  es: "VFes",
  access: "VFaccess",
} as const;

const VALUE_FACTOR_KEYS = {
  nutrition: "ifvi-vfnutrition",
  disease: "ifvi-vfdisease",
  es: "ifvi-vfes",
  access: "ifvi-vfaccess",
} as const;

function requireValueFactor(config: MethodConfig, key: string): number {
  const value = config.externalValueFactors?.[key];
  if (value === undefined) {
    throw new Error(
      `IFVI Water Consumptionの価値係数(MethodConfig.externalValueFactors["${key}"])が必要です。` +
        "係数はIFVI Global Value Factor Databaseの既存資産であり、PRISM側で推定・計算しません(D-03・D-15)。"
    );
  }
  return value;
}

/**
 * IFVIのEq.2をそのまま写した集計関数。4本の内訳値(MethodOutput)から復元集計値を計算する。
 * 集計ロジックと内訳値の計算ロジックを混在させない(M3 D-2)。
 */
export function reconstructIfviWaterConsumption(outputs: MethodOutput[]): number {
  const byId = new Map(outputs.map((o) => [o.subFactorId, o.centralValue]));
  const nutrition = byId.get(SUB_FACTOR.nutrition);
  const disease = byId.get(SUB_FACTOR.disease);
  const es = byId.get(SUB_FACTOR.es);
  const access = byId.get(SUB_FACTOR.access);

  if (nutrition === undefined || disease === undefined || es === undefined || access === undefined) {
    throw new Error("IFVIの集計には4本すべての内訳値(VFnutrition/VFdisease/VFes/VFaccess)が必要です。");
  }

  return access + Math.max(nutrition, disease, es);
}

/**
 * ゴールデンテストベクタについて(重要):
 * IFVIのBasis for Conclusions文書には具体的な計算例が見当たらないことを事前調査で確認済み
 * (docs/requirements/m3-monetization-engine.md D-2「含まれていなければ、既知の入力から
 * 4本の内訳値を手計算し、テストベクタとして固定する」の代替手順に該当)。
 * したがって以下はIFVI公式のworked exampleではなく、実装の自己整合性を検証するために
 * 実装者が手計算した合成テストベクタである。
 */
const CANONICAL_TEST_INPUT: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 1, // 内訳値そのものをテストベクタとして扱うため物理量は1に固定
  unit: "m3",
  siteId: "golden-test-site",
  sourceRegion: "JP",
  targetRegion: "JP",
};

const SYNTHETIC_GOLDEN_VECTORS: GoldenTestVector[] = (() => {
  const nutrition = 12_000;
  const disease = 9_500;
  const es = 15_200; // MAXになるケース
  const access = 3_000;

  return [
    {
      input: CANONICAL_TEST_INPUT,
      expectedAggregate: access + Math.max(nutrition, disease, es),
      source: "自己整合性チェック用の手計算ベクタ(IFVI公式のworked exampleではない)",
    },
  ];
})();

export const ifviWaterConsumptionPlugin: MonetizationMethodPlugin = {
  methodId: "ifvi-water-consumption",
  version: "2026-03-final",
  licenseMode: "bring_your_own_license", // 商用利用には契約締結が必要(docs/data/licensing.md)
  supportedCategories: ["water"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    const nutritionValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.nutrition);
    const diseaseValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.disease);
    const esValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.es);
    const accessValue = input.physicalQuantity * requireValueFactor(config, VALUE_FACTOR_KEYS.access);

    // VFesの適合度ティア(M3 D-6):スクリーニングは無条件でティアC固定。
    // 深掘りは5次元スコアがあれば実際に計算し、なければスクリーニングと同じくティアCにフォールバックする。
    const esTransferFitness =
      config.depth === "deep_dive" && config.vfesFitnessDimensions
        ? { tier: computeFitnessTier(config.vfesFitnessDimensions).tier, dimensions: config.vfesFitnessDimensions }
        : { tier: "C" as const };

    const vFnutrition: MethodOutput = {
      subFactorId: SUB_FACTOR.nutrition,
      valueConcept: "welfare",
      aopCode: "human_health",
      aopSourceLabel: "Affected health from malnutrition",
      aopMappingConfidence: "high",
      cicesRef: undefined,
      centralValue: nutritionValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.2 },
      transferFitness: { tier: "not_applicable" }, // 対象国自身の共変量による直接パラメトリック計算(M3 D-4.2)
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: [],
    };

    const vFdisease: MethodOutput = {
      subFactorId: SUB_FACTOR.disease,
      valueConcept: "welfare",
      aopCode: "human_health",
      aopSourceLabel: "Affected health from water-borne disease",
      aopMappingConfidence: "high",
      cicesRef: undefined,
      centralValue: diseaseValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.2 },
      transferFitness: { tier: "not_applicable" },
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: [],
    };

    const vFes: MethodOutput = {
      subFactorId: SUB_FACTOR.es,
      valueConcept: "welfare",
      aopCode: "resource_availability",
      aopSourceLabel: "Altered ecosystem services",
      aopMappingConfidence: "high",
      cicesRef: undefined,
      centralValue: esValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.3 },
      transferFitness: esTransferFitness,
      discountRate: null,
      discountRateStatus: "no_time_dimension",
      scopeExclusions: ["食料供給サービスは栄養不良(VFnutrition)との二重計上回避のため除外済み(IFVI方法論自体の除外)"],
    };

    const vFaccess: MethodOutput = {
      subFactorId: SUB_FACTOR.access,
      valueConcept: "exchange",
      aopCode: "not_applicable",
      aopSourceLabel: "Financial costs to access future water(代替費用モデル)",
      aopMappingConfidence: "high",
      cicesRef: undefined,
      centralValue: accessValue,
      parameterUncertainty: { kind: "lognormal", mu: 0, sigma: 0.35 },
      transferFitness: { tier: "not_applicable" },
      discountRate: 0.02,
      discountRateStatus: "explicit", // 2%・2080年まで(M3 D-8.2)
      scopeExclusions: [],
    };

    return [vFnutrition, vFdisease, vFes, vFaccess];
  },

  reconciliation: {
    reconstruct: reconstructIfviWaterConsumption,
    goldenTestVectors: SYNTHETIC_GOLDEN_VECTORS,
    tolerance: 1e-6,
  },
};
