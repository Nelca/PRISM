import { describe, expect, it } from "vitest";
import { buildGapFinding, buildRecommendedActions, determineGapType } from "./gap-finding";
import type { EvidenceCandidate } from "./evidence-match";
import type { DisclosureClaim } from "../types/disclosure";

function makeClaim(overrides: Partial<DisclosureClaim["extractedMetadata"]> = {}): DisclosureClaim {
  return {
    id: "claim-1",
    sourceDocument: "統合報告書2024",
    sourcePageOrSection: "p.42",
    rawText: "テスト用の主張文",
    claimType: "future_commitment",
    extractedMetadata: {
      category: "water",
      quantityMentioned: { value: 20, unit: "%" },
      periodMentioned: { startYear: 2026, endYear: 2030 },
      scopeMentioned: "国内主要拠点",
      ...overrides,
    },
    extractionConfidence: "high",
  };
}

function makeCandidate(overrides: Partial<EvidenceCandidate> & { recordId: string }): EvidenceCandidate {
  return {
    category: "water",
    period: { startYear: 2026, endYear: 2030 },
    scope: "国内主要拠点",
    transferFitnessTier: "A",
    ...overrides,
  };
}

describe("determineGapType", () => {
  it("該当カテゴリの候補が皆無ならG1(根拠不在)", () => {
    const claim = makeClaim();
    const candidates = [makeCandidate({ recordId: "r1", category: "climate" })];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G1_no_evidence");
    expect(result.matchedRecordIds).toEqual([]);
  });

  it("候補はあるが全件tier Cなら G2(根拠薄弱)", () => {
    const claim = makeClaim();
    const candidates = [
      makeCandidate({ recordId: "r1", transferFitnessTier: "C" }),
      makeCandidate({ recordId: "r2", transferFitnessTier: "C" }),
    ];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G2_weak_evidence");
    expect(result.matchedRecordIds.sort()).toEqual(["r1", "r2"]);
  });

  it("tier Cでない候補が1件でもあればG2にならず、scope判定に進む", () => {
    const claim = makeClaim();
    const candidates = [
      makeCandidate({ recordId: "r1", transferFitnessTier: "C" }),
      makeCandidate({ recordId: "r2", transferFitnessTier: "A" }),
    ];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBeNull(); // scope・period両方一致するため根拠充足
  });

  it("scopeが一致する候補がなければG3(範囲不一致)", () => {
    const claim = makeClaim();
    const candidates = [
      makeCandidate({ recordId: "r1", scope: "site-B" }),
      makeCandidate({ recordId: "r2", scope: "site-C" }),
    ];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G3_scope_mismatch");
    expect(result.matchedRecordIds).toEqual([]);
  });

  it("periodが一致する候補がなければG4(期間不一致)", () => {
    const claim = makeClaim();
    const candidates = [makeCandidate({ recordId: "r1", period: { startYear: 2020, endYear: 2025 } })];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G4_period_mismatch");
    expect(result.matchedRecordIds).toEqual([]);
  });

  it("すべて一致すれば根拠充足(gapType=null)", () => {
    const claim = makeClaim();
    const candidates = [makeCandidate({ recordId: "r1" })];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBeNull();
    expect(result.matchedRecordIds).toEqual(["r1"]);
  });

  it("claimの各フィールドがnullの場合、その次元では絞り込まない", () => {
    const claim = makeClaim({ scopeMentioned: null, periodMentioned: null });
    const candidates = [makeCandidate({ recordId: "r1", scope: "何でもよい", period: null })];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBeNull();
    expect(result.matchedRecordIds).toEqual(["r1"]);
  });

  it("優先順位:候補が薄弱(G2)かつ範囲不一致でも、より根本的なG2が優先される", () => {
    const claim = makeClaim();
    const candidates = [makeCandidate({ recordId: "r1", scope: "site-B", transferFitnessTier: "C" })];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G2_weak_evidence"); // scopeも不一致だがG2が先に該当
  });

  it("categoryMatches全体では混在していても、scope絞り込み後に実際の根拠がtier Cのみになる場合はG2と判定する", () => {
    // 強い根拠(tier A)は範囲外(site-B)、弱い根拠(tier C)のみが範囲内(国内主要拠点)。
    // categoryMatches.every(tier==="C")はfalseのため早期のG2判定はすり抜けるが、
    // 実際にscope・periodを満たす根拠はr2(tier C)のみであり、根拠充足と誤判定してはならない。
    const claim = makeClaim();
    const candidates = [
      makeCandidate({ recordId: "r1", scope: "site-B", transferFitnessTier: "A" }),
      makeCandidate({ recordId: "r2", transferFitnessTier: "C" }),
    ];
    const result = determineGapType(claim, candidates);
    expect(result.gapType).toBe("G2_weak_evidence");
    expect(result.matchedRecordIds).toEqual(["r2"]);
  });
});

describe("buildRecommendedActions", () => {
  it("gapTypeがnull(根拠充足)の場合は空配列", () => {
    expect(buildRecommendedActions(null)).toEqual([]);
  });

  it("ギャップがある場合は常に3種すべてを返す", () => {
    const actions = buildRecommendedActions("G1_no_evidence");
    expect(actions).toEqual([
      { kind: "weaken_claim" },
      { kind: "acquire_additional_evidence", triggersDeepDive: true },
      { kind: "record_as_intentional_decision", reason: "" },
    ]);
  });
});

describe("buildGapFinding", () => {
  it("id・claimId・evidenceMatch・recommendedActionsを正しく組み立てる", () => {
    const claim = makeClaim();
    const candidates = [makeCandidate({ recordId: "r1" })];
    const finding = buildGapFinding("finding-1", claim, candidates);

    expect(finding.id).toBe("finding-1");
    expect(finding.claimId).toBe("claim-1");
    expect(finding.gapType).toBeNull();
    expect(finding.evidenceMatch.matchMethod).toBe("category_period_scope_exact_match");
    expect(finding.recommendedActions).toEqual([]);
  });
});
