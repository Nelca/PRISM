/**
 * DisclosureView(出力の第3層)の器。構想書8.1、GAP-19。
 * **基準準拠を騙らないこと**と**素材が足りない項目を作文で埋めないこと**が要点。
 */

import { describe, expect, it } from "vitest";
import { buildDisclosureView } from "./build-disclosure-view";
import type { DisclosureViewSource, DisclosureViewTemplate } from "./build-disclosure-view";
import { INTERNAL_REVIEW_TEMPLATE } from "./templates/internal-review-template";
import { makeValuationRecord } from "../divergence/test-helpers";
import type { MaterialIssue } from "../types/site";
import type { DecisionRecord } from "../types/decision";

const NOW = "2027-02-14T09:12:00Z";

function makeMaterialIssue(overrides: Partial<MaterialIssue> = {}): MaterialIssue {
  return {
    id: "site-042-mi-water",
    siteId: "site-042",
    impactCategory: "water",
    sensitivityScore: 2,
    criteriaMet: {
      highEcosystemIntegrity: false,
      rapidIntegrityDecline: false,
      highBiodiversityImportance: false,
      waterStress: true,
      likelySignificantDependencyImpact: true,
    },
    unevaluatedCriteria: [
      { criterion: "rapidIntegrityDecline", reason: "no_data_source", dataSources: [] },
      { criterion: "highBiodiversityImportance", reason: "license_pending", dataSources: ["IBAT"] },
    ],
    excluded: false,
    assumptionEntryIds: [],
    ...overrides,
  };
}

function makeDecision(verdict: DecisionRecord["verdict"]): DecisionRecord {
  return {
    id: "dr-1",
    decisionTarget: "investment_approval",
    decisionMaker: "テスト",
    decisionDate: "2027-02-14",
    approvalThreshold: "pending",
    relatedValuationRecordIds: [],
    baselineNpv: { value: 0, discountRate: 0.05, horizon: 10, source: "manual_entry" },
    natureAdjustedNpv: { central: 0, quantileRange: { p5: 0, p50: 0, p95: 0 } } as DecisionRecord["natureAdjustedNpv"],
    verdict,
    bindingMechanism: { kind: "weak_reference" },
    bindingMechanismHistory: [],
    assumptionEntryIds: [],
    recalculationHash: "dr:test",
  };
}

const source: DisclosureViewSource = {
  materialIssues: [makeMaterialIssue()],
  valuationRecords: [
    makeValuationRecord({ methodId: "replacement-cost", centralValue: 12_000_000, valueConcept: "exchange" }),
    makeValuationRecord({ methodId: "lime3-water", centralValue: 40_000_000, valueConcept: "welfare" }),
  ],
  decisionRecords: [makeDecision("crosses")],
};

describe("buildDisclosureView", () => {
  it("自社のレコードから開示文の下書きを組み立てる(AIを使わない)", () => {
    const { view } = buildDisclosureView("dv-1", INTERNAL_REVIEW_TEMPLATE, source, NOW);

    expect(view.generatedText).toContain("【評価の対象範囲】");
    expect(view.generatedText).toContain("【財務影響の試算】");
    expect(view.generatedAt).toBe(NOW);
  });

  it("財務影響には交換価値のみを使う(厚生価値を混ぜない。構想書8.2・X7)", () => {
    const { view } = buildDisclosureView("dv-2", INTERNAL_REVIEW_TEMPLATE, source, NOW);

    // 交換価値1,200万のみ。厚生価値4,000万を足した5,200万にはならない
    expect(view.generatedText).toContain("12,000,000円");
    expect(view.generatedText).not.toContain("52,000,000円");
  });

  it("非GAAPである旨を必ず本文に含める(M5 D-6と同じ規律)", () => {
    const { view } = buildDisclosureView("dv-3", INTERNAL_REVIEW_TEMPLATE, source, NOW);
    expect(view.generatedText).toContain("非GAAP指標");
  });

  it("評価できていない基準がある場合、その事実を本文に書く", () => {
    const { view } = buildDisclosureView("dv-4", INTERNAL_REVIEW_TEMPLATE, source, NOW);
    expect(view.generatedText).toContain("2件を評価できていません");
  });

  it("素材が足りない項目は作文で埋めず、未記入として返す", () => {
    const empty: DisclosureViewSource = { materialIssues: [], valuationRecords: [], decisionRecords: [] };
    const { view, unfilledRequirements } = buildDisclosureView("dv-5", INTERNAL_REVIEW_TEMPLATE, empty, NOW);

    expect(view.generatedText).toBe("");
    expect(unfilledRequirements).toEqual([
      "評価の対象範囲",
      "財務影響の試算",
      "前提と限界",
      "投資判断への反映",
    ]);
  });

  it("承認基準が未設定なら、判定を保留していることを書く(確定したかのように書かない)", () => {
    const pending: DisclosureViewSource = { ...source, decisionRecords: [makeDecision("pending")] };
    const { view } = buildDisclosureView("dv-6", INTERNAL_REVIEW_TEMPLATE, pending, NOW);

    expect(view.generatedText).toContain("判定を保留しています");
  });

  it("基準準拠を騙らない(項目マッピングが未確定のため internal_review として出す)", () => {
    const { view } = buildDisclosureView("dv-7", INTERNAL_REVIEW_TEMPLATE, source, NOW);
    expect(view.standard).toBe("internal_review");
  });

  it("テンプレートを差し替えれば基準別の項目に組み替えられる(器として外から差し込める)", () => {
    const custom: DisclosureViewTemplate = {
      standard: "ssbj",
      version: "test-v1",
      sections: [{ requirementLabel: "テスト項目", render: () => "テスト本文" }],
    };
    const { view } = buildDisclosureView("dv-8", custom, source, NOW);

    expect(view.standard).toBe("ssbj");
    expect(view.generatedText).toBe("【テスト項目】\nテスト本文");
  });
});
