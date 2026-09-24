import type { DecisionRecord } from "@core/types/decision";
import Link from "next/link";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { resourceInvestmentComparison } from "@/lib/environment/review";
import { Card } from "../components/ui";
export function ResourceDecisions({ records, siteNames, decisions }: { records: EnvironmentalTarget[]; siteNames: Map<string, string>; decisions: DecisionRecord[] }) {
  const targets = records.filter((record) => !record.archived && record.costCase?.investment);
  if (!targets.length) return null;
  const money = (value: number) => `${new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value)}円`;
  return <Card title="資源対策の投資比較"><p>数量と自社費用から計算した対策単体のNPVです。既存案件のNPVや自然債務への合算は行いません。同じ拠点でも範囲・年度が異なる対策は別々に確認してください。</p>
    {targets.map((record) => {
      const comparison = siteNames.has(record.siteId) ? resourceInvestmentComparison(record, record.costCase!, decisions) : null;
      return <div key={record.id}><h3><Link href={`/portfolio/${encodeURIComponent(record.id)}`}>{record.costCase!.name}</Link></h3><p>{siteNames.get(record.siteId) ?? "削除済み拠点"} · {record.reportingYear}年 · {record.boundary}</p>
        {record.costCase!.investment!.linkedDecision && <p>関連案件: <Link href={`/decision?site=${encodeURIComponent(record.siteId)}`}>{record.costCase!.investment!.linkedDecision!.id}</Link></p>}
        {comparison ? <p>NPV <strong>{money(comparison.npv)}</strong> / 承認ライン {money(record.costCase!.investment!.approvalThreshold)} · {comparison.meetsThreshold ? "承認ライン以上" : "承認ライン未満"}</p> : <p>実測値・根拠・拠点を再確認するまで、判定を保留しています。</p>}
      </div>;
    })}
  </Card>;
}
