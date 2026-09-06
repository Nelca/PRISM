import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import type {
  AnyDivergenceDecomposition,
  DivergenceDecompositionV2,
  PairwiseDecompositionV2,
} from "@core/types/divergence";
import { isDivergenceDecompositionV2 } from "@core/types/divergence";

/**
 * 完成実装 T-14:保存済みrunに旧形式(resultSchemaVersion ≤ 10)の分解結果が混ざっていても
 * 例外にせず「旧形式のため再計算が必要」を返す。`lib/pipeline/execute-run.ts` は
 * `RESULT_SCHEMA_VERSION` の不一致で再実行するため通常は起きないが、
 * 型ガードで守っておき、読み手が旧形式を新意味論で誤解しないようにする。
 */
export type DivergenceReadResult =
  | { kind: "v2"; decomposition: DivergenceDecompositionV2 }
  | { kind: "legacy_needs_recalculation"; id: string }
  | { kind: "missing" };

export function readDivergenceDecomposition(value: AnyDivergenceDecomposition | undefined): DivergenceReadResult {
  if (!value) return { kind: "missing" };
  if (!isDivergenceDecompositionV2(value)) return { kind: "legacy_needs_recalculation", id: value.id };
  return { kind: "v2", decomposition: value };
}

export function decompositionForMaterialIssue(
  result: DemoPipelineResult,
  materialIssueId: string
): DivergenceDecompositionV2 | undefined {
  const found = result.valuation.divergenceDecompositions.find((d) => d.id === `dd-${materialIssueId}`);
  const read = readDivergenceDecomposition(found);
  return read.kind === "v2" ? read.decomposition : undefined;
}

export function hasRepresentativeSelection(result: DemoPipelineResult, materialIssueId: string): boolean {
  return decompositionForMaterialIssue(result, materialIssueId)?.representativeValueSelection !== undefined;
}

export function materialIssueIdsWithoutRepresentativeSelection(result: DemoPipelineResult): string[] {
  return materialIssueIdsRequiringRepresentativeSelection(result).filter(
    (materialIssueId) => !hasRepresentativeSelection(result, materialIssueId)
  );
}

export function materialIssueIdsRequiringRepresentativeSelection(result: DemoPipelineResult): string[] {
  return Object.keys(result.valuation.valuationRecordsByMaterialIssue).filter((materialIssueId) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [];
    return records.some((record) => record.valueConcept === "exchange") && decompositionForMaterialIssue(result, materialIssueId) !== undefined;
  });
}

export function materialIssueIdsWithWelfareOnlyValuation(result: DemoPipelineResult): string[] {
  return Object.keys(result.valuation.valuationRecordsByMaterialIssue).filter((materialIssueId) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [];
    return records.length > 0 && records.every((record) => record.valueConcept === "welfare");
  });
}

export function representativeCentralValueForMaterialIssue(
  result: DemoPipelineResult,
  materialIssueId: string
): number | undefined {
  const records = result.valuation.valuationRecordsByMaterialIssue[materialIssueId];
  const recordId = result.valuation.representativeRecordByMaterialIssue[materialIssueId];
  const record = records?.find((candidate) => candidate.id === recordId);
  return record ? Number(record.centralValue) : undefined;
}

export function hasDegenerateRepresentative(result: DemoPipelineResult, siteId: string): boolean {
  return result.assessment.materialIssues
    .filter((issue) => issue.siteId === siteId)
    .some((issue) => representativeCentralValueForMaterialIssue(result, issue.id) === 0);
}

export function sitesWithDegenerateRepresentative(
  result: DemoPipelineResult
): { siteId: string; siteName: string; uninternalizedCost: number; zeroRepresentative: boolean }[] {
  return result.decisions
    .filter((decision) => {
      const uninternalizedCost = Number(decision.financialBridge.internalizationStatus.uninternalizedCost);
      return uninternalizedCost < 0 || hasDegenerateRepresentative(result, decision.siteId);
    })
    .map((decision) => ({
      siteId: decision.siteId,
      siteName: decision.siteName,
      uninternalizedCost: Number(decision.financialBridge.internalizationStatus.uninternalizedCost),
      zeroRepresentative: hasDegenerateRepresentative(result, decision.siteId),
    }));
}

/**
 * 手法間の乖離倍率。停止ペア(分解できなかったペア)でも両端が正なら倍率は示せる。
 * 「差の大きさ」と「差を分解できたか」は別の情報であり、後者は `pair.status` が持つ。
 */
export function pairDivergenceRatio(pair: PairwiseDecompositionV2): number | null {
  const a = Number(pair.valueA);
  const b = Number(pair.valueB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return Math.max(a, b) / Math.min(a, b);
}

export function maxDivergenceRatio(decomposition: DivergenceDecompositionV2): number | null {
  const ratios = decomposition.groups
    .flatMap((group) => group.crossMethodPairs.map(pairDivergenceRatio))
    .filter((ratio): ratio is number => ratio !== null);
  return ratios.length > 0 ? Math.max(...ratios) : null;
}
