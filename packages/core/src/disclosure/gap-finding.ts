/**
 * M7 D-3:G1〜G4の優先順位判定。D-4:推奨アクション3種の組み立て。
 * 参照元: docs/requirements/m7-disclosure-verification.md §3・§4
 *
 * category一致→tier全C判定→scope一致→period一致、の順に段階的に絞り込む。
 * この4類型はすべてM3が既に出力するフィールドの機械的な参照で判定でき、LLMは使わない。
 */

import { periodsEqual } from "./evidence-match";
import type { EvidenceCandidate } from "./evidence-match";
import type { DisclosureClaim, EvidenceMatch, GapFinding, GapType, RecommendedAction } from "../types/disclosure";

export function determineGapType(
  claim: DisclosureClaim,
  candidates: EvidenceCandidate[]
): { gapType: GapType | null; matchedRecordIds: string[] } {
  const { category, scopeMentioned, periodMentioned } = claim.extractedMetadata;

  const categoryMatches = candidates.filter((c) => category === null || c.category === category);
  if (categoryMatches.length === 0) {
    return { gapType: "G1_no_evidence", matchedRecordIds: [] };
  }

  if (categoryMatches.every((c) => c.transferFitnessTier === "C")) {
    return { gapType: "G2_weak_evidence", matchedRecordIds: categoryMatches.map((c) => c.recordId) };
  }

  const scopeMatches = categoryMatches.filter((c) => scopeMentioned === null || c.scope === scopeMentioned);
  if (scopeMatches.length === 0) {
    return { gapType: "G3_scope_mismatch", matchedRecordIds: [] };
  }

  const periodMatches = scopeMatches.filter((c) => periodMentioned === null || periodsEqual(c.period, periodMentioned));
  if (periodMatches.length === 0) {
    return { gapType: "G4_period_mismatch", matchedRecordIds: [] };
  }

  return { gapType: null, matchedRecordIds: periodMatches.map((c) => c.recordId) };
}

/**
 * D-4:3種すべてを常に提示し、デフォルトの選択肢を設けない。根拠充足(gapType=null)の場合は
 * 対応アクション自体が不要なため空配列を返す。③のreasonは、まだユーザーが選択していない
 * 提示段階のプレースホルダーであり、実際の理由はintentional-decision.tsが検証する。
 */
export function buildRecommendedActions(gapType: GapType | null): RecommendedAction[] {
  if (gapType === null) {
    return [];
  }
  return [
    { kind: "weaken_claim" },
    { kind: "acquire_additional_evidence", triggersDeepDive: true },
    { kind: "record_as_intentional_decision", reason: "" },
  ];
}

export function buildGapFinding(id: string, claim: DisclosureClaim, candidates: EvidenceCandidate[]): GapFinding {
  const { gapType, matchedRecordIds } = determineGapType(claim, candidates);

  const evidenceMatch: EvidenceMatch = {
    claimId: claim.id,
    matchedRecordIds,
    matchMethod: "category_period_scope_exact_match",
  };

  return {
    id,
    claimId: claim.id,
    gapType,
    evidenceMatch,
    recommendedActions: buildRecommendedActions(gapType),
  };
}
