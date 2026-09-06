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
 *
 * 完成実装 T-05:各内訳に`modelSteps`(係数照会→適用の2ステップ)と`traceMeta`を追加する。
 * `centralValue`の計算式(quantity × 価値係数)自体は変更しない。日本のVFnutrition/VFdisease/
 * VFaccessが0であることの意味(§5.6)は、`config.ifviWaterValueFactorSource`(Appendix D Table D1の
 * 出典)がある場合のみ`published_zero`として確定する(出典が無ければ意味を確定しない、D-15)。
 */

import type {
  MethodOutput,
  MonetizationMethodPlugin,
  PhysicalQuantityInput,
  MethodConfig,
  GoldenTestVector,
  IfviWaterValueFactorSource,
} from "../../types/valuation";
import type { EvidenceRef, ZeroMeaning } from "../../types/comparison";
import type { Availability, MethodEvaluationTrace, TraceStepDraft } from "../../types/trace";
import { computeFitnessTier } from "../fitness";
import { finalizeTrace } from "../../trace/evaluate-trace";
import { PATHWAY_MAPPING_VERSION, WATER_PATHWAYS } from "../trace/pathway-mapping";

const SUB_FACTOR = {
  nutrition: "VFnutrition",
  disease: "VFdisease",
  es: "VFes",
  access: "VFaccess",
} as const;

type SubFactorKind = keyof typeof SUB_FACTOR;

const VALUE_FACTOR_KEYS = {
  nutrition: "ifvi-vfnutrition",
  disease: "ifvi-vfdisease",
  es: "ifvi-vfes",
  access: "ifvi-vfaccess",
} as const;

/** modelStepsのcoefficient_lookup設定キー(反実仮想での差し替え対象、T-07)。 */
const SETTING_KEYS: Record<SubFactorKind, string> = {
  nutrition: "vf_nutrition",
  disease: "vf_disease",
  es: "vf_es",
  access: "vf_access",
};

function pathwayKey(subFactorId: string): string {
  return `ifvi-water-consumption.${subFactorId}`;
}

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
 * 完成実装 T-05:`reconstructIfviWaterConsumption`と同じ式(Eq.2)を、`MethodOutput[]`ではなく
 * `subFactorId → centralValue`の値マップから計算する軽量版。比較レシピ・UIの内訳分析など、
 * フルの`MethodOutput`を組み立てずに集計値だけ欲しい場面向け。
 * `mixesValueConcepts: true`は、集計式が厚生価値(nutrition/disease/es)と交換価値(access)を
 * 内部で混在させるIFVI方法論自体の構造(aop-mapping-v1.md §0)を明示するフラグ。
 */
export interface IfviWaterAggregationSpec {
  parentMethodId: "ifvi-water-consumption";
  aggregationFormula: string;
  reconstruct(values: Record<string, number>): number;
  mixesValueConcepts: true;
}

export const IFVI_WATER_AGGREGATION: IfviWaterAggregationSpec = {
  parentMethodId: "ifvi-water-consumption",
  aggregationFormula: "VFaccess + MAX(VFnutrition, VFdisease, VFes)",
  reconstruct(values: Record<string, number>): number {
    return reconstructIfviWaterConsumption(
      Object.entries(values).map(
        ([subFactorId, centralValue]) => ({ subFactorId, centralValue }) as unknown as MethodOutput
      )
    );
  },
  mixesValueConcepts: true,
};

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

// ---------------------------------------------------------------------------
// 完成実装 T-05:modelSteps・traceMeta
// ---------------------------------------------------------------------------

const FLOW_INTERPRETATION_EVIDENCE: EvidenceRef[] = [
  {
    source: "docs/data/aop-mapping-v1.md",
    locator: "§0 重要な留保",
    tier: "secondary",
    note: "MVP水パイロットの物理量は取水量。IFVI Water Consumption Topic Methodologyは水消費量を前提とする",
  },
];

