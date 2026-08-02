/**
 * M2:評価実行(深度可変)。
 * 参照元: docs/requirements/m2-assessment-execution.md
 */

export type AssessmentDepth = "screening" | "deep_dive";

/**
 * 優先度算定(m2 D-2)。sensitivity/financialExposure/uncertaintyMagnitude/disclosureRequirement は
 * いずれもスクリーニング深度の出力を再利用した生値。normalizedScore はこの4項目を
 * 同一バッチ内で百分位順位(0〜1)に変換して単純合算した値(重み付けはしない)。
 */
export interface PriorityScore {
  materialIssueId: string;
  /** M1のsensitivityScore(0〜5)をそのまま使う。 */
  sensitivity: number;
  /** スクリーニング深度のValuationRecord中心値(交換価値)。 */
  financialExposure: number;
  /** スクリーニング深度のquantileRangeの対数比 log(P95/P5)。 */
  uncertaintyMagnitude: number;
  /** カテゴリ×現行規制の対応表による値。 */
  disclosureRequirement: number;
  /** 4項目の百分位順位を合算した最終値(0〜4)。 */
  normalizedScore: number;
}

/**
 * 深掘りへの昇格/除外の判断(m2 D-1・D-3・D-4)。
 * M1のMaterialIssue.exclusionReasonとは別のフィールドとして保持する
 * (「評価対象にすら入らなかった理由」と「深掘りしなかった理由」を区別するため)。
 */
export interface DepthDecision {
  materialIssueId: string;
  depth: AssessmentDepth;
  promotedManually: boolean;
  excludedFromDeepDive: boolean;
  /** excludedFromDeepDive === true の場合は必須。 */
  exclusionReason?: string;
  /** M8 AssumptionEntryへの参照(2026-08-02追記)。 */
  assumptionEntryIds: string[];
}
