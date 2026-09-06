import { describe, expect, it } from "vitest";
import {
  buildDivergenceDecompositionV2,
  MAX_PARENT_METHODS_PER_GROUP,
  type IntraMethodBreakdownSpec,
} from "./build-divergence-decomposition-v2";
import { createTestRegistry } from "./recipes/registry";
import { makeSyntheticTrace, SYNTHETIC_EVIDENCE, SYNTHETIC_RECIPES } from "./recipes/synthetic-interaction";
import { makeComparisonSubject, makeValuationRecord, TEST_DECOMPOSITION_VERSIONS_V2 } from "./test-helpers";
import { isDivergenceDecompositionV2 } from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";
import type { ZeroMeaning } from "../types/comparison";

const registry = createTestRegistry();
for (const recipe of SYNTHETIC_RECIPES) registry.register(recipe);

const subject = makeComparisonSubject();
const versions = TEST_DECOMPOSITION_VERSIONS_V2;

const PUBLISHED_ZERO: ZeroMeaning = {
  code: "published_zero",
  candidates: ["published_zero", "computed_zero"],
  evidence: SYNTHETIC_EVIDENCE,
  rationale: "規則2:出典が0を公表している。",
  assignedBy: "method_adapter",
};

function tracedRecord(options: {
  parentMethodId: string;
  subFactorId?: string;
  alpha: number;
  beta: number;
  gamma?: number;
  valueConcept?: "exchange" | "welfare";
  zeroMeaning?: ZeroMeaning;
}): ValuationRecord {
  const trace = makeSyntheticTrace({
    methodId: options.parentMethodId,
    subFactorId: options.subFactorId,
    shape: "product",
    quantity: 1,
    alpha: options.alpha,
    beta: options.beta,
    gamma: options.gamma ?? 1,
    zeroMeaning: options.zeroMeaning,
  });
  const methodId = options.subFactorId ? `${options.parentMethodId}.${options.subFactorId}` : options.parentMethodId;
  const fixture = { methodId, centralValue: trace.finalValue.value, trace, id: `vr-${methodId}` };
  return options.valueConcept === "exchange"
    ? makeValuationRecord({ ...fixture, valueConcept: "exchange" })
    : makeValuationRecord({ ...fixture, valueConcept: "welfare" });
}

const productA = tracedRecord({ parentMethodId: "synthetic-product-a", alpha: 3, beta: 2 });
const productB = tracedRecord({ parentMethodId: "synthetic-product-b", alpha: 1, beta: 1 });

function build(records: ValuationRecord[], overrides: Partial<Parameters<typeof buildDivergenceDecompositionV2>[0]> = {}) {
  return buildDivergenceDecompositionV2({
    id: "dd-test",
    targetPhysicalQuantityId: "pq-1",
    siteId: "site-042",
    subject,
    records,
    registry,
    versions,
    ...overrides,
  });
}

