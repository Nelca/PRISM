import type { DecisionRecord } from "@core/types/decision";

export function verdictMeaningSentence(record: Pick<DecisionRecord, "approvalThreshold" | "natureAdjustedNpv">): string {
  if (record.approvalThreshold === "pending") return "承認ラインが未入力のため、判定は保留中です。";
  const { p5, p95 } = record.natureAdjustedNpv.quantileRange;
  const threshold = record.approvalThreshold.value;
  if (p5 <= threshold && threshold <= p95)
    return "試算の幅が承認ラインにかかっています。前提によって基準を満たすかどうかが変わるため、幅を広げている前提を確認してください。";
  const direction = p5 > threshold ? "上回っています" : "下回っています";
  return `試算の幅全体が承認ラインを${direction}。現在の前提・試算範囲では基準をまたぎません。投資の可否は、試算に含めていない影響も踏まえて社内で判断してください。`;
}
