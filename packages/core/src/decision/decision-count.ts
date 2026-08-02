/**
 * M6 D-8:判定件数のカウント機構(課金接続)。design-rationale-log D-30の実装レベル版。
 * 参照元: docs/requirements/m6-decision-record.md §8
 *
 * 「またがない」場合も1件としてカウントする(結論の向きを問わず一律)。
 * pendingの間はカウントしない(未確定の状態を課金対象にしないため、M6 D-10)。
 * カウンタの永続化自体は契約・課金システム側の責務であり、この関数は
 * 「この時点でカウント対象かどうか」の判定のみを返す。
 */

export function shouldCountDecision(verdict: "does_not_cross" | "crosses" | "pending"): boolean {
  return verdict !== "pending";
}
