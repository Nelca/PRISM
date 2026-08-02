/**
 * M6:トップレベル関数。対策案・ValuationRecord・承認閾値からDecisionRecordを組み立てる。
 * evaluateVerdict()・buildDecisionRecordValuationRefs()(いずれも types/decision.ts に既存実装)と、
 * nature-adjusted-npv.ts・dominant-assumption.ts を束ねる。
 */

import { buildDecisionRecordValuationRefs, evaluateVerdict } from "../types/decision";
import type {
  ApprovalThreshold,
  BindingMechanism,
  Countermeasure,
  DecisionRecord,
  DecisionTarget,
} from "../types/decision";
import type { BaselineNpvInput } from "../types/financial-bridge";
import type { ExchangeValuationRecord } from "../types/valuation";
import { computeNatureAdjustedNpv } from "./nature-adjusted-npv";
import { identifyDominantAssumption } from "./dominant-assumption";

export interface BuildDecisionRecordOptions {
  id: string;
  decisionTarget: DecisionTarget;
  decisionMaker: string;
  decisionDate: string;
  /** 未入力は"pending"として渡す(M6 D-10)。 */
  approvalThreshold: ApprovalThreshold | "pending";
  /** valueConcept: "exchange" のみを受け付ける(M6 D-1、型レベルでガード済み)。 */
  relatedValuationRecords: ExchangeValuationRecord[];
  baselineNpv: BaselineNpvInput;
  countermeasures: Countermeasure[];
  valuationRecordsById: Record<string, ExchangeValuationRecord>;
  bindingMechanism: BindingMechanism;
}

/**
 * assumptionEntryIds・recalculationHashはM3・M4同様プレースホルダーとし、
 * M8実装時に実配線する。
 */
export function buildDecisionRecord(options: BuildDecisionRecordOptions): DecisionRecord {
  const relatedValuationRecordIds = buildDecisionRecordValuationRefs(options.relatedValuationRecords);

  const natureAdjustedNpv = computeNatureAdjustedNpv(
    options.baselineNpv,
    options.countermeasures,
    options.valuationRecordsById
  );

  const verdict = evaluateVerdict(options.approvalThreshold, natureAdjustedNpv.quantileRange);

  const deepDiveRecommendation =
    verdict === "crosses"
      ? identifyDominantAssumption(options.countermeasures, options.valuationRecordsById)
      : undefined;

  return {
    id: options.id,
    decisionTarget: options.decisionTarget,
    decisionMaker: options.decisionMaker,
    decisionDate: options.decisionDate,
    approvalThreshold: options.approvalThreshold,
    relatedValuationRecordIds,
    baselineNpv: options.baselineNpv,
    natureAdjustedNpv,
    verdict,
    deepDiveRecommendation,
    bindingMechanism: options.bindingMechanism,
    bindingMechanismHistory: [],
    assumptionEntryIds: [],
    recalculationHash: `placeholder:${options.id}`,
  };
}
