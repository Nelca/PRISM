/**
 * 完成実装 T-05:M3プラグイン出力(`MethodOutput`)から再生可能な計算トレース
 * (`MethodEvaluationTrace`)を組み立てる。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.3、T-05
 *
 * `build-valuation-records.ts` が適用する通貨換算・地理較正(D-3)と同じ数値・同じ順序を、
 * 独立したステップとして記録する。手法内部モデル(`output.modelSteps`)を持たないプラグインには
 * 汎用フォールバック(較正前centralValueを1ステップとして扱う)で補い、`adapterCoverage` に
 * 実態を記録する(値を推論で埋めない)。
 *
 * 最終値は共有評価器(`packages/core/src/trace/evaluate-trace.ts`)の `finalizeTrace` で確定し、
 * `ValuationRecord.centralValue` と許容誤差(tol-v1、money)内で一致しなければ例外にする
 * (誤ったトレースを出すより出さない、§5.3)。
 */

import type { EvidenceRef } from "../../types/comparison";
import type { LicenseMode } from "../../types/common";
import type {
  CurrencyConversionRecord,
  FactorResolution,
  GeographicCalibrationRecord,
  MethodConfig,
  MethodOutput,
  PhysicalQuantityInput,
} from "../../types/valuation";
import type { MethodEvaluationTrace, TraceStepDraft } from "../../types/trace";
import { finalizeTrace } from "../../trace/evaluate-trace";
import { applyGeographicCalibration } from "../calibration";
import { PATHWAY_MAPPING_VERSION } from "./pathway-mapping";

/** このトレースを生成した日(ISO 8601)。フォールバック合成分のreviewedAtに使う。 */
const FALLBACK_REVIEWED_AT = "2026-09-06";

export interface BuildMethodEvaluationTraceInput {
  output: MethodOutput;
  plugin: { methodId: string; version: string; licenseMode: LicenseMode };
  /** `ValuationRecord.methodId` と同じ `{親手法ID}.{内訳ID}` 形式。 */
  recordMethodId: string;
  physicalQuantityId: string;
  input: PhysicalQuantityInput;
  calibration: GeographicCalibrationRecord;
  currencyConversion?: CurrencyConversionRecord;
  factorResolution?: FactorResolution;
  config: MethodConfig;
}

/** "YYYY-MM-DD" は日本の暦日終端まで有効として扱う(build-valuation-records.tsのライセンス判定と同じ規則)。 */
function isWithinValidity(validUntil: string | undefined): boolean {
  if (validUntil === undefined) return true;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(validUntil)
    ? new Date(`${validUntil}T23:59:59.999+09:00`).getTime()
    : new Date(validUntil).getTime();
  return Number.isFinite(end) && end >= Date.now();
}

function computeProductionDisplayAllowed(mode: LicenseMode, validUntil: string | undefined): boolean {
  if (mode === "embedded") return true;
  if (mode === "bring_your_own_license") return isWithinValidity(validUntil);
  return false; // pending_review | reference_only
}

/**
 * `output.modelSteps` が無いプラグイン向けの汎用フォールバック。較正前centralValueを
 * そのまま1ステップの literal として扱う(内部モデルの分解は表現できない、事実をそのまま示す)。
 */
function buildGenericFallbackStep(
  output: MethodOutput,
  plugin: { methodId: string; version: string },
  recordMethodId: string,
  sourceCurrency: "JPY" | "USD" | "EUR"
): TraceStepDraft {
  const evidence: EvidenceRef[] = [
    {
      source: `${plugin.methodId}@${plugin.version} evaluate()`,
      tier: "primary",
      note: "手法アダプターが計算ステップ(modelSteps)を公開していないため、較正前中心値をそのまま1ステップとして扱う(generic_fallback)。",
    },
  ];
  return {
    id: `${recordMethodId}.generic_fallback`,
    role: "method_model",
    kind: "coefficient_application",
    label: `${plugin.methodId} 較正前中心値(内部モデル非公開)`,
    formula: "centralValue(較正前、プラグイン内部計算)",
    operation: { op: "identity", operand: "centralValue" },
    inputs: {
      centralValue: {
        kind: "literal",
        value: output.centralValue,
        unit: sourceCurrency,
        currency: sourceCurrency,
        evidence,
      },
    },
    evidence,
    applied: true,
    outputUnit: sourceCurrency,
    outputCurrency: sourceCurrency,
  };
}

