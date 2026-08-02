import { describe, expect, it } from "vitest";
import { runDisclosurePipeline } from "./disclosure-pipeline";
import { createIdSequence } from "./ids";
import type { DisclosureClaim } from "../types/disclosure";

const NOW = "2026-08-02T00:00:00Z";

const claim: DisclosureClaim = {
  id: "claim-1",
  sourceDocument: "統合報告書2024",
  sourcePageOrSection: "p.42",
  rawText: "当社は水使用量を削減します。",
  claimType: "future_commitment",
  extractedMetadata: { category: "water", quantityMentioned: null, periodMentioned: null, scopeMentioned: null },
  extractionConfidence: "high",
};

describe("runDisclosurePipeline", () => {
  it("各claimについてGapFindingとM7のAssumptionEntry(gap_finding)が実際に生成される", () => {
    const result = runDisclosurePipeline({
      claims: [claim],
      candidatesForClaim: () => [],
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.gapFindings).toHaveLength(1);
    expect(result.gapFindings[0].gapType).toBe("G1_no_evidence"); // 候補なし

    const gapEntry = result.assumptionEntries.find((e) => e.payload.kind === "gap_finding")!;
    expect(gapEntry.sourceModule).toBe("M7");
    expect(gapEntry.relatedRecordId).toBe(result.gapFindings[0].id);
  });

  it("intentionalDecisionsを指定すると、IntentionalDecisionRecordとM7のAssumptionEntry(intentional_decision)が生成される", () => {
    const result = runDisclosurePipeline({
      claims: [claim],
      candidatesForClaim: () => [],
      intentionalDecisions: [
        { gapFindingId: "ae-0", reason: "軽微なギャップのため許容", recordedBy: "team", recordedAt: NOW },
      ],
      idSequence: createIdSequence("ae"),
      now: NOW,
    });

    expect(result.intentionalDecisionRecords).toHaveLength(1);
    expect(result.intentionalDecisionRecords[0].reason).toBe("軽微なギャップのため許容");

    const decisionEntry = result.assumptionEntries.find((e) => e.payload.kind === "intentional_decision")!;
    expect(decisionEntry.sourceModule).toBe("M7");
  });
});
