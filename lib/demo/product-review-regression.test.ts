import { describe, expect, it } from "vitest";
import { runDemoPipeline } from "./run-demo-pipeline";
import { emptyInteractionState } from "./interaction-state";
import { DEFAULT_DEEP_DIVE_PARAMS } from "./user-site-defaults";
import { deriveStepProgress } from "@/lib/pipeline/pipeline-progress";
import { deriveOpenTasks } from "@/lib/pipeline/open-actions";

describe("初回利用レビューの回帰防止", () => {
  function runUser(claim?: string, deferDecision = false) {
    return runDemoPipeline({
      rngSeed: 42,
      interactions: emptyInteractionState(),
      userSites: [{
        row: { id: "site-user-review", name: "検証用拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 139 },
        deepDive: { ...DEFAULT_DEEP_DIVE_PARAMS, category: "climate", unit: "tCO2e", baselineNpvValue: 321_000_000, approvalThresholdValue: null, disclosureClaimText: claim, ...(deferDecision ? { baselineNpvValue: null, investmentCostInitial: null, investmentCostRecurring: null } : {}) },
      }],
    });
  }
  it("環境データのみの登録では貨幣化を続け、NPV・ROI・判定件数を生成しない", () => {
    const result = runUser("排出量の把握を進めています。", true);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-user-review-mi-climate"].length).toBeGreaterThan(0);
    expect(result.decisions.some((entry) => entry.siteId === "site-user-review")).toBe(false);
    expect(result.deferredDecisions).toContainEqual({ siteId: "site-user-review", siteName: "検証用拠点" });
    expect(result.disclosureClaims.some((claim) => claim.id === "claim-site-user-review-2027")).toBe(true);
    expect(deriveOpenTasks(result).some((task) => task.id === "decision-inputs")).toBe(true);
    const ready = runUser();
    expect(ready.deferredDecisions).toHaveLength(0);
    expect(ready.decisions.some((entry) => entry.siteId === "site-user-review")).toBe(true);
  });
  it("詳細評価に進まない拠点は、投資の前提待ちとして案内しない", () => {
    const result = runDemoPipeline({
      rngSeed: 42,
      interactions: emptyInteractionState(),
      userSites: [{
        row: { id: "site-user-review", name: "検証用拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 139 },
        deepDive: { ...DEFAULT_DEEP_DIVE_PARAMS, forcePromote: false, baselineNpvValue: null, investmentCostInitial: null, investmentCostRecurring: null },
      }],
    });
    // 前提: 優先度算定で詳細評価に昇格していない(前提を入力しても判定は生まれない)。
    expect(result.valuation.valuationRecordsByMaterialIssue["site-user-review-mi-water"] ?? []).toHaveLength(0);
    expect(result.deferredDecisions).toHaveLength(0);
    expect(deriveOpenTasks(result).some((task) => task.id === "decision-inputs")).toBe(false);
  });
  it("GHG拠点に入力したNPVを使い、未入力の承認ラインと開示文を補完しない", () => {
    const result = runUser();
    const record = result.decisions.find((entry) => entry.siteId === "site-user-review")!.decision.decisionRecord;
    expect(record.baselineNpv.value).toBe(321_000_000);
    expect(record.approvalThreshold).toBe("pending");
    expect(record.verdict).toBe("pending");
    expect(result.disclosureClaims.some((claim) => claim.id === "claim-site-user-review-2027")).toBe(false);
  });
  it("手入力の開示文に存在しない20%・2030年を構造化データへ混ぜない", () => {
    const result = runUser("当社は2040年に排出量を50%削減する目標を設定しています。");
    const claim = result.disclosureClaims.find((entry) => entry.id === "claim-site-user-review-2027")!;
    expect(claim.rawText).toContain("2040年");
    expect(claim.extractedMetadata.quantityMentioned).toBeNull();
    expect(claim.extractedMetadata.periodMentioned).toBeNull();
    expect(claim.extractionConfidence).toBe("low");
    expect(result.disclosure.gapFindings.find((finding) => finding.claimId === claim.id)?.gapType).not.toBeNull();
  });
  it("参考記載を明示的に選んだ拠点を未選択扱いにしない", () => {
    const interactions = emptyInteractionState();
    const initial = runDemoPipeline({ userSites: [], interactions, rngSeed: 42 });
    for (const entry of initial.decisions) interactions.bindingMechanismState.set(entry.siteId, { mechanism: { kind: "weak_reference" }, history: [] });
    const result = runDemoPipeline({ userSites: [], interactions, rngSeed: 42 });
    expect(result.decisions.every((entry) => entry.bindingConfirmed)).toBe(true);
    expect(deriveStepProgress(result).find((step) => step.href === "/decision")?.done).toBe(true);
    expect(deriveOpenTasks(result).some((task) => task.id === "binding-mechanism")).toBe(false);
    expect(deriveOpenTasks(initial).some((task) => task.id === "binding-mechanism")).toBe(true);
  });
});