const SITE_CORRECTION_EVIDENCE: EvidenceRef[] = [
  {
    source: "docs/data/acquisition-runbook.md",
    locator: "§3.4 IFVI 価値係数",
    tier: "secondary",
    note: "本文Eq.3-5(局所生物多様性圧力/水ストレス比による拠点補正)は式公開済みだが一次資料PDF未確認のため未実装",
  },
];

function buildSiteCorrection(source: IfviWaterValueFactorSource | undefined): Availability {
  const noteParts: string[] = [];
  if (source?.nationalBiodiversityPressure !== undefined) noteParts.push(`nationalBiodiversityPressure=${source.nationalBiodiversityPressure}`);
  if (source?.nationalWaterStress !== undefined) noteParts.push(`nationalWaterStress=${source.nationalWaterStress}`);
  return {
    status: "not_implemented_formula_published",
    reason:
      "本文Eq.3-5(局所生物多様性圧力/水ストレス比による拠点レベル補正)は式が公表済みだが、一次資料PDFが" +
      "手元になく式を確認できないため未実装。国レベル値をそのまま拠点へ適用している。" +
      (noteParts.length ? `(${noteParts.join(", ")})` : ""),
    evidence: SITE_CORRECTION_EVIDENCE,
  };
}

function buildDamageTimeProfile(subFactor: SubFactorKind): Availability {
  if (subFactor === "access") {
    return {
      status: "not_published",
      reason: "VFaccessは2%・2080年までの割引現在価値化が明記されているが、損害の時間列(年次系列)自体は公開されていない",
      evidence: [
        {
          source: "IFVI Water Consumption Topic Methodology Transparency Report",
          locator: "Appendix H, Item 9(Accounting for future impacts)",
          tier: "primary",
        },
      ],
    };
  }
  return {
    status: "not_applicable",
    reason: "Global Burden of Disease方式に整合し、DALYへ割引・年齢重み付けを適用しない(時間次元を持たない値)",
    evidence: [{ source: "docs/data/method-recalculability.md", locator: "§2.3", tier: "secondary" }],
  };
}

const UNDERLYING_MODEL_DESCRIPTIONS: Record<SubFactorKind, string> = {
  nutrition: "農業用水制限による地域の栄養不良→DALY損失(LC-Impact由来の特性化)をVSLで貨幣化。",
  disease: "家庭用淡水利用・上下水道接続・GDP・気温からDALYを推定(Motoshita et al. 2011)し、VSLで貨幣化。",
  es: "水の可用性と生態系サービス提供力の関係をESVD(Brander et al. 2024)・実蒸発散量(AET)で評価し、ベネフィット・トランスファーで貨幣化。",
  access:
    "水ストレス(需要/供給比)が1を超える分の抽出について、将来の水供給単価(IBnetベンチマーク)を用いて" +
    "2080年まで2%で割引現在価値化する代替費用モデル。",
};

function buildUnderlyingModel(subFactor: SubFactorKind, coefficientSetVersion: string): NonNullable<MethodOutput["traceMeta"]>["underlyingModel"] {
  return {
    description: UNDERLYING_MODEL_DESCRIPTIONS[subFactor],
    dataGeneration: coefficientSetVersion,
    evidence: [
      { source: "docs/data/aop-mapping-v1.md", locator: "§1.3", tier: "secondary" },
      { source: "IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf(最終承認版)", version: "2026年3月", tier: "primary" },
    ],
  };
}

