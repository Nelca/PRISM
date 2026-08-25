import { describe, expect, it } from "vitest";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { deriveMoneySummary } from "./money-summary";

describe("money summary", () => {
  it("拠点行と自然債務合計を同じ値から導出する", () => {
    const summary = deriveMoneySummary(runDemoPipeline());
    expect(summary.rows.length).toBeGreaterThan(0);
    expect(summary.totalNatureDebt).toBe(summary.rows.reduce((sum, row) => sum + row.natureDebt, 0));
    expect(summary.rows.every((row) => Number.isFinite(row.profitImpactPct))).toBe(true);
  });
});
