/**
 * M7 D-3:G1〜G4の優先順位判定。D-4:推奨アクション3種の組み立て。
 * 参照元: docs/requirements/m7-disclosure-verification.md §3・§4
 *
 * category一致→tier全C判定→scope一致→period一致、の順に段階的に絞り込む。
 * この4類型はすべてM3が既に出力するフィールドの機械的な参照で判定でき、LLMは使わない。
 */

import { periodsEqual } from "./evidence-match";
import type { EvidenceCandidate } from "./evidence-match";
import { detectSelectiveDisclosure } from "./selective-disclosure";
import type { ExclusionRecord } from "./selective-disclosure";
import type { DisclosureClaim, EvidenceMatch, GapFinding, GapType, RecommendedAction } from "../types/disclosure";

export function determineGapType(
  claim: DisclosureClaim,
  candidates: EvidenceCandidate[],
  /** G6の判定に使う「評価していないもの」の記録。渡されない場合G6は判定しない。 */
  exclusions: ExclusionRecord[] = []
): { gapType: GapType | null; matchedRecordIds: string[]; undisclosedExclusions: ExclusionRecord[] } {
  const { category, scopeMentioned, periodMentioned } = claim.extractedMetadata;

  const { undisclosedExclusions } = detectSelectiveDisclosure(category, scopeMentioned, exclusions);

  const categoryMatches = candidates.filter((c) => category === null || c.category === category);
  if (categoryMatches.length === 0) {
    return { gapType: "G1_no_evidence", matchedRecordIds: [], undisclosedExclusions };
  }

  if (categoryMatches.every((c) => c.transferFitnessTier === "C")) {
    return {
      gapType: "G2_weak_evidence",
      matchedRecordIds: categoryMatches.map((c) => c.recordId),
      undisclosedExclusions,
    };
  }

  const scopeMatches = categoryMatches.filter((c) => scopeMentioned === null || c.scope === scopeMentioned);
  if (scopeMatches.length === 0) {
    return { gapType: "G3_scope_mismatch", matchedRecordIds: [], undisclosedExclusions };
  }

  const periodMatches = scopeMatches.filter((c) => periodMentioned === null || periodsEqual(c.period, periodMentioned));
  if (periodMatches.length === 0) {
    return { gapType: "G4_period_mismatch", matchedRecordIds: [], undisclosedExclusions };
  }

  // categoryMatches全体では混在(全件tier Cではない)だったとしても、scope・period絞り込みの結果
  // 実際に主張を裏付ける根拠がtier Cのみになるケースがある(例:強い根拠が範囲外・弱い根拠のみ範囲内)。
  // その場合、絞り込み後の実際の根拠集合で改めてtier Cを判定し、根拠充足と誤判定しない。
  if (periodMatches.every((c) => c.transferFitnessTier === "C")) {
    return {
      gapType: "G2_weak_evidence",
      matchedRecordIds: periodMatches.map((c) => c.recordId),
      undisclosedExclusions,
    };
  }

  /**
   * G6は最後に判定する。根拠の有無・強度・範囲・期間(G1〜G4)の方が根本的な問題であり、
   * 「最初に該当したものを採用する」という既存の優先順位(M7 D-3)をそのまま延長する。
   * G1〜G4のいずれかが立っている場合でも、未開示の除外があれば出力には載せる
   * (gapTypeとしては採用しないが、事実は捨てない)。
   */
  if (undisclosedExclusions.length > 0) {
    return {
      gapType: "G6_selective_disclosure",
      matchedRecordIds: periodMatches.map((c) => c.recordId),
      undisclosedExclusions,
    };
  }

  return { gapType: null, matchedRecordIds: periodMatches.map((c) => c.recordId), undisclosedExclusions };
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

export function buildGapFinding(
  id: string,
  claim: DisclosureClaim,
  candidates: EvidenceCandidate[],
  exclusions: ExclusionRecord[] = []
): GapFinding {
  const { gapType, matchedRecordIds, undisclosedExclusions } = determineGapType(claim, candidates, exclusions);

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
    // gapTypeがG6でなくても、未開示の除外があれば事実として残す(捨てない)
    ...(undisclosedExclusions.length > 0 ? { undisclosedExclusions } : {}),
  };
}