function buildIfviTraceMeta(subFactor: SubFactorKind, config: MethodConfig): NonNullable<MethodOutput["traceMeta"]> {
  const source = config.ifviWaterValueFactorSource;
  const coefficientSetVersion = source?.coefficientSetVersion ?? "unmapped";
  return {
    coefficientSetVersion,
    endpointBreakdown: { status: "available" }, // Appendix D Table D1で4内訳が個別公開されている(aop-mapping-v1.md §1.3)
    damageTimeProfile: buildDamageTimeProfile(subFactor),
    siteCorrection: buildSiteCorrection(source),
    pathway: WATER_PATHWAYS[pathwayKey(SUB_FACTOR[subFactor])],
    underlyingModel: buildUnderlyingModel(subFactor, coefficientSetVersion),
    flowInterpretation: {
      inputProvides: "withdrawal m3",
      methodAssumes: "water consumption m3",
      status: "assumed_equivalent",
      evidence: FLOW_INTERPRETATION_EVIDENCE,
    },
  };
}

/**
 * 値が0の場合の意味を§5.6の優先順位規則に従って確定する。
 * 規則2:出典(Table D1)が0.00を公表しているだけで非該当・被覆外の明示が無ければ`published_zero`
 * を採り、`computed_zero`(自社計算でも入力0等から0になった)を候補として残す。
 * 出典が無い場合は意味を確定せず、literalのevidenceにその旨を記録する(値を0として計算はする。
 * これは既存のcentralValue計算式を変えないため。ゼロの"意味"だけを未確定のまま残す)。
 */
function buildZeroMeaning(
  vfValue: number,
  source: IfviWaterValueFactorSource | undefined
): { zeroMeaning?: ZeroMeaning; literalNote?: string } {
  if (vfValue !== 0) return {};
  if (!source) return { literalNote: "出典未供給のためゼロ意味未確定(MethodConfig.ifviWaterValueFactorSourceが未指定)" };
  return {
    zeroMeaning: {
      code: "published_zero",
      candidates: ["computed_zero"],
      rationale: "規則2: Appendix D Table D1 が 0.00 を公表。非該当・被覆外の明示なし(§5.6優先順位)",
      evidence: source.evidence,
      assignedBy: "method_adapter",
    },
  };
}

function buildVfModelSteps(
  input: PhysicalQuantityInput,
  subFactor: SubFactorKind,
  vfValue: number,
  source: IfviWaterValueFactorSource | undefined
): TraceStepDraft[] {
  const settingKey = SETTING_KEYS[subFactor];
  const lookupId = `ifvi-water-consumption.${SUB_FACTOR[subFactor]}.coefficient_lookup`;
  const applicationId = `ifvi-water-consumption.${SUB_FACTOR[subFactor]}.coefficient_application`;
  const { zeroMeaning, literalNote } = buildZeroMeaning(vfValue, source);

  const evidence: EvidenceRef[] = source
    ? source.evidence
    : [
        {
          source: "MethodConfig.externalValueFactors",
          tier: "primary",
          note: literalNote ?? "IFVI Appendix D Table D1由来の価値係数(出典メタデータ未供給)",
        },
      ];

  return [
    {
      id: lookupId,
      role: "method_model",
      kind: "coefficient_lookup",
      label: `${SUB_FACTOR[subFactor]}のVF照会(USD/m3)`,
      formula: "vf(Appendix D Table D1)",
      operation: { op: "identity", operand: "vf" },
      inputs: {
        vf: {
          kind: "literal",
          value: vfValue,
          unit: "USD/m3",
          currency: "USD",
          settingKey,
          evidence,
          zeroMeaning,
        },
      },
      evidence,
      applied: true,
      outputUnit: "USD",
      outputCurrency: "USD",
    },
    {
      id: applicationId,
      role: "method_model",
      kind: "coefficient_application",
      label: `${SUB_FACTOR[subFactor]}の適用`,
      formula: "quantity × vf",
      operation: { op: "product", operands: ["quantity", "vf"] },
      inputs: {
        quantity: {
          kind: "literal",
          value: input.physicalQuantity,
          unit: input.unit,
          evidence: [{ source: "PhysicalQuantityInput", tier: "primary", note: "拠点提供の取水量" }],
        },
        vf: { kind: "ref", stepId: lookupId },
      },
      evidence: [],
      applied: true,
      outputUnit: "USD",
      outputCurrency: "USD",
      expectedOutput: { value: input.physicalQuantity * vfValue, unit: "USD", currency: "USD" },
    },
  ];
}

