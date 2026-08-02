/**
 * パイプライン層:M6(対策評価と意思決定注入)。
 * 参照元: docs/roadmap/build-plan.md §7.1(GATE:M1からM8まで通す)
 *
 * decision/build-decision-record.tsのbuildDecisionRecord()をそのまま呼び、
 * 拘束方式の変更があった場合はM6のAssumptionEntryを実際に生成してDecisionRecordに反映する。
 */

import { buildDecisionRecord } from "../decision/build-decision-record";
import type { BuildDecisionRecordOptions } from "../decision/build-decision-record";
import { appendBindingMechanismChange } from "../decision/binding-mechanism";
import { buildAssumptionEntry, deriveM6BindingMechanismChangePayload } from "../ledger/assumption-entry";
import type { BindingMechanism, DecisionRecord } from "../types/decision";
import type { AssumptionEntry } from "../types/ledger";

export interface DecisionPipelineOptions extends BuildDecisionRecordOptions {
  /** 拘束方式が既存のものから変更された場合のみ指定する。 */
  bindingMechanismChange?: {
    previousMechanism: BindingMechanism;
    reason: string;
    changedAt: string;
  };
  idSequence: () => string;
  now: string;
}

export interface DecisionPipelineResult {
  decisionRecord: DecisionRecord;
  assumptionEntries: AssumptionEntry[];
}

export function runDecisionPipeline(options: DecisionPipelineOptions): DecisionPipelineResult {
  const assumptionEntries: AssumptionEntry[] = [];
  const decisionRecord = buildDecisionRecord(options);

  if (!options.bindingMechanismChange) {
    return { decisionRecord, assumptionEntries };
  }

  const changeEntry = {
    changedAt: options.bindingMechanismChange.changedAt,
    previousMechanism: options.bindingMechanismChange.previousMechanism,
    newMechanism: options.bindingMechanism,
    reason: options.bindingMechanismChange.reason,
  };
  const bindingMechanismHistory = appendBindingMechanismChange(decisionRecord.bindingMechanismHistory, changeEntry);

  const payload = deriveM6BindingMechanismChangePayload(changeEntry);
  const entry = buildAssumptionEntry(options.idSequence(), options.now, "M6", decisionRecord.id, payload);
  assumptionEntries.push(entry);

  return {
    decisionRecord: {
      ...decisionRecord,
      bindingMechanismHistory,
      assumptionEntryIds: [...decisionRecord.assumptionEntryIds, entry.id],
    },
    assumptionEntries,
  };
}
