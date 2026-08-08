import { describe, expect, it } from "vitest";
import { buildDivergenceDecomposition, TooManyRecordsInGroupError } from "./build-divergence-decomposition";
import { TEST_DECOMPOSITION_VERSIONS, makeValuationRecord } from "./test-helpers";

describe("buildDivergenceDecomposition", () => {
  it("価値概念で2グループに分割し、それぞれのペアを分解する", () => {
    const exchangeA = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 500,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const welfareA = makeValuationRecord({ methodId: "lime3-water", centralValue: 30_000, aopCode: "human_health" });
    const welfareB = makeValuationRecord({
      methodId: "ifvi-water-consumption.VFnutrition",
      centralValue: 12_000,
      aopCode: "human_health",
    });

    const result = buildDivergenceDecomposition({
      id: "dd-1",
      targetPhysicalQuantityId: "pq-1",
      siteId: "site-042",
      records: [exchangeA, welfareA, welfareB],
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    expect(result.groups).toHaveLength(2);
    const exchangeGroup = result.groups.find((g) => g.valueConcept === "exchange")!;
    const welfareGroup = result.groups.find((g) => g.valueConcept === "welfare")!;

    expect(exchangeGroup.methodIds).toEqual(["replacement-cost"]);
    expect(exchangeGroup.pairwiseDecompositions).toHaveLength(0); // N=1のためペアなし

    expect(welfareGroup.methodIds.sort()).toEqual(["ifvi-water-consumption.VFnutrition", "lime3-water"].sort());
    expect(welfareGroup.pairwiseDecompositions).toHaveLength(1); // C(2,2)=1ペア

    expect(result.crossGroupComparison?.incommensurable).toBe(true);
  });

  it("片方のグループしかない場合、crossGroupComparisonはnull", () => {
    const welfareA = makeValuationRecord({ methodId: "lime3-water", centralValue: 30_000 });
    const welfareB = makeValuationRecord({ methodId: "ifvi-water-consumption.VFnutrition", centralValue: 12_000 });

    const result = buildDivergenceDecomposition({
      id: "dd-2",
      targetPhysicalQuantityId: "pq-1",
      siteId: "site-042",
      records: [welfareA, welfareB],
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    expect(result.groups).toHaveLength(1);
    expect(result.crossGroupComparison).toBeNull();
  });

  it("グループ内のValuationRecord数が5を超えるとエラーを投げる(§2.1)", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      makeValuationRecord({ methodId: `method-${i}`, centralValue: 100 + i })
    );

    expect(() =>
      buildDivergenceDecomposition({
        id: "dd-3",
        targetPhysicalQuantityId: "pq-1",
        siteId: "site-042",
        records,
        versions: TEST_DECOMPOSITION_VERSIONS,
      })
    ).toThrow(TooManyRecordsInGroupError);
  });

  it("valuationRecordIdsは分割前の全レコードを含む", () => {
    const exchangeA = makeValuationRecord({
      methodId: "replacement-cost",
      centralValue: 500,
      valueConcept: "exchange",
      aopCode: "not_applicable",
    });
    const welfareA = makeValuationRecord({ methodId: "lime3-water", centralValue: 30_000 });

    const result = buildDivergenceDecomposition({
      id: "dd-4",
      targetPhysicalQuantityId: "pq-1",
      siteId: "site-042",
      records: [exchangeA, welfareA],
      versions: TEST_DECOMPOSITION_VERSIONS,
    });

    expect(result.valuationRecordIds.sort()).toEqual([exchangeA.id, welfareA.id].sort());
  });
});
