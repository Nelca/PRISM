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

/**
 * G1〜G4はMVP範囲(M7 D-3)。
 * G6(選択的開示)は2026-08-09に追加した。M2の除外理由記録が唯一の情報源であり
 * (build-plan §5.5)、その記録はM1・M2で全件揃っているため実装できるようになった。
 * G5(定義不一致)・G7(相殺依存)・G8(約束の裏付け欠如)は情報源が未整備のため未実装。
 */
export type GapType =
  | "G1_no_evidence"
  | "G2_weak_evidence"
  | "G3_scope_mismatch"
  | "G4_period_mismatch"
  | "G6_selective_disclosure";

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
  /**
   * G6:開示が触れている範囲に含まれるのに評価していない対象(2026-08-09追加)。
   * gapTypeがG6でなくても、事実として存在すればここに載る。
   * 型は `disclosure/selective-disclosure.ts` の `ExclusionRecord`。
   */
  undisclosedExclusions?: {
    siteId: string;
    category: ImpactCategory;
    scope: string;
    kind: "not_assessed" | "not_deep_dived" | "criteria_unevaluated";
    reason: string;
  }[];
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
/**
 * `internal_review` は2026-08-09追加。基準本文が未取得で項目マッピングを確定できないため
 * (`docs/data/acquisition-runbook.md` A-15)、**SSBJ準拠を騙らずに**自社レコードから
 * 下書きを組み立てるための区分。基準へのマッピングが確定した時点で ssbj/tcfd/tnfd を使う。
 */
export type DisclosureStandard = "ssbj" | "tcfd" | "tnfd" | "internal_review";

export interface DisclosureView {
  id: string;
  standard: DisclosureStandard;
  sourceDisclosureClaimIds: string[];
  generatedText: string;
  generatedAt: string;
}
