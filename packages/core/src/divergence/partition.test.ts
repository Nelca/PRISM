import { describe, expect, it } from "vitest";
import { buildCrossGroupComparison, partitionByValueConcept } from "./partition";
import { makeValuationRecord } from "./test-helpers";

describe("partitionByValueConcept", () => {
  it("交換価値と厚生価値を正しく2グループに分ける", () => {
    const exchangeRecord = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 500,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const welfareRecord = makeValuationRecord({
      methodId: "lime3-water",
      centralValue: 30_000,
      valueConcept: "welfare",
      aopCode: "human_health",
    });

    const { exchange, welfare } = partitionByValueConcept([exchangeRecord, welfareRecord]);

    expect(exchange).toHaveLength(1);
    expect(exchange[0].methodId).toBe("replacement-cost");
    expect(welfare).toHaveLength(1);
    expect(welfare[0].methodId).toBe("lime3-water");
  });

  it("片方のグループが空でも正しく分ける", () => {
    const welfareRecord = makeValuationRecord({ methodId: "lime3-water", centralValue: 30_000 });
    const { exchange, welfare } = partitionByValueConcept([welfareRecord]);
    expect(exchange).toHaveLength(0);
    expect(welfare).toHaveLength(1);
  });
});

describe("buildCrossGroupComparison", () => {
  it("両グループが非空なら incommensurable=true とメタデータ差分を返す", () => {
    const exchangeRecord = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 500,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const welfareRecord = makeValuationRecord({
      methodId: "lime3-water",
      centralValue: 30_000,
      valueConcept: "welfare",
      aopCode: "human_health",
    });

    const comparison = buildCrossGroupComparison([exchangeRecord], [welfareRecord]);

    expect(comparison).not.toBeNull();
    expect(comparison?.incommensurable).toBe(true);
    expect(comparison?.metadataDifferences.length).toBeGreaterThan(0);
  });

  it("片方が空ならnullを返す(比較対象が存在しないため)", () => {
    const welfareRecord = makeValuationRecord({ methodId: "lime3-water", centralValue: 30_000 });
    expect(buildCrossGroupComparison([], [welfareRecord])).toBeNull();
    expect(buildCrossGroupComparison([], [])).toBeNull();
  });
});
