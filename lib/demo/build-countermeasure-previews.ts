import { NoContributingRecordError } from "@core/decision/dominant-assumption";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import type { DecisionPipelineOptions } from "@core/pipeline/decision-pipeline";
import type { DecisionRecord } from "@core/types/decision";
import type { CountermeasureCandidate } from "./company";
import type { PipelineWarning } from "./run-demo-pipeline";

export type CommonDecisionOptions = Omit<
  DecisionPipelineOptions,
  "id" | "countermeasures" | "bindingMechanismChange"
>;

export interface CountermeasurePreview {
  key: CountermeasureCandidate["key"];
  label: string;
  investmentCost: CountermeasureCandidate["countermeasure"]["investmentCost"];
  avoidedPhysicalQuantity: number;
  decisionRecord: DecisionRecord;
}

export function buildCountermeasurePreviews(input: {
  siteId: string;
  siteName: string;
  candidates: CountermeasureCandidate[];
  commonOptions: CommonDecisionOptions;
}): { previews: CountermeasurePreview[]; warnings: PipelineWarning[] } {
  const warnings: PipelineWarning[] = [];
  const previews = input.candidates.flatMap((candidate) => {
    try {
      const preview = runDecisionPipeline({
        ...input.commonOptions,
        id: `dr-${input.siteId}-${candidate.key}-preview`,
        countermeasures: [candidate.countermeasure],
      });
      return [{
        key: candidate.key,
        label: candidate.label,
        investmentCost: candidate.countermeasure.investmentCost,
        avoidedPhysicalQuantity: candidate.avoidedPhysicalQuantity,
        decisionRecord: preview.decisionRecord,
      }];
    } catch (cause) {
      if (!(cause instanceof NoContributingRecordError)) throw cause;
      console.error(`[build-countermeasure-previews] 対策案「${candidate.label}」(${input.siteId})の計算に失敗しました:`, cause);
      warnings.push({
        id: `countermeasure-preview-failed-${input.siteId}-${candidate.key}`,
        screen: "/decision",
        message: `${input.siteName}の対策案「${candidate.label}」は、承認基準がちょうど通常NPVと一致する等の理由で計算できなかったため、比較対象から除いています。`,
      });
      return [];
    }
  });
  return { previews, warnings };
}