export const ifviWaterConsumptionPlugin: MonetizationMethodPlugin = {
  methodId: "ifvi-water-consumption",
  version: "2026-03-final",
  licenseMode: "bring_your_own_license", // 商用利用には契約締結が必要(docs/data/licensing.md)
  supportedCategories: ["water"],

  evaluate(input: PhysicalQuantityInput, config: MethodConfig): MethodOutput[] {
    const nutritionFactor = requireValueFactor(config, VALUE_FACTOR_KEYS.nutrition);
    const diseaseFactor = requireValueFactor(config, VALUE_FACTOR_KEYS.disease);
    const esFactor = requireValueFactor(config, VALUE_FACTOR_KEYS.es);
    const accessFactor = requireValueFactor(config, VALUE_FACTOR_KEYS.access);

    const nutritionValue = input.physicalQuantity * nutritionFactor;
    const diseaseValue = input.physicalQuantity * diseaseFactor;
    const esValue = input.physicalQuantity * esFactor;
    const accessValue = input.physicalQuantity * accessFactor;

    const source = config.ifviWaterValueFactorSource;

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
      zeroMeaning: buildZeroMeaning(nutritionFactor, source).zeroMeaning,
      modelSteps: buildVfModelSteps(input, "nutrition", nutritionFactor, source),
      traceMeta: buildIfviTraceMeta("nutrition", config),
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
      zeroMeaning: buildZeroMeaning(diseaseFactor, source).zeroMeaning,
      modelSteps: buildVfModelSteps(input, "disease", diseaseFactor, source),
      traceMeta: buildIfviTraceMeta("disease", config),
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
      zeroMeaning: buildZeroMeaning(esFactor, source).zeroMeaning,
      modelSteps: buildVfModelSteps(input, "es", esFactor, source),
      traceMeta: buildIfviTraceMeta("es", config),
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
      zeroMeaning: buildZeroMeaning(accessFactor, source).zeroMeaning,
      modelSteps: buildVfModelSteps(input, "access", accessFactor, source),
      traceMeta: buildIfviTraceMeta("access", config),
    };

    return [vFnutrition, vFdisease, vFes, vFaccess];
  },

  reconciliation: {
    reconstruct: reconstructIfviWaterConsumption,
    goldenTestVectors: SYNTHETIC_GOLDEN_VECTORS,
    tolerance: 1e-6,
  },
};

/**
 * 完成実装 T-05:IFVI Eq.2の集計値を、4本の内訳トレースの最終値(較正後)から独立に組み立てる。
 * 内訳分析の表示用であり、`ValuationRecord`には格納しない(4本の内訳は既存どおり個別に保存する)。
 * 4本の最終値は`ref`ではなく`literal`として取り込む(別トレースの内部ステップを跨いで参照しない)。
 * MAX→SUMの2ステップで、IFVI Eq.2の非線形な相互作用(MAXでどの項が選ばれるか)をそのまま保持する。
 */
