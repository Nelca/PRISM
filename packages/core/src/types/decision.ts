/**
 * M6:対策評価と意思決定注入。
 * 参照元: docs/requirements/m6-decision-record.md
 */

import type { ExchangeAmount, QuantileRange } from "./common";
import type { BaselineNpvInput } from "./financial-bridge";
import type { ExchangeValuationRecord } from "./valuation";

export type DecisionTarget = "investment_approval" | "procurement_renewal" | "site_location" | "business_plan";

/** 稟議の承認閾値。MVPでは単一の点推定値とし、決裁権限の階層モデルは持たない。 */
export interface ApprovalThreshold {
  value: ExchangeAmount;
  source: "manual_entry" | "csv_upload";
}

export type CountermeasureType = "reduction" | "transfer" | "avoidance" | "acceptance";

/**
 * ★判定(M6 D-2)。`pending` は承認閾値が未入力の状態(D-10)。
 * 2026-08-09に名前付きの型として切り出した(再判定アラートが同じ集合を参照するため)。
 */
export type DecisionVerdict = "does_not_cross" | "crosses" | "pending";

/**
 * 対応手段。MVPでは reduction / transfer のみ計算ロジックを実装するが、
 * 型は4値を保持する(M6 D-5、後から追加すると過去レコードの作り直しになるため)。
 */
export interface Countermeasure {
  type: CountermeasureType;
  targetSiteId: string;
  investmentCost: { initial: number; recurring: number };
  avoidedNatureCost: {
    year: number;
    amount: ExchangeAmount;
    sourceValuationRecordId: string;
  }[];
}

export type BindingMechanism =
  | { kind: "weak_reference" } // 弱:稟議書に参考値として記載
  | { kind: "npv_formula_replacement" } // 強:稟議の判定式そのものを自然調整後NPVに変える
  | { kind: "budget_allocation"; targetSiteId: string; amount: ExchangeAmount } // 強:自然関連コストへの予算賦課
  | { kind: "procurement_contract_clause"; clauseText: string }; // 強:調達契約の更新条件に組み込む

export interface BindingMechanismChangeEntry {
  changedAt: string;
  previousMechanism: BindingMechanism;
  newMechanism: BindingMechanism;
  /** 変更理由の入力を必須化(M6 D-9)。 */
  reason: string;
}

export interface DecisionRecord {
  id: string;
  decisionTarget: DecisionTarget;
  decisionMaker: string;
  decisionDate: string;
  /** 未入力は"pending"として明示する(M6 D-10)。 */
  approvalThreshold: ApprovalThreshold | "pending";

  /**
   * ID配列として保持する(永続化・シリアライズの都合上)。
   * ただしDecisionRecordの構築は必ず buildDecisionRecordValuationRefs() を経由させ、
   * ExchangeValuationRecord[](valueConcept: "exchange" に絞り込まれた型)からのみ
   * IDを取り出せるようにする。WelfareValuationRecordを渡すとコンパイルエラーになる(M6 D-1)。
   */
  relatedValuationRecordIds: string[];
  baselineNpv: BaselineNpvInput;
  natureAdjustedNpv: {
    central: ExchangeAmount;
    quantileRange: QuantileRange;
  };

  /** ★判定。approvalThresholdが"pending"の間はverdictも"pending"(M6 D-2・D-10)。 */
  verdict: DecisionVerdict;
  deepDiveRecommendation?: {
    /** M3のトルネード図を流用する(M6 D-3)。 */
    dominantAssumption: string;
    sourceValuationRecordId: string;
  };

  actualDecisionOutcome?: {
    outcome: string;
    reason: string;
  };

  bindingMechanism: BindingMechanism;
  bindingMechanismHistory: BindingMechanismChangeEntry[];

  /** 前提の実績照合(2026-08-02追記、M8 D-6)。フィールドのみ、機能はフェーズ2以降。 */
  actualOutcomeReview?: {
    reviewedAt: string;
    yearsElapsed: number;
    assumptionDeviation: string;
    verdictStillValid: boolean;
  };

  assumptionEntryIds: string[];
  recalculationHash: string;
}

/**
 * DecisionRecord.relatedValuationRecordIds を構築する唯一の経路(M6 D-1)。
 * 引数の型が ExchangeValuationRecord[] に固定されているため、
 * WelfareValuationRecord(または未絞り込みのValuationRecord[])を渡すと
 * コンパイルエラーになる。
 */
export function buildDecisionRecordValuationRefs(records: ExchangeValuationRecord[]): string[] {
  return records.map((r) => r.id);
}

/**
 * ★判定の機械的なロジック(M6 D-2)。新しい分位点や閾値は設けず、
 * M3が既に出力するP5/P95をそのまま使う。
 */
export function evaluateVerdict(
  approvalThreshold: ApprovalThreshold | "pending",
  natureAdjustedNpvRange: QuantileRange
): "does_not_cross" | "crosses" | "pending" {
  if (approvalThreshold === "pending") return "pending";
  const threshold = approvalThreshold.value;
  if (threshold < natureAdjustedNpvRange.p5 || threshold > natureAdjustedNpvRange.p95) {
    return "does_not_cross";
  }
  return "crosses";
}
