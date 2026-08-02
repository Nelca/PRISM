import { describe, expect, it } from "vitest";
import {
  buildAssumptionEntry,
  deriveM1ExclusionPayload,
  deriveM2DepthDecisionPayload,
  deriveM3CoefficientCalibrationPayload,
  deriveM3FitnessTierPayload,
  deriveM3ReconciliationCheckPayload,
  deriveM4DecompositionPayload,
  deriveM4RepresentativeValueSelectionPayload,
  deriveM6BindingMechanismChangePayload,
  deriveM7GapFindingPayload,
  deriveM7IntentionalDecisionPayload,
} from "./assumption-entry";
import { IDENTITY_CALIBRATION, makeValuationRecord } from "../divergence/test-helpers";
import { buildPairwiseDecomposition } from "../divergence/pairwise-decomposition";
import type { DepthDecision } from "../types/assessment";
import type { ValuationRecordGroup } from "../monetization/build-valuation-records";
import type { RepresentativeValueSelection } from "../types/divergence";
import type { BindingMechanismChangeEntry } from "../types/decision";
import type { GapFinding, IntentionalDecisionRecord } from "../types/disclosure";
import type { SiteLocationResolution } from "../site/location";
import type { Site } from "../types/site";

describe("buildAssumptionEntry", () => {
  it("汎用コンストラクタが全フィールドを正しく組み立てる", () => {
    const entry = buildAssumptionEntry("ae-1", "2026-08-02T00:00:00Z", "M1", "site-042", {
      module: "M1",
      kind: "exclusion",
      reason: "テスト理由",
    });
    expect(entry).toEqual({
      id: "ae-1",
      createdAt: "2026-08-02T00:00:00Z",
      sourceModule: "M1",
      relatedRecordId: "site-042",
      payload: { module: "M1", kind: "exclusion", reason: "テスト理由" },
    });
  });
});

describe("deriveM1ExclusionPayload", () => {
  const site: Site = {
    id: "site-1",
    name: "拠点",
    siteType: "own_site",
    industrySector: "chemicals",
    location: { kind: "address", address: "不明", geocoded: false },
  };

  it("除外されている場合はpayloadを返す", () => {
    const resolution: SiteLocationResolution = { site, excluded: true, exclusionReason: "ジオコーディング失敗" };
    expect(deriveM1ExclusionPayload(resolution)).toEqual({
      module: "M1",
      kind: "exclusion",
      reason: "ジオコーディング失敗",
    });
  });

  it("除外されていない場合はnull", () => {
    const resolution: SiteLocationResolution = { site, excluded: false };
    expect(deriveM1ExclusionPayload(resolution)).toBeNull();
  });
});

describe("deriveM2DepthDecisionPayload", () => {
  it("DepthDecisionから正しく転記する", () => {
    const decision: DepthDecision = {
      materialIssueId: "mi-1",
      depth: "screening",
      promotedManually: false,
      excludedFromDeepDive: true,
      exclusionReason: "上位20%に入らなかった",
      assumptionEntryIds: [],
    };
    expect(deriveM2DepthDecisionPayload(decision)).toEqual({
      module: "M2",
      kind: "depth_decision",
      promotedManually: false,
      exclusionReason: "上位20%に入らなかった",
    });
  });
});

describe("deriveM3CoefficientCalibrationPayload", () => {
  it("GeographicCalibrationRecordから正しく転記する", () => {
    const payload = deriveM3CoefficientCalibrationPayload(IDENTITY_CALIBRATION, "ifvi-water-consumption-v1");
    expect(payload).toEqual({
      module: "M3",
      kind: "coefficient_calibration",
      setVersion: "ifvi-water-consumption-v1",
      pppSource: "test",
      incomeElasticity: 0.7,
    });
  });
});

describe("deriveM3ReconciliationCheckPayload", () => {
  it("reconciledAggregateがある場合はpayloadを返す", () => {
    const group: ValuationRecordGroup = { methodId: "ifvi-water-consumption", records: [], reconciledAggregate: 100 };
    expect(deriveM3ReconciliationCheckPayload(group, "v1")).toEqual({
      module: "M3",
      kind: "reconciliation_check",
      aggregationFunctionVersion: "v1",
      goldenTestPassed: true,
    });
  });

  it("reconciledAggregateがない(単一内訳)場合はnull", () => {
    const group: ValuationRecordGroup = { methodId: "replacement-cost", records: [] };
    expect(deriveM3ReconciliationCheckPayload(group, "v1")).toBeNull();
  });
});

