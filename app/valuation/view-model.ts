import type { PairwiseDecomposition } from "@core/types/divergence";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { decompositionFactorShortLabel } from "../components/labels";
import type { WaterfallStepInput } from "../components/charts/Waterfall";

export const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・確からしさ)",
};

export function zeroValueNote(record: ValuationRecord): { short: string; detail: string } | null {
  if (record.centralValue !== 0) return null;
  if (record.methodId.startsWith("ifvi-water-consumption.")) {
    const region = record.geographicCalibration.targetRegion;
    const regionLabel = region === "JP" ? "日本" : region;
    return {
      short: `${regionLabel}の公表係数が0のため`,
      detail: `IFVIが公表する${regionLabel}の係数(IFVI水方法論 Appendix D Table D1)が0のため、物理量に関わらず0円になります。`,
    };
  }
  return { short: "当該地点の係数が0のため", detail: "この手法では当該地点の係数が0と評価されています。" };
}

export function pairwiseToWaterfallSteps(
  pair: PairwiseDecomposition,
  labelA: string,
  labelB: string
): WaterfallStepInput[] {
  const steps: WaterfallStepInput[] = [{ label: `${labelA} 中心値`, value: pair.valueA, isTotal: true }];
  let running: number = pair.valueA;
  for (const contribution of pair.contributions) {
    const next = running * contribution.multiplier;
    steps.push({ label: decompositionFactorShortLabel(contribution.factor), value: next - running, isTotal: false });
    running = next;
  }
  if (pair.residual) {
    const next = running * pair.residual.multiplier;
    steps.push({ label: "分解不能な残差", value: next - running, isTotal: false });
    running = next;
  }
  steps.push({ label: `${labelB} 中心値`, value: pair.valueB, isTotal: true });
  return steps;
}

export function additivePairSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  return [
    { label: `${labelA} 中心値`, value: pair.valueA, isTotal: true },
    { label: "金額差", value: pair.valueB - pair.valueA, isTotal: false },
    { label: `${labelB} 中心値`, value: pair.valueB, isTotal: true },
  ];
}
