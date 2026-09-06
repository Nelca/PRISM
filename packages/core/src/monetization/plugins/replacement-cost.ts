/**
 * 代替費用法(自社定義・外部方法論ではない)。
 * 参照元: docs/requirements/m3-monetization-engine.md §8.1、docs/data/aop-mapping-v1.md §3
 *
 * 「今この瞬間の代替調達コストはいくらか」という、時間次元を持たない交換価値ベースの
 * 最もシンプルな基準値。エンドポイントモデルを用いないため aopCode は"not_applicable"。
 * 割引現在価値化は含めない(M3 D-8.1)。便益移転を行わないため transferFitness も
 * "not_applicable"(M3 D-4.2)。
 *
 * 完成実装 T-05:`modelSteps`(係数照会→適用の2ステップ)と`traceMeta`を追加する。
 * `centralValue`の計算式(quantity × unitReplacementCost)自体は変更しない。
 * D-8.1により割引を含めないため、`damageTimeProfile`等はすべて`not_applicable`。
 */

import type { MethodOutput, MonetizationMethodPlugin, PhysicalQuantityInput, MethodConfig } from "../../types/valuation";
import type { EvidenceRef } from "../../types/comparison";
import type { TraceStepDraft } from "../../types/trace";
import { WATER_PATHWAYS } from "../trace/pathway-mapping";

function buildModelSteps(input: PhysicalQuantityInput, unitReplacementCost: number): TraceStepDraft[] {
  const lookupEvidence: EvidenceRef[] = [
    {
      source: "企業提供(MethodConfig.unitReplacementCost)",
      tier: "primary",
      note: "物理量1単位あたりの代替調達コスト(円)。企業提供のデータでありPRISM側で推定しない(D-15)。",
    },
  ];
  const lookupId = "replacement-cost.coefficient_lookup";
  return [
    {
      id: lookupId,
      role: "method_model",
      kind: "coefficient_lookup",
      label: "単位あたり代替調達コストの照会",
      formula: "unitReplacementCost(企業提供)",
      operation: { op: "identity", operand: "unitReplacementCost" },
      inputs: {
        unitReplacementCost: {
          kind: "literal",
          value: unitReplacementCost,
          unit: "JPY",
          currency: "JPY",
          settingKey: "unit_replacement_cost",
          evidence: lookupEvidence,
        },
      },
      evidence: lookupEvidence,
      applied: true,
      outputUnit: "JPY",
      outputCurrency: "JPY",
    },
    {
      id: "replacement-cost.coefficient_application",
      role: "method_model",
      kind: "coefficient_application",
      label: "取水量への係数適用",
      formula: "quantity × unitReplacementCost",
      operation: { op: "product", operands: ["quantity", "unitReplacementCost"] },
      inputs: {
        quantity: {
          kind: "literal",
          value: input.physicalQuantity,
          unit: input.unit,
          evidence: [{ source: "PhysicalQuantityInput", tier: "primary", note: "拠点提供の取水量" }],
        },
        unitReplacementCost: { kind: "ref", stepId: lookupId },
      },
      evidence: [],
      applied: true,
      outputUnit: "JPY",
      outputCurrency: "JPY",
      expectedOutput: { value: input.physicalQuantity * unitReplacementCost, unit: "JPY", currency: "JPY" },
    },
  ];
}

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
      // unitReplacementCostは企業提供の現地通貨(円)建て単価であり、地理較正(PPP等)の
      // 対象ではない(D-127・D-128で発見・修正)。
      skipGeographicCalibration: true,
      modelSteps: buildModelSteps(input, config.unitReplacementCost),
      traceMeta: {
        coefficientSetVersion: "unmapped", // 企業提供の単価であり、外部係数セットの版は存在しない
        endpointBreakdown: { status: "not_applicable", reason: "エンドポイントモデルを用いない直接コストのため内訳の概念自体が無い" },
        damageTimeProfile: { status: "not_applicable", reason: "D-8.1により割引現在価値化を含めない(時間次元を持たない値)" },
        siteCorrection: { status: "not_applicable", reason: "自社定義の直接コストであり拠点補正の概念はない" },
        pathway: WATER_PATHWAYS["replacement-cost"],
        underlyingModel: {
          description: "取水量に企業提供の単位あたり代替調達コスト(円)を直接乗じるだけの自社定義モデル。",
          dataGeneration: "unmapped",
          evidence: [{ source: "docs/data/aop-mapping-v1.md", locator: "§3 代替費用法", tier: "secondary" }],
        },
        flowInterpretation: {
          inputProvides: "withdrawal m3",
          methodAssumes: "withdrawal m3(取水量あたり調達コスト)",
          status: "match",
          evidence: [{ source: "docs/data/aop-mapping-v1.md", locator: "§3 代替費用法", tier: "secondary" }],
        },
      },
    };

    return [output];
  },
};
