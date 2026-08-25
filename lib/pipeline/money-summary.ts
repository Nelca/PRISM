import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";

export interface SiteMoneyRow {
  siteId: string;
  siteName: string;
  profitImpactPct: number;
  natureDebt: number;
  impairmentAffected: boolean;
  verdict: string;
}

export interface MoneySummary {
  rows: SiteMoneyRow[];
  totalNatureDebt: number;
}

export function deriveMoneySummary(result: DemoPipelineResult): MoneySummary {
  const rows = result.decisions.map((entry) => {
    const { financialBridge, comparisonTargets } = entry;
    const operatingProfit = financialBridge.bridge1.reportedOperatingProfit;
    const adjusted = financialBridge.bridge1.natureAdjustedOperatingProfit;
    return {
      siteId: entry.siteId,
      siteName: entry.siteName,
      profitImpactPct: operatingProfit !== 0 ? ((adjusted - operatingProfit) / operatingProfit) * 100 : 0,
      natureDebt: financialBridge.natureDebt.totalDebt,
      impairmentAffected: comparisonTargets.impairmentTestImpact.changesAssumption,
      verdict: entry.decision.decisionRecord.verdict,
    };
  });
  return { rows, totalNatureDebt: rows.reduce((sum, row) => sum + row.natureDebt, 0) };
}
