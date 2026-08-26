import { NoContributingRecordError } from "@core/decision/dominant-assumption";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import type { BindingMechanismChangeEntry } from "@core/types/decision";
import type { CountermeasureCandidate } from "./company";
import type { CommonDecisionOptions } from "./build-countermeasure-previews";
import type { PipelineWarning } from "./run-demo-pipeline";

export function buildSiteDecision(input: {
  siteId: string;
  siteName: string;
  isFlagshipSite: boolean;
  selectedCandidate: CountermeasureCandidate;
  commonOptions: CommonDecisionOptions;
  bindingHistory: BindingMechanismChangeEntry[];
}): { decision: ReturnType<typeof runDecisionPipeline> | null; warning?: PipelineWarning } {
  const latestChange = input.bindingHistory[input.bindingHistory.length - 1];
  try {
    const result = runDecisionPipeline({
      ...input.commonOptions,
      id: input.isFlagshipSite ? "dr-site042-2027" : `dr-${input.siteId}-2027`,
      countermeasures: [input.selectedCandidate.countermeasure],
      ...(latestChange
        ? {
            bindingMechanismChange: {
              previousMechanism: latestChange.previousMechanism,
              reason: latestChange.reason,
              changedAt: latestChange.changedAt,
            },
          }
        : {}),
    });
    return {
      decision: {
        ...result,
        decisionRecord: { ...result.decisionRecord, bindingMechanismHistory: input.bindingHistory },
      },
    };
  } catch (cause) {
    if (!(cause instanceof NoContributingRecordError)) throw cause;
    console.error(`[build-site-decision] ${input.siteId}の判定計算に失敗しました:`, cause);
    return {
      decision: null,
      warning: {
        id: `decision-failed-${input.siteId}`,
        screen: "/decision",
        message: `${input.siteName}の判定を計算できなかったため、対策と判定・財務への影響を表示できませんでした。投資の承認ラインまたは選択中の対策案をご確認ください。`,
      },
    };
  }
}
