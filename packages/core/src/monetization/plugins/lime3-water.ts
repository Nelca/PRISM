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
 * **centralValueは常にこの単一係数(externalValueFactors)から計算し、変更しない**
 * (完成実装T-05でconfig.lime3WaterCoefficientを追加した後も、既存テスト・既存runとの互換のため)。
 *
 * 実データ(AIST-IDEA Ver.4.0):docs/data/lime3-coefficients-notes.md。
 * アスエネ社保有ライセンス(標準版、有効期限2027-06-30)の範囲内。
 *
 * 完成実装 T-05:`config.lime3WaterCoefficient`(`lib/data/lime3/water-coefficients.ts`)が
 * あれば、物理量→人間健康DALY→US$統合化の2段トレースを`modelSteps`として提供する。
 * 無ければ現行どおり単一係数1ステップのトレースにフォールバックし、
 * `traceMeta.endpointBreakdown`を`not_published`(構成要素未供給)にする。
 */

import type { MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput, MethodConfig } from "../../types/valuation";
import type { EvidenceRef } from "../../types/comparison";
import type { Availability, TraceStepDraft } from "../../types/trace";
import { WATER_PATHWAYS } from "../trace/pathway-mapping";

const VALUE_FACTOR_KEY = "lime3-water";

const DAMAGE_TIME_PROFILE_EVIDENCE: EvidenceRef[] = [
  {
    source: "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
    locator: "注4(LIME3書籍p.24を引用)",
    tier: "primary",
    note: "LIME3の割引率(利子率)は社会資産エンドポイントのみに適用される。水消費(100%人間健康配分)には作動しない。",
  },
  { source: "docs/data/method-recalculability.md", locator: "§3.2 割引率:確度高で確認、ただし水消費には実質適用されない", tier: "secondary" },
];

const FLOW_INTERPRETATION_EVIDENCE: EvidenceRef[] = [
  {
    source: "docs/data/lime3-coefficients-notes.md",
    locator: "§3.1・§3.2",
    tier: "secondary",
    note: "表層水・消費国=日本を既定採用した根拠と未確認の仮定(消費国/生産国の選択肢なし、表層水/地下水の仮定、価格基準年未確認)",
  },
  {
    source: "docs/decisions/design-rationale-log.md",
    locator: "D-126",
    tier: "secondary",
    note: "表層水/消費国の選択は確認された事実ではなく実装上の仮定であることの明示",
  },
];

const UNDERLYING_MODEL_EVIDENCE: EvidenceRef[] = [
  { source: "docs/data/lime3-coefficients-notes.md", locator: "§2〜§3", tier: "secondary" },
  { source: "docs/data/aop-mapping-v1.md", locator: "§2.1 水資源との接続", tier: "secondary" },
];

function buildTraceMeta(config: MethodConfig): NonNullable<MethodOutput["traceMeta"]> {
  const coefficient = config.lime3WaterCoefficient;
  const coefficientSetVersion = coefficient?.coefficientSetVersion ?? "unmapped";
  const endpointBreakdown: Availability = coefficient
    ? { status: "available" }
    : {
        status: "not_published",
        reason:
          "MethodConfig.lime3WaterCoefficientが未指定のため、統合化係数(DALY→US$の構成要素は非公開)のみで計算している",
      };

  return {
    coefficientSetVersion,
    endpointBreakdown,
    damageTimeProfile: {
      status: "not_applicable",
      reason: "LIME3の割引率は社会資産エンドポイント限定であり、水消費(100%人間健康配分)には作動しない",
      evidence: DAMAGE_TIME_PROFILE_EVIDENCE,
    },
    siteCorrection: {
      status: "not_applicable",
      reason: "LIME3統合化係数(消費国×世界平均/日本の国レベル値)に拠点補正の概念はない",
    },
    pathway: WATER_PATHWAYS["lime3-water"],
    underlyingModel: {
      description:
        "水消費(取水量)→水不足→人間健康DALY(LIME3特性化係数)。DALY→US$は統合化係数(LIME3重み付け・利子率2%)による貨幣化。",
      dataGeneration: coefficientSetVersion,
      evidence: UNDERLYING_MODEL_EVIDENCE,
    },
    flowInterpretation: {
      inputProvides: "withdrawal m3",
      methodAssumes: "取水 基本フロー(表層水 001511000 を既定採用)",
      status: "assumed_equivalent",
      evidence: FLOW_INTERPRETATION_EVIDENCE,
    },
  };
}

/** `config.lime3WaterCoefficient`が無い場合の単一係数1ステップ(現行どおり)。 */
function buildLegacySingleFactorStep(input: PhysicalQuantityInput, valueFactor: number): TraceStepDraft {
  const evidence: EvidenceRef[] = [
    {
      source: 'MethodConfig.externalValueFactors["lime3-water"]',
      tier: "primary",
      note: "LIME3統合化係数(構成要素の内訳は非公開)",
    },
  ];
  return {
    id: "lime3-water.coefficient_application",
    role: "method_model",
    kind: "coefficient_application",
    label: "統合化係数(US$/m3)の適用(構成要素非公開)",
    formula: "quantity × integrated_usd_per_m3",
    operation: { op: "product", operands: ["quantity", "integratedUsdPerM3"] },
    inputs: {
      quantity: {
        kind: "literal",
        value: input.physicalQuantity,
        unit: input.unit,
        evidence: [{ source: "PhysicalQuantityInput", tier: "primary", note: "拠点提供の取水量" }],
      },
      integratedUsdPerM3: {
        kind: "literal",
        value: valueFactor,
        unit: "USD/m3",
        currency: "USD",
        settingKey: "integrated_usd_per_m3",
        evidence,
      },
    },
    evidence,
    applied: true,
    outputUnit: "USD",
    outputCurrency: "USD",
  };
}