export function buildIfviAggregateTrace(subTraces: MethodEvaluationTrace[]): MethodEvaluationTrace {
  const byId = new Map(subTraces.map((t) => [t.subFactorId, t]));
  const nutrition = byId.get(SUB_FACTOR.nutrition);
  const disease = byId.get(SUB_FACTOR.disease);
  const es = byId.get(SUB_FACTOR.es);
  const access = byId.get(SUB_FACTOR.access);

  if (!nutrition || !disease || !es || !access) {
    throw new Error("IFVI集計トレースには4本すべての内訳トレース(VFnutrition/VFdisease/VFes/VFaccess)が必要です。");
  }

  function literalFrom(trace: MethodEvaluationTrace, settingKey: string): TraceStepDraft["inputs"][string] {
    return {
      kind: "literal",
      value: trace.finalValue.value,
      unit: trace.finalValue.unit,
      currency: trace.finalValue.currency,
      priceYear: trace.finalValue.priceYear,
      settingKey,
      evidence: [
        {
          source: `${trace.methodId}.${trace.subFactorId}`,
          locator: `trace.hash=${trace.hash}`,
          tier: "primary",
          note: "内訳トレースの最終値をそのまま取り込む(refではなくliteral。内訳分析表示用の独立集計のため)。",
        },
      ],
    };
  }

  const maxStepId = "ifvi-water-consumption.aggregate.max";
  const sumStepId = "ifvi-water-consumption.aggregate.sum";

  const maxStep: TraceStepDraft = {
    id: maxStepId,
    role: "method_model",
    kind: "aggregation",
    label: "近接期3経路のMAX(nutrition/disease/es)",
    formula: "MAX(VFnutrition, VFdisease, VFes)",
    operation: { op: "max", operands: ["nutrition", "disease", "es"] },
    inputs: {
      nutrition: literalFrom(nutrition, "vf_nutrition_final"),
      disease: literalFrom(disease, "vf_disease_final"),
      es: literalFrom(es, "vf_es_final"),
    },
    evidence: [],
    applied: true,
    outputUnit: "JPY",
    outputCurrency: "JPY",
  };

  const sumStep: TraceStepDraft = {
    id: sumStepId,
    role: "method_model",
    kind: "aggregation",
    label: "VFaccess + MAX(VFnutrition, VFdisease, VFes)",
    formula: "access + max",
    operation: { op: "sum", operands: ["access", "max"] },
    inputs: {
      access: literalFrom(access, "vf_access_final"),
      max: { kind: "ref", stepId: maxStepId },
    },
    evidence: [],
    applied: true,
    outputUnit: "JPY",
    outputCurrency: "JPY",
  };

  return finalizeTrace({
    traceVersion: "1",
    methodId: "ifvi-water-consumption",
    subFactorId: "VFH2O",
    recordMethodId: "ifvi-water-consumption",
    methodVersion: access.methodVersion,
    coefficientSetVersion: access.coefficientSetVersion,
    physicalQuantityId: access.physicalQuantityId,
    inputSnapshot: access.inputSnapshot,
    flowInterpretation: access.flowInterpretation,
    endpointBreakdown: { status: "available" },
    damageTimeProfile: {
      status: "not_applicable",
      reason: "集計値(Eq.2)は割引あり(VFaccess)と割引なし(VFnutrition/VFdisease/VFes)を混在させ、単一の時間プロファイルを持たない",
    },
    siteCorrection: access.siteCorrection,
    pathway: {
      pressure: "water_withdrawal",
      midpoint: "unmapped",
      damagePathway: "unmapped",
      aopCode: "unmapped",
      metric: "USD",
      valuationTechnique: "unmapped",
      mappingVersion: PATHWAY_MAPPING_VERSION,
      review: {
        status: "draft",
        reviewer: { kind: "ai" },
        reviewedAt: "2026-09-06",
        verification: [
          "IFVI Eq.2の集計値は厚生価値(VFnutrition/VFdisease/VFes)と交換価値(VFaccess)を内部で混在させるため、" +
            "単一の因果経路を持たない(aop-mapping-v1.md §0)",
        ],
      },
      evidence: [{ source: "docs/data/aop-mapping-v1.md", locator: "§0 重要な留保", tier: "secondary" }],
    },
    underlyingModel: {
      description: "IFVI Eq.2の集計(VFaccess + MAX(VFnutrition, VFdisease, VFes))。内訳の相互作用(MAX)を保持した表示用集計。",
      dataGeneration: access.coefficientSetVersion,
      evidence: [{ source: "docs/data/aop-mapping-v1.md", locator: "§1.3", tier: "secondary" }],
    },
    license: access.license,
    steps: [maxStep, sumStep],
  });
}
