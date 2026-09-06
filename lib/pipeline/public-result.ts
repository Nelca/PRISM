import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type { PhysicalQuantityInput, ValueFactorRecord } from "@core/types/valuation";
import type { DivergenceDecompositionV2 } from "@core/types/divergence";
import type { MethodEvaluationTrace } from "@core/types/trace";
import type { SwappedSetting } from "@core/types/recipe";

/**
 * 完成実装 T-14:出力APIでは**計算トレース内の係数リテラル値を再配布しない**。
 *
 * LIME3(AIST-IDEA、BYOL)・IFVI(要契約)の原係数は、トレースのステップに
 *   - `inputs` のリテラル値(例 DALY/m³、統合化係数、VF)
 *   - そのステップの `output.value`(係数照会ステップの出力は係数そのもの)
 * として現れる。前者だけを伏せても後者から復元できるため、**両方**を省く。
 * 単位・通貨・価格年・`settingKey`・出典参照(evidence)・`applied`/`skipReason`・
 * 各ステップのハッシュ・最終値(`finalValue`)・入手状態(availability)・因果経路は残す
 * (監査に必要で、かつ係数そのものではないため)。
 */
function publicTraceValue<T extends { value: number }>(value: T): Omit<T, "value"> & { valueRedacted: true } {
  const { value: _redacted, ...rest } = value;
  void _redacted;
  return { ...rest, valueRedacted: true };
}

function publicTrace(trace: MethodEvaluationTrace | undefined): Record<string, unknown> | undefined {
  if (!trace) return undefined;
  return {
    ...trace,
    inputSnapshot: publicInputSnapshot(trace.inputSnapshot),
    steps: trace.steps.map((step) => ({
      ...step,
      inputs: Object.fromEntries(
        Object.entries(step.inputs).map(([name, operand]) => [
          name,
          operand.kind === "literal"
            ? publicTraceValue(operand)
            : operand.kind === "series"
              ? { ...operand, values: undefined, valueRedacted: true }
              : operand,
        ])
      ),
      output: publicTraceValue(step.output),
    })),
  };
}

/** 反実仮想の差し替え内容も、前後の係数値そのものは返さない(ラベル・出典・キーは残す)。 */
function publicSwapped(swapped: SwappedSetting[]) {
  return swapped.map((entry) => ({
    ...entry,
    from: publicTraceValue({ ...entry.from, value: 0 }),
    to: publicTraceValue({ ...entry.to, value: 0 }),
  }));
}

/**
 * 乖離分解(V2)の公開形。寄与・残差・到達値 V*・停止理由・定性差異・次アクションは返し、
 * 差し替え前後の係数値だけを省く。
 */
function publicDecomposition(decomposition: DivergenceDecompositionV2): Record<string, unknown> {
  return {
    ...decomposition,
    groups: decomposition.groups.map((group) => ({
      ...group,
      crossMethodPairs: group.crossMethodPairs.map((pair) =>
        pair.status === "decomposed"
          ? {
              ...pair,
              contributions: pair.contributions.map((contribution) => ({
                ...contribution,
                swapped: publicSwapped(contribution.swapped),
              })),
              subsets: pair.subsets.map((subset) => ({ ...subset, swapped: publicSwapped(subset.swapped) })),
            }
          : pair
      ),
    })),
  };
}

