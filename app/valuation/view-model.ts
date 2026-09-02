import type { PairwiseDecomposition } from "@core/types/divergence";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { decompositionFactorShortLabel } from "../components/labels";
import type { WaterfallStepInput } from "../components/charts/Waterfall";

export const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・確からしさ)",
};

/** 保存済みrunに旧形式の文章が残っていても、比較の向きに依存しない倍率で読み直す。 */
export function readablePairNarrative(pair: PairwiseDecomposition): string {
  const valueA = Number(pair.valueA);
  const valueB = Number(pair.valueB);
  if (!Number.isFinite(valueA) || !Number.isFinite(valueB) || valueA <= 0 || valueB <= 0) return pair.narrative;

  const lead = valueA >= valueB
    ? `${pair.methodIdA} は ${pair.methodIdB} の ${(valueA / valueB).toFixed(2)}倍です。`
    : `${pair.methodIdB} は ${pair.methodIdA} の ${(valueB / valueA).toFixed(2)}倍です。`;
  let detail = pair.narrative
    .replace(/^.*?の差は\s*[+-]?\d+(?:\.\d+)?倍\s*です。\s*/, "")
    .replace(/^.*?\sは\s.*?\sの\s[+-]?\d+(?:\.\d+)?倍です。\s*/, "");
  if (pair.residual) {
    const residual = Math.abs(pair.residual.multiplier) < 0.01
      ? pair.residual.multiplier.toPrecision(2)
      : pair.residual.multiplier.toFixed(2);
    detail = detail.replace(/未説明乖離\(残差\): ×[+-]?\d+(?:\.\d+)?。/, `未説明乖離(残差・手法Bから手法Aへの変換): ×${residual}。`);
  }
  return detail ? `${lead} ${detail}` : lead;
}

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
  // 分解係数は core で valueB → valueA の向きに定義されている。
  const steps: WaterfallStepInput[] = [{ label: `${labelB} 中心値`, value: pair.valueB, isTotal: true }];
  let running: number = pair.valueB;
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
  steps.push({ label: `${labelA} 中心値`, value: pair.valueA, isTotal: true });
  return steps;
}

export function additivePairSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  return [
    { label: `${labelA} 中心値`, value: pair.valueA, isTotal: true },
    { label: "金額差", value: pair.valueB - pair.valueA, isTotal: false },
    { label: `${labelB} 中心値`, value: pair.valueB, isTotal: true },
  ];
}