describe("buildDivergenceDecompositionV2", () => {
  it("schemaVersion 2 を返し、型ガードで新旧を判別できる", () => {
    const result = build([productA, productB]);
    expect(result.schemaVersion).toBe(2);
    expect(isDivergenceDecompositionV2(result)).toBe(true);
    expect(result.valuationRecordIds).toEqual(["vr-synthetic-product-a", "vr-synthetic-product-b"]);
    expect(result.versions).toEqual({ ...versions });
  });

  it("価値概念で分割し、跨ぐグループは比較不能として記録する", () => {
    const exchangeRecord = tracedRecord({ parentMethodId: "synthetic-product-a", alpha: 3, beta: 2, valueConcept: "exchange" });
    const result = build([exchangeRecord, productB]);
    expect(result.groups.map((group) => group.valueConcept)).toEqual(["exchange", "welfare"]);
    expect(result.crossGroupComparison?.incommensurable).toBe(true);
    // 価値概念が違うレコード同士は同じグループに入らないため、手法間ペアは作られない
    expect(result.groups.every((group) => group.crossMethodPairs.length === 0)).toBe(true);
  });

  it("親手法が異なるレコード同士だけを crossMethodPairs にする", () => {
    const result = build([productA, productB]);
    const welfare = result.groups.find((group) => group.valueConcept === "welfare")!;
    expect(welfare.crossMethodPairs).toHaveLength(1);
    expect(welfare.crossMethodPairs[0].status).toBe("decomposed");
    expect(welfare.parentMethodIds).toEqual(["synthetic-product-a", "synthetic-product-b"]);
    expect(welfare.breakdownAnalyses).toEqual([]);
  });

  it("同一親手法の内訳同士は crossMethodPairs に入れず、内訳分析として別の分析単位で扱う", () => {
    const vf1 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF1", alpha: 3, beta: 2 });
    const vf2 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF2", alpha: 0, beta: 2, zeroMeaning: PUBLISHED_ZERO });
    const result = build([vf1, vf2, productB]);
    const welfare = result.groups.find((group) => group.valueConcept === "welfare")!;

    const pairKeys = welfare.crossMethodPairs.map((pair) => `${pair.methodIdA}|${pair.methodIdB}`);
    expect(welfare.crossMethodPairs).toHaveLength(2);
    expect(pairKeys.every((key) => !key.includes("VF1") || !key.includes("VF2"))).toBe(true);
    expect(welfare.crossMethodPairs.every((pair) => pair.parentMethodIdA !== pair.parentMethodIdB)).toBe(true);

    expect(welfare.breakdownAnalyses).toHaveLength(1);
    const breakdown = welfare.breakdownAnalyses[0];
    expect(breakdown.analysisUnit).toBe("intra_method_breakdown");
    expect(breakdown.parentMethodId).toBe("synthetic-product-a");
    expect(breakdown.components.map((component) => component.subFactorId)).toEqual(["VF1", "VF2"]);
    expect(breakdown.components[1].zeroMeaning?.code).toBe("published_zero");
    expect(breakdown.aggregate).toBeNull();
    expect(breakdown.narrative).toContain("加法Shapleyの対象にしません");
  });

  it("集計式が宣言されていれば公式集計値を再構成し、価値概念の混在を明示する", () => {
    const vf1 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF1", alpha: 3, beta: 2 });
    const vf2 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF2", alpha: 4, beta: 2 });
    const spec: IntraMethodBreakdownSpec = {
      parentMethodId: "synthetic-product-a",
      aggregationFormula: "MAX(VF1, VF2)",
      reconstruct: (values) => Math.max(values.VF1, values.VF2),
      mixesValueConcepts: true,
      selected: (values) => (values.VF1 >= values.VF2 ? ["VF1"] : ["VF2"]),
    };
    const result = build([vf1, vf2], { breakdownSpecs: [spec] });
    const breakdown = result.groups[0].breakdownAnalyses[0];
    expect(breakdown.aggregationFormula).toBe("MAX(VF1, VF2)");
    expect(breakdown.aggregate).toMatchObject({ value: 8, mixesValueConcepts: true });
    expect(breakdown.aggregate?.note).toContain("価値概念を跨いで");
    expect(breakdown.components.find((component) => component.subFactorId === "VF2")?.selectedByAggregation).toBe(true);
    expect(breakdown.components.find((component) => component.subFactorId === "VF1")?.selectedByAggregation).toBe(false);
  });

  it("集計式が必要な内訳を欠く場合は aggregate を null にする(推定で埋めない)", () => {
    const vf1 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF1", alpha: 3, beta: 2 });
    const vf2 = tracedRecord({ parentMethodId: "synthetic-product-a", subFactorId: "VF2", alpha: 4, beta: 2 });
    const spec: IntraMethodBreakdownSpec = {
      parentMethodId: "synthetic-product-a",
      aggregationFormula: "VF1 + VF3",
      reconstruct: (values) => {
        if (values.VF3 === undefined) throw new Error("VF3 が存在しません");
        return values.VF1 + values.VF3;
      },
      mixesValueConcepts: false,
    };
    const result = build([vf1, vf2], { breakdownSpecs: [spec] });
    expect(result.groups[0].breakdownAnalyses[0].aggregate).toBeNull();
  });

  it("グループ内の親手法数が上限を超えても例外を投げず、超過ペアを停止結果として残す", () => {
    const many: ValuationRecord[] = [
      productA,
      productB,
      tracedRecord({ parentMethodId: "synthetic-max-a", alpha: 2, beta: 2 }),
      tracedRecord({ parentMethodId: "synthetic-max-b", alpha: 2, beta: 2 }),
      tracedRecord({ parentMethodId: "synthetic-sum-a", alpha: 2, beta: 2 }),
      tracedRecord({ parentMethodId: "synthetic-sum-b", alpha: 2, beta: 2 }),
    ];
    expect(many.length).toBeGreaterThan(MAX_PARENT_METHODS_PER_GROUP);

    const result = build(many);
    const group = result.groups.find((candidate) => candidate.valueConcept === "welfare")!;
    expect(group.groupLimit.exceeded).toBe(true);
    expect(group.groupLimit.maxParentMethods).toBe(MAX_PARENT_METHODS_PER_GROUP);
    expect(group.groupLimit.excludedPairs.length).toBe(5);
    const limited = group.crossMethodPairs.filter((pair) => pair.status === "stopped" && pair.reason === "group_limit_exceeded");
    expect(limited).toHaveLength(5);
    // 上限内のペアは通常どおり分解される
    expect(group.crossMethodPairs.some((pair) => pair.status === "decomposed")).toBe(true);
  });

  it("再計算ハッシュは同じ入力で安定し、版・トレースが変われば変わる", () => {
    const baseline = build([productA, productB]).recalculationHash;
    expect(build([productA, productB]).recalculationHash).toBe(baseline);

    const differentVersion = build([productA, productB], {
      versions: { ...versions, algorithmVersion: "test-shapley-v3" },
    }).recalculationHash;
    expect(differentVersion).not.toBe(baseline);

    const differentF3 = build([productA, productB], {
      versions: { ...versions, f3ThresholdVersion: "f3-v1" },
    }).recalculationHash;
    expect(differentF3).not.toBe(baseline);

    const differentTrace = build([tracedRecord({ parentMethodId: "synthetic-product-a", alpha: 4, beta: 2 }), productB]).recalculationHash;
    expect(differentTrace).not.toBe(baseline);

    const differentSubject = build([productA, productB], {
      subject: makeComparisonSubject({ id: "subject:other", sourceHash: "test:other" }),
    }).recalculationHash;
    expect(differentSubject).not.toBe(baseline);
  });

  it("トレースの無い旧レコードでもハッシュを計算でき、ペアは停止結果になる", () => {
    const legacy = makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 6 });
    const result = build([legacy, productB]);
    expect(result.recalculationHash.startsWith("dd2:")).toBe(true);
    const group = result.groups[0];
    expect(group.crossMethodPairs[0].status).toBe("stopped");
  });
});