function buildCurrencyConversionStep(params: {
  recordMethodId: string;
  previousStepId: string;
  currencyConversion: CurrencyConversionRecord;
  expectedOutputValue: number;
}): TraceStepDraft {
  const { recordMethodId, previousStepId, currencyConversion, expectedOutputValue } = params;
  const evidence: EvidenceRef[] = [
    { source: currencyConversion.source, locator: currencyConversion.rateDate, tier: "primary" },
  ];
  return {
    id: `${recordMethodId}.currency_conversion`,
    role: "reconciliation",
    kind: "currency_conversion",
    label: `${currencyConversion.fromCurrency}→${currencyConversion.toCurrency} 通貨換算`,
    formula: "value(source) × fx_rate",
    operation: { op: "product", operands: ["value", "rate"] },
    inputs: {
      value: { kind: "ref", stepId: previousStepId },
      rate: {
        kind: "literal",
        value: currencyConversion.rate,
        unit: `${currencyConversion.toCurrency}/${currencyConversion.fromCurrency}`,
        settingKey: "fx_rate",
        evidence,
      },
    },
    evidence,
    applied: true,
    outputUnit: currencyConversion.toCurrency,
    outputCurrency: currencyConversion.toCurrency,
    expectedOutput: { value: expectedOutputValue, unit: currencyConversion.toCurrency, currency: currencyConversion.toCurrency },
  };
}

function buildGeographicCalibrationStep(params: {
  recordMethodId: string;
  previousStepId: string;
  calibration: GeographicCalibrationRecord;
  skip: boolean;
  expectedFinalValue: number;
}): TraceStepDraft {
  const { recordMethodId, previousStepId, calibration, skip, expectedFinalValue } = params;
  const id = `${recordMethodId}.geographic_calibration`;

  if (skip) {
    return {
      id,
      role: "method_model",
      kind: "geographic_calibration",
      label: "地理較正(スキップ)",
      formula: "value(そのまま)",
      operation: { op: "identity", operand: "value" },
      inputs: { value: { kind: "ref", stepId: previousStepId } },
      evidence: [],
      applied: false,
      skipReason:
        "MethodOutput.skipGeographicCalibration=true(既に現地通貨で表現された値のため地理較正を適用しない。D-127・D-128)",
      outputUnit: "JPY",
      outputCurrency: "JPY",
      expectedOutput: { value: expectedFinalValue, unit: "JPY", currency: "JPY" },
    };
  }

  const incomeRatio = calibration.targetIncomeLevel / calibration.sourceIncomeLevel;
  const incomeElasticityAdjustment = incomeRatio ** calibration.incomeElasticity;
  const relativePriceEscalationAdjustment = calibration.relativePriceEscalationRate ** calibration.elapsedYears;

  const pppEvidence: EvidenceRef[] = [{ source: calibration.pppSource, tier: "primary" }];

  return {
    id,
    role: "method_model",
    kind: "geographic_calibration",
    label: "地理較正(PPP×所得弾力性×デフレータ×相対価格上昇×面積スケーリング)",
    formula: "value × ppp × incomeElasticityAdjustment × deflator × relativePriceEscalation × areaScaling",
    operation: {
      op: "product",
      operands: ["value", "ppp", "incomeElasticityAdjustment", "deflator", "relativePriceEscalation", "areaScaling"],
    },
    inputs: {
      value: { kind: "ref", stepId: previousStepId },
      ppp: { kind: "literal", value: calibration.pppValue, unit: "ratio", settingKey: "ppp", evidence: pppEvidence },
      incomeElasticityAdjustment: {
        kind: "literal",
        value: incomeElasticityAdjustment,
        unit: "ratio",
        settingKey: "income_elasticity_adjustment",
        evidence: [
          {
            source: "計算値: (targetIncomeLevel / sourceIncomeLevel) ^ incomeElasticity",
            note:
              `incomeElasticity=${calibration.incomeElasticity}, sourceIncomeLevel=${calibration.sourceIncomeLevel}, ` +
              `targetIncomeLevel=${calibration.targetIncomeLevel}(GeographicCalibrationRecord)`,
            tier: "primary",
          },
        ],
      },
      deflator: { kind: "literal", value: calibration.deflator, unit: "ratio", settingKey: "deflator", evidence: pppEvidence },
      relativePriceEscalation: {
        kind: "literal",
        value: relativePriceEscalationAdjustment,
        unit: "ratio",
        settingKey: "relative_price_escalation",
        evidence: [
          {
            source: "計算値: relativePriceEscalationRate ^ elapsedYears",
            note: `relativePriceEscalationRate=${calibration.relativePriceEscalationRate}, elapsedYears=${calibration.elapsedYears}(GeographicCalibrationRecord)`,
            tier: "primary",
          },
        ],
      },
      areaScaling: { kind: "literal", value: calibration.areaScaling, unit: "ratio", settingKey: "area_scaling", evidence: pppEvidence },
    },
    evidence: pppEvidence,
    applied: true,
    outputUnit: "JPY",
    outputCurrency: "JPY",
    expectedOutput: { value: expectedFinalValue, unit: "JPY", currency: "JPY" },
  };
}

function buildFallbackPathway(output: MethodOutput): MethodEvaluationTrace["pathway"] {
  return {
    pressure: "unmapped",
    midpoint: "unmapped",
    damagePathway: "unmapped",
    aopCode: output.aopCode,
    metric: output.metric ?? "unmapped",
    valuationTechnique: "unmapped",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "draft",
      reviewer: { kind: "ai" },
      reviewedAt: FALLBACK_REVIEWED_AT,
      verification: ["generic_fallback: アダプター未対応のため因果経路を合成していない(WATER_PATHWAYS未登録)"],
    },
    evidence: [{ source: "generic_fallback", note: "アダプター未対応のため因果経路情報なし" }],
  };
}

