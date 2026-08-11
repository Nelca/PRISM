/**
 * M7段階1・2(PDF抽出・主張タイプ分類)の出力を DisclosureClaim[] に変換する(GAP-05)。
 * 参照元: docs/requirements/mvp-completion-gap.md GAP-05、build-plan §5.7
 *
 * **必須制約(build-plan §5.7):** AIの役割は抽出に限定する。判定はルールで行う。
 * 段階3・段階4(gap-finding.ts・disclosure-pipeline.ts)にLLMを使わない。
 * この関数はAIの構造化出力を右から左へ形を整えるだけであり、判定を一切行わない。
 */

import type { ClaimType, DisclosureClaim, ExtractedClaimMetadata } from "../types/disclosure";
import type { ImpactCategory } from "../types/common";

/**
 * AI(段階1・2)の構造化出力の型。ExtractedClaimMetadataの4フィールドは
 * 必ず埋めるかnullにする(M7 D-1。ここが曖昧だと段階3が成立しない)。
 */
export interface RawExtractedClaim {
  sourcePageOrSection: string;
  /** 抽出された原文。要約・言い換えをしない。 */
  rawText: string;
  claimType: ClaimType;
  category: ImpactCategory | null;
  quantityMentioned: { value: number; unit: string } | null;
  periodMentioned: { startYear: number; endYear: number } | null;
  scopeMentioned: string | null;
  extractionConfidence: "high" | "low";
}

/**
 * AIの抽出結果からDisclosureClaim[]を組み立てる純粋関数。IDの割り付け・型の整形のみを行い、
 * 証拠の十分性やギャップの有無といった判定は一切行わない(既存の段階3・4がそのまま担う)。
 */
export function buildDisclosureClaimsFromExtraction(
  sourceDocument: string,
  idPrefix: string,
  rawClaims: RawExtractedClaim[]
): DisclosureClaim[] {
  return rawClaims.map((raw, index) => {
    const extractedMetadata: ExtractedClaimMetadata = {
      category: raw.category,
      quantityMentioned: raw.quantityMentioned,
      periodMentioned: raw.periodMentioned,
      scopeMentioned: raw.scopeMentioned,
    };

    const claim: DisclosureClaim = {
      id: `${idPrefix}-${index + 1}`,
      sourceDocument,
      sourcePageOrSection: raw.sourcePageOrSection,
      rawText: raw.rawText,
      claimType: raw.claimType,
      extractedMetadata,
      extractionConfidence: raw.extractionConfidence,
    };

    return claim;
  });
}
