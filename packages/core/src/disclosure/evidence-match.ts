/**
 * M7 D-2:段階3の照合ロジックが使う構造化データ。
 * 参照元: docs/requirements/m7-disclosure-verification.md §2
 *
 * MaterialIssue・ValuationRecordには「対象期間」「対象範囲(scope)」に相当するフィールドが
 * 存在しない(plan file参照)。M1・M3の型に新設せず、呼び出し側が構築するM7専用の軽量な
 * 射影型として定義する。category・transferFitnessTierは実フィールドをそのまま転記できるが、
 * period・scopeは呼び出し側が組織の報告方針に基づいて明示的に付与する。
 */

import type { ImpactCategory } from "../types/common";

export interface EvidenceCandidate {
  /** MaterialIssueまたはValuationRecordのID。 */
  recordId: string;
  category: ImpactCategory | null;
  period: { startYear: number; endYear: number } | null;
  /** 文字列の完全一致でのみ照合する。意味的な包含関係の判定は行わない(D-2)。 */
  scope: string | null;
  /** G2判定に使う。ValuationRecord由来でなければnull。 */
  transferFitnessTier: "A" | "B" | "C" | "not_applicable" | null;
}

export function periodsEqual(
  a: { startYear: number; endYear: number } | null,
  b: { startYear: number; endYear: number } | null
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.startYear === b.startYear && a.endYear === b.endYear;
}
