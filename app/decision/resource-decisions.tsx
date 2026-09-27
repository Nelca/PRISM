import Link from "next/link";
import type { DecisionRecord } from "@core/types/decision";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { resourceInvestmentComparison } from "@/lib/environment/review";
import { formatExactNumber } from "../components/numeric";
import { Card } from "../components/ui";

const yen = (value: number) => `${formatExactNumber(value)}円`;

/** 統合管理で登録した資源対策(複数年判定あり)の一覧。既存案件のNPV・自然債務とは合算しない。 */
export function ResourceDecisions({
  records,
  siteNames,
  decisions,
}: {
  records: EnvironmentalTarget[];
  siteNames: Map<string, string>;
  decisions: DecisionRecord[];
}) {
  const targets = records.filter((record) => !record.archived && record.costCase?.investment);
  if (targets.length === 0) return null;
  return (
    <Card title="資源対策の投資比較">
      <p>数量と自社費用から計算した対策単体のNPVです。既存案件のNPVや自然債務への合算は行いません。同じ拠点でも範囲・年度が異なる対策は別々に確認してください。</p>
      {targets.map((record) => {
        const costCase = record.costCase!;
        const investment = costCase.investment!;
        const comparison = siteNames.has(record.siteId) ? resourceInvestmentComparison(record, costCase, decisions) : null;
        return (
          <div key={record.id}>
            <h3><Link href={`/portfolio/${encodeURIComponent(record.id)}`}>{costCase.name}</Link></h3>
            <p>{siteNames.get(record.siteId) ?? "削除済み拠点"} · {record.reportingYear}年 · {record.boundary}</p>
            {investment.linkedDecision && (
              <p>関連案件: <Link href={`/decision?site=${encodeURIComponent(record.siteId)}`}>この拠点の投資判断</Link></p>
            )}
            {comparison ? (
              <p>
                NPV <strong>{yen(comparison.npv)}</strong> / 承認ライン {yen(investment.approvalThreshold)} · {comparison.meetsThreshold ? "承認ライン以上" : "承認ライン未満"}
              </p>
            ) : (
              <p>実測値・根拠・拠点を再確認するまで、判定を保留しています。</p>
            )}
          </div>
        );
      })}
    </Card>
  );
}