/**
 * `config.lime3WaterCoefficient`がある場合の2段(物理量→DALY→US$)4ステップ。
 * 最終ステップの`expectedOutput`は quantity × integratedUsdPerM3(= centralValueと同じ計算式)と
 * 許容誤差内で一致することを要求する(誤ったトレースを出すより出さない、§5.3)。
 */
function buildDecomposedSteps(
  input: PhysicalQuantityInput,
  coefficient: NonNullable<MethodConfig["lime3WaterCoefficient"]>
): TraceStepDraft[] {
  const dalyLookupId = "lime3-water.coefficient_lookup";
  const allocationId = "lime3-water.endpoint_allocation";
  const dalyApplicationId = "lime3-water.coefficient_application.daly";
  const usdApplicationId = "lime3-water.coefficient_application.usd";

  const quantityOperand = {
    kind: "literal" as const,
    value: input.physicalQuantity,
    unit: input.unit,
    evidence: [{ source: "PhysicalQuantityInput", tier: "primary" as const, note: "拠点提供の取水量" }],
  };

  return [
    {
      id: dalyLookupId,
      role: "method_model",
      kind: "coefficient_lookup",
      label: "人間健康DALY/m3の照会",
      formula: "humanHealthDalyPerM3(CSV該当セル)",
      operation: { op: "identity", operand: "dalyPerM3" },
      inputs: {
        dalyPerM3: {
          kind: "literal",
          value: coefficient.humanHealthDalyPerM3,
          unit: "DALY/m3",
          settingKey: "daly_per_m3",
          evidence: coefficient.evidence,
        },
        // "perspective"(採用列。例:消費国・日本)は文字列であり数値化できないため、
        // 実際の計算(operation)には使わず、このマーカーのevidence/noteに記録する。
        // 反実仮想での視点差し替え(T-07、消費国世界平均⇄日本)の対象キーはDALY側のこの
        // オペランドに付与し、usd_per_daly側(coefficient_application.usd)には付与しない。
        perspectiveColumn: {
          kind: "literal",
          value: 1,
          unit: "n/a(採用列を示す符号。数値自体に意味はない)",
          settingKey: "perspective_column",
          evidence: [
            {
              source: "docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv",
              note: `採用視点: ${coefficient.perspective}(基本フロー${coefficient.sourceFlowId})`,
              tier: "primary",
            },
          ],
        },
      },
      evidence: coefficient.evidence,
      applied: true,
      outputUnit: "DALY/m3",
    },
    {
      id: allocationId,
      role: "method_model",
      kind: "endpoint_allocation",
      label: "人間健康エンドポイントへの配分(100%)",
      formula: "allocationFraction = 1(人間健康以外はnot_applicable)",
      operation: { op: "identity", operand: "allocationFraction" },
      inputs: {
        allocationFraction: {
          kind: "literal",
          value: 1,
          unit: "fraction",
          evidence: [
            {
              source:
                "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
              locator: "Table 2",
              tier: "primary",
              note:
                "水消費の損害は100%人間健康に配分され、社会資産・生物多様性・一次生産への配分はゼロ" +
                "(CSV該当列も空欄。coefficient.otherEndpointsのAvailabilityを参照)",
            },
          ],
        },
      },
      evidence: [
        {
          source:
            "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
          locator: "Table 2",
          tier: "primary",
        },
      ],
      applied: true,
      outputUnit: "fraction",
    },
    {
      id: dalyApplicationId,
      role: "method_model",
      kind: "coefficient_application",
      label: "取水量への係数適用(DALY)",
      formula: "quantity × dalyPerM3 × allocationFraction",
      operation: { op: "product", operands: ["quantity", "dalyPerM3", "allocationFraction"] },
      inputs: {
        quantity: quantityOperand,
        dalyPerM3: { kind: "ref", stepId: dalyLookupId },
        allocationFraction: { kind: "ref", stepId: allocationId },
      },
      evidence: [],
      applied: true,
      outputUnit: "DALY",
    },
    {
      id: usdApplicationId,
      role: "method_model",
      kind: "coefficient_application",
      label: "DALYの貨幣化(統合化係数)",
      formula: "dalyAllocated × usdPerDaly",
      operation: { op: "product", operands: ["dalyAllocated", "usdPerDaly"] },
      inputs: {
        dalyAllocated: { kind: "ref", stepId: dalyApplicationId },
        usdPerDaly: {
          kind: "literal",
          value: coefficient.integrationUsdPerDaly,
          unit: "USD/DALY",
          currency: "USD",
          settingKey: "usd_per_daly",
          evidence: coefficient.evidence,
        },
      },
      evidence: coefficient.evidence,
      applied: true,
      outputUnit: "USD",
      outputCurrency: "USD",
      expectedOutput: { value: input.physicalQuantity * coefficient.integratedUsdPerM3, unit: "USD", currency: "USD" },
    },
  ];
}

export const lime3WaterPlugin: MonetizationMethodPlugin = {
  methodId: "lime3-water",
  version: "3.0.0", // LIME3
  licenseMode: "bring_your_own_license", // アスエネ社保有のAIST-IDEA標準版ライセンスで利用(licensing.md参照)
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
      modelSteps: config.lime3WaterCoefficient
        ? buildDecomposedSteps(input, config.lime3WaterCoefficient)
        : [buildLegacySingleFactorStep(input, valueFactor)],
      traceMeta: buildTraceMeta(config),
    };

    return [output];
  },
};
