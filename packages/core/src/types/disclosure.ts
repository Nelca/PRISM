/**
 * M7:開示生成と整合検証。
 * 参照元: docs/requirements/m7-disclosure-verification.md
 */

import type { ImpactCategory } from "./common";

export type ClaimType = "state" | "quantitative" | "trend" | "comparative" | "net_amount" | "future_commitment";

/**
 * 段階1のAI抽出時に構造化して取得する。段階3がこの構造化データのみを使って
 * ルールベースの照合を行うため、ここが曖昧だと段階3が成立しない(M7 D-1)。
 */
export interface ExtractedClaimMetadata {
  category: ImpactCategory | null;
  quantityMentioned: { value: number; unit: string } | null;
  periodMentioned: { startYear: number; endYear: number } | null;
  /** 例:「Scope1・2」「国内拠点のみ」。 */
  scopeMentioned: string | null;
}

export interface DisclosureClaim {
  id: string;
  sourceDocument: string;
  sourcePageOrSection: string;
  /** 抽出された原文(そのまま保持。改変しない)。 */
  rawText: string;
  claimType: ClaimType;
  extractedMetadata: ExtractedClaimMetadata;
  /** AIの抽出確信度。lowの場合は人間のレビューを促す。 */
  extractionConfidence: "high" | "low";
}

export interface EvidenceMatch {
  claimId: string;
  matchedRecordIds: string[];
  /** 曖昧な意味的類似度ではなく構造化フィールドの完全一致(M7 D-2)。 */
  matchMethod: "category_period_scope_exact_match";
}

export type GapType = "G1_no_evidence" | "G2_weak_evidence" | "G3_scope_mismatch" | "G4_period_mismatch";

export type RecommendedAction =
  | { kind: "weaken_claim" } // ①主張を弱める
  | { kind: "acquire_additional_evidence"; triggersDeepDive: true } // ②根拠を追加取得する(深掘りへの導線)
  | { kind: "record_as_intentional_decision"; reason: string }; // ③意図的判断として記録する

export interface IntentionalDecisionRecord {
  gapFindingId: string;
  reason: string;
  recordedAt: string;
  recordedBy: string;
}

export interface GapFinding {
  /** AssumptionEntry.relatedRecordIdおよびIntentionalDecisionRecord.gapFindingIdの参照先(2026-08-02追記、データモデルレビューで欠落を発見)。 */
  id: string;
  claimId: string;
  /** nullは根拠充足(ギャップなし)。 */
  gapType: GapType | null;
  evidenceMatch: EvidenceMatch;
  recommendedActions: RecommendedAction[];
}

/**
 * 構想書8.1・9.1が定義する出力の第3層。同一レコードから基準別(SSBJ等)に
 * 組み替えた開示文を生成する。
 *
 * 2026-08-02のデータモデルレビューで、この型が要件定義段階から抜け落ちていたことが
 * 判明した。M7のMVP範囲(既存開示PDFのギャップ検出、D-1〜D-6)は生成機能を含まないため、
 * 生成ロジックの実装はスコープ外のままとするが、構造だけは今のうちに用意する
 * (build-plan §4.1「後から入れると全レコードの作り直しになるものは薄くしない」と同じ理由)。
 */
export type DisclosureStandard = "ssbj" | "tcfd" | "tnfd";

export interface DisclosureView {
  id: string;
  standard: DisclosureStandard;
  sourceDisclosureClaimIds: string[];
  generatedText: string;
  generatedAt: string;
}
