/**
 * 前提が変わったときの再判定アラート(GAP-20の前半)。
 * 構想書9.3のM8節「過去に『効かない』と判定した案件の再判定アラート」の回収。
 */

import { describe, expect, it } from "vitest";
import { detectReassessmentAlerts } from "./reassessment";
import type { DecisionSnapshot } from "./reassessment";

const confirmed: DecisionSnapshot[] = [
  { decisionRecordId: "dr-1", verdict: "does_not_cross", recalculationHash: "dr:aaa" },
  { decisionRecordId: "dr-2", verdict: "crosses", recalculationHash: "dr:bbb" },
];

describe("detectReassessmentAlerts", () => {
  it("前提が変わっていなければ何も出さない", () => {
    expect(detectReassessmentAlerts(confirmed, confirmed)).toEqual([]);
  });

  it("前提が変わり判定の向きも変わった場合、最も重いアラートを出す", () => {
    const alerts = detectReassessmentAlerts(confirmed, [
      { decisionRecordId: "dr-1", verdict: "crosses", recalculationHash: "dr:changed" },
      confirmed[1],
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("verdict_changed");
    expect(alerts[0].previousVerdict).toBe("does_not_cross");
    expect(alerts[0].currentVerdict).toBe("crosses");
    // 「効かない」と判定した案件が効くようになった、という最も重要なケース
    expect(alerts[0].message).toContain("見直しが必要");
  });

  it("前提だけが変わり判定の向きが同じ場合も、根拠の説明が変わるため知らせる", () => {
    const alerts = detectReassessmentAlerts(confirmed, [
      { decisionRecordId: "dr-1", verdict: "does_not_cross", recalculationHash: "dr:changed" },
      confirmed[1],
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("assumptions_changed");
    expect(alerts[0].message).toContain("説明する内容が変わります");
  });

  it("保留だった判定が確定した場合を区別する", () => {
    const alerts = detectReassessmentAlerts(
      [{ decisionRecordId: "dr-3", verdict: "pending", recalculationHash: "dr:ccc" }],
      [{ decisionRecordId: "dr-3", verdict: "crosses", recalculationHash: "dr:changed" }]
    );

    expect(alerts[0].level).toBe("verdict_resolved");
  });

  it("過去に記録のない判定(新規)は対象にしない", () => {
    const alerts = detectReassessmentAlerts(confirmed, [
      ...confirmed,
      { decisionRecordId: "dr-new", verdict: "crosses", recalculationHash: "dr:new" },
    ]);

    expect(alerts).toEqual([]);
  });

  it("ハッシュが同じなら判定の向きが違っても出さない(前提が変わっていない=比較の起点が同じ)", () => {
    // 同じ前提から違う判定が出ることはないため、これは実際には起きない組み合わせ。
    // ハッシュを唯一の変化検出手段としていることを明示するための確認。
    const alerts = detectReassessmentAlerts(confirmed, [
      { decisionRecordId: "dr-1", verdict: "crosses", recalculationHash: "dr:aaa" },
    ]);

    expect(alerts).toEqual([]);
  });
});