function publicInputSnapshot(input: PhysicalQuantityInput | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const base = {
    category: input.category,
    unit: input.unit,
    siteId: input.siteId,
    sourceRegion: input.sourceRegion,
    targetRegion: input.targetRegion,
  };
  if (input.category === "pollution") {
    return {
      ...base,
      reportingYear: input.reportingYear,
      prtrListVersion: input.prtrListVersion,
      prtrSubstanceCode: input.prtrSubstanceCode,
      releaseMedium: input.releaseMedium,
      sourceKind: input.sourceKind,
    };
  }
  if (input.category === "waste") {
    return {
      ...base,
      reportingPeriod: input.reportingPeriod,
      wasteTypeCode: input.wasteTypeCode,
      hazardous: input.hazardous,
      treatmentRoute: input.treatmentRoute,
      treatmentLocation: input.treatmentLocation,
      weightBasis: input.weightBasis,
    };
  }
  if (input.category === "land_use") {
    return input.activityKind === "conversion"
      ? { ...base, activityKind: input.activityKind, landClassBefore: input.landClassBefore, landClassAfter: input.landClassAfter }
      : { ...base, activityKind: input.activityKind, landClass: input.landClass };
  }
  return { ...base, physicalQuantity: input.physicalQuantity };
}

function publicFactorSnapshot(factor: ValueFactorRecord | undefined): Record<string, unknown> | undefined {
  if (!factor) return undefined;
  // 原係数値と名称はLIME3ライセンス資産なので、出力APIでは再配布しない。
  return {
    factorId: factor.factorId,
    methodId: factor.methodId,
    methodVersion: factor.methodVersion,
    sourceFlowId: factor.sourceFlowId,
    medium: factor.medium,
    denominatorUnit: factor.denominatorUnit,
    currency: factor.currency,
    priceYear: factor.priceYear,
    geographicPerspective: factor.geographicPerspective,
    sourceRegion: factor.sourceRegion,
    sourceHash: factor.sourceHash,
    licenseMode: factor.licenseMode,
    licenseValidUntil: factor.licenseValidUntil,
  };
}

/** API利用者向け。顧客原本の識別子/hashとライセンス対象の原係数を除いた結果を返す。 */
export function buildPublicPipelineResult(result: DemoPipelineResult) {
  const valuationRecordsByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.valuationRecordsByMaterialIssue).map(([materialIssueId, records]) => [
      materialIssueId,
      records.map((record) => ({
        ...record,
        inputSnapshot: publicInputSnapshot(record.inputSnapshot),
        factorSnapshot: publicFactorSnapshot(record.factorSnapshot),
        trace: publicTrace(record.trace),
      })),
    ])
  );
  const assumptionEntries = result.assumptionEntries.map((entry) => {
    if (entry.payload.module !== "M3" || entry.payload.kind !== "input_mapping") return entry;
    return { ...entry, payload: { ...entry.payload, sourceRecordHash: null } };
  });
  const expansionCategories = new Set(["pollution", "waste", "land_use"]);
  const physicalQuantityByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.physicalQuantityByMaterialIssue).filter(([, quantity]) => !expansionCategories.has(quantity.category))
  );
  const physicalQuantitiesByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.physicalQuantitiesByMaterialIssue).filter(
      ([, quantities]) => quantities.every((quantity) => !expansionCategories.has(quantity.category))
    )
  );
  // LIME3原係数は centralValue / (物理量 × 通貨換算率) で復元できるため、公開APIでは
  // 追加カテゴリの正確な物理量を全ての重複経路から除く。行数・単位・算定状態は残す。
  const coverageByMaterialIssue = Object.fromEntries(
    Object.entries(result.valuation.coverageByMaterialIssue).map(([materialIssueId, coverage]) => [
      materialIssueId,
      {
        sourceKind: coverage.sourceKind,
        reportingPeriod: coverage.reportingPeriod,
        units: coverage.quantities.map((quantity) => quantity.unit),
        rowCounts: coverage.rowCounts,
        mappingVersion: coverage.mappingVersion,
        coefficientVersion: coverage.coefficientVersion,
        quantitiesRedacted: true,
      },
    ])
  );
  return {
    ...result,
    valuation: {
      ...result.valuation,
      valuationRecordsByMaterialIssue,
      divergenceDecompositions: result.valuation.divergenceDecompositions.map(publicDecomposition),
      physicalQuantityByMaterialIssue,
      physicalQuantitiesByMaterialIssue,
      coverageByMaterialIssue,
    },
    assumptionEntries,
  };
}