/**
 * `MethodOutput` からトレースを組み立てる。`output.modelSteps` が無ければ汎用フォールバックで補う。
 * `factorResolution`/`currencyConversion`/`calibration` を使った最終値の計算は
 * `build-valuation-records.ts` の `buildValuationRecordFromOutput` と同じ数値・同じ順序にする。
 */
export function buildMethodEvaluationTrace(input: BuildMethodEvaluationTraceInput): MethodEvaluationTrace {
  const { output, plugin, recordMethodId, physicalQuantityId, input: physicalInput, calibration, currencyConversion, factorResolution } =
    input;

  const factorCurrency = factorResolution?.factor.currency ?? "JPY";
  let currencyAdjustedValue = output.centralValue;
  if (factorCurrency !== "JPY") {
    if (
      !currencyConversion ||
      currencyConversion.fromCurrency !== factorCurrency ||
      currencyConversion.toCurrency !== "JPY" ||
      !Number.isFinite(currencyConversion.rate) ||
      currencyConversion.rate <= 0
    ) {
      throw new Error(`[${recordMethodId}] ${factorCurrency}建て係数には明示的なJPY通貨換算が必要です(トレース生成)。`);
    }
    currencyAdjustedValue *= currencyConversion.rate;
  }
  const expectedFinalValue = output.skipGeographicCalibration
    ? currencyAdjustedValue
    : applyGeographicCalibration(currencyAdjustedValue, calibration);

  const hasModelSteps = Array.isArray(output.modelSteps) && output.modelSteps.length > 0;
  const adapterCoverage: "full" | "generic_fallback" = hasModelSteps ? "full" : "generic_fallback";

  const modelSteps: TraceStepDraft[] = hasModelSteps
    ? (output.modelSteps as TraceStepDraft[])
    : [buildGenericFallbackStep(output, plugin, recordMethodId, factorCurrency)];

  const steps: TraceStepDraft[] = [...modelSteps];
  let valueBeforeCalibrationStepId = modelSteps[modelSteps.length - 1].id;

  if (factorCurrency !== "JPY") {
    // 上のガードで currencyConversion の存在は確定済み。
    const currencyStep = buildCurrencyConversionStep({
      recordMethodId,
      previousStepId: valueBeforeCalibrationStepId,
      currencyConversion: currencyConversion as CurrencyConversionRecord,
      expectedOutputValue: currencyAdjustedValue,
    });
    steps.push(currencyStep);
    valueBeforeCalibrationStepId = currencyStep.id;
  }

  const geoStep = buildGeographicCalibrationStep({
    recordMethodId,
    previousStepId: valueBeforeCalibrationStepId,
    calibration,
    skip: output.skipGeographicCalibration === true,
    expectedFinalValue,
  });
  steps.push(geoStep);

  const traceMeta = output.traceMeta;
  const fallbackReason = "アダプター未対応(generic_fallback)";
  const coefficientSetVersion = traceMeta?.coefficientSetVersion ?? `${plugin.methodId}:generic_fallback`;
  const endpointBreakdown = traceMeta?.endpointBreakdown ?? { status: "not_published" as const, reason: fallbackReason };
  const damageTimeProfile = traceMeta?.damageTimeProfile ?? { status: "not_published" as const, reason: fallbackReason };
  const siteCorrection = traceMeta?.siteCorrection ?? { status: "not_published" as const, reason: fallbackReason };
  const pathway = traceMeta?.pathway ?? buildFallbackPathway(output);
  const underlyingModel = traceMeta?.underlyingModel ?? {
    description: "アダプター未対応(generic_fallback)のため、手法内部モデルの説明を持たない。",
    dataGeneration: "unmapped" as const,
    evidence: [{ source: `${plugin.methodId}@${plugin.version}`, tier: "primary" as const, note: "generic_fallback" }],
  };
  const flowInterpretation = traceMeta?.flowInterpretation ?? {
    inputProvides: physicalInput.unit,
    methodAssumes: physicalInput.unit,
    status: "assumed_equivalent" as const,
    evidence: [{ source: "generic_fallback", note: "アダプター未対応のため入力解釈を検証していない" }],
  };

  const trace = finalizeTrace({
    traceVersion: "1",
    methodId: plugin.methodId,
    subFactorId: output.subFactorId,
    recordMethodId,
    methodVersion: plugin.version,
    coefficientSetVersion,
    physicalQuantityId,
    inputSnapshot: physicalInput,
    flowInterpretation,
    steps,
    endpointBreakdown,
    damageTimeProfile,
    siteCorrection,
    pathway,
    underlyingModel,
    zeroMeaning: output.zeroMeaning,
    license: {
      mode: plugin.licenseMode,
      validUntil: factorResolution?.factor.licenseValidUntil,
      productionDisplayAllowed: computeProductionDisplayAllowed(plugin.licenseMode, factorResolution?.factor.licenseValidUntil),
    },
    adapterCoverage,
  });

  return trace;
}