describe("deriveM3FitnessTierPayload", () => {
  it("tier・compositeScoreを正しく転記する", () => {
    expect(deriveM3FitnessTierPayload("B", 0.6)).toEqual({
      module: "M3",
      kind: "fitness_tier_assignment",
      tier: "B",
      compositeScore: 0.6,
    });
  });
});

describe("deriveM4DecompositionPayload", () => {
  it("PairwiseDecompositionから正しく転記し、not_recalculableな要因をnonDecomposableFactorsに集約する", () => {
    const a = makeValuationRecord({ methodId: "a", centralValue: 100, aopCode: "resource_availability" });
    const b = makeValuationRecord({ methodId: "b", centralValue: 300, aopCode: "human_health" });
    const decomposition = buildPairwiseDecomposition(a, b);

    const payload = deriveM4DecompositionPayload(decomposition, {
      algorithmVersion: "shapley-v1",
      cicesMatchLevel: "group",
      aopMappingVersion: "aop-mapping-v1",
      f3ThresholdVersion: "f3-v1",
      f8ThresholdVersion: "f8-v1",
    });

    expect(payload.module).toBe("M4");
    expect(payload.kind).toBe("decomposition");
    expect(payload.symmetryAxiomApplied).toBe(true);
    expect(payload.fallbackApplied).toEqual(decomposition.fallbackApplied);
    expect(payload.nonDecomposableFactors).toContain("endpointCoverage"); // aopCodeが不一致のためF-4
  });
});

describe("deriveM4RepresentativeValueSelectionPayload", () => {
  it("RepresentativeValueSelectionから正しく転記する", () => {
    const selection: RepresentativeValueSelection = {
      groupValueConcept: "exchange",
      selectedMethodId: "replacement-cost",
      reason: "自社定義の直接コストを優先",
    };
    expect(deriveM4RepresentativeValueSelectionPayload(selection)).toEqual({
      module: "M4",
      kind: "representative_value_selection",
      selectedMethodId: "replacement-cost",
      reason: "自社定義の直接コストを優先",
    });
  });
});

describe("deriveM6BindingMechanismChangePayload", () => {
  it("BindingMechanismChangeEntryから正しく転記する(kindを文字列化)", () => {
    const entry: BindingMechanismChangeEntry = {
      changedAt: "2026-08-02T00:00:00Z",
      previousMechanism: { kind: "weak_reference" },
      newMechanism: { kind: "npv_formula_replacement" },
      reason: "予算確保のため強化",
    };
    expect(deriveM6BindingMechanismChangePayload(entry)).toEqual({
      module: "M6",
      kind: "binding_mechanism_change",
      previous: "weak_reference",
      next: "npv_formula_replacement",
      reason: "予算確保のため強化",
    });
  });
});

describe("deriveM7GapFindingPayload / deriveM7IntentionalDecisionPayload", () => {
  it("GapFindingのgapTypeをそのまま転記する", () => {
    const finding: GapFinding = {
      id: "finding-1",
      claimId: "claim-1",
      gapType: "G3_scope_mismatch",
      evidenceMatch: { claimId: "claim-1", matchedRecordIds: [], matchMethod: "category_period_scope_exact_match" },
      recommendedActions: [],
    };
    expect(deriveM7GapFindingPayload(finding)).toEqual({ module: "M7", kind: "gap_finding", gapType: "G3_scope_mismatch" });
  });

  it("gapTypeがnull(根拠充足)の場合は'none'を転記する", () => {
    const finding: GapFinding = {
      id: "finding-2",
      claimId: "claim-2",
      gapType: null,
      evidenceMatch: { claimId: "claim-2", matchedRecordIds: ["r1"], matchMethod: "category_period_scope_exact_match" },
      recommendedActions: [],
    };
    expect(deriveM7GapFindingPayload(finding)).toEqual({ module: "M7", kind: "gap_finding", gapType: "none" });
  });

  it("IntentionalDecisionRecordのreasonを転記する", () => {
    const record: IntentionalDecisionRecord = {
      gapFindingId: "finding-1",
      reason: "軽微なため許容",
      recordedAt: "2026-08-02T00:00:00Z",
      recordedBy: "team",
    };
    expect(deriveM7IntentionalDecisionPayload(record)).toEqual({
      module: "M7",
      kind: "intentional_decision",
      reason: "軽微なため許容",
    });
  });
});
