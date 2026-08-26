import { describe, expect, it } from "vitest";
import { exchangeAmount } from "@core/types/common";
import { emptyInteractionState } from "./interaction-state";
import { DEFAULT_RNG_SEED, runDemoPipeline } from "./run-demo-pipeline";

function run(interactions = emptyInteractionState()) {
  return runDemoPipeline({ userSites: [], interactions, rngSeed: DEFAULT_RNG_SEED });
}

function flagship(result: ReturnType<typeof run>) {
  return result.decisions.find((decision) => decision.siteId === "site-042")!;
}

describe("意思決定フェーズの組み立て", () => {
  it("本社工場の4種類の対策案を安定した順序で返す", () => {
    expect(flagship(run()).countermeasureCandidates.map((candidate) => candidate.key)).toEqual([
      "reduction",
      "avoidance",
      "transfer",
      "acceptance",
    ]);
  });

  it("同一入力と同一seedなら意思決定結果が一致する", () => {
    expect(run().decisions).toEqual(run().decisions);
  });

  it("承認ライン未入力なら判定をpendingのままにする", () => {
    const interactions = emptyInteractionState();
    interactions.decisionParameters.set("site-042", {
      baselineNpvValue: 1_200_000_000,
      discountRate: 0.06,
      horizon: 10,
      approvalThresholdValue: null,
    });
    expect(flagship(run(interactions)).decision.decisionRecord.verdict).toBe("pending");
  });

  it("保存済み対策案を復元する", () => {
    const interactions = emptyInteractionState();
    interactions.selectedCountermeasureKey.set("site-042", "avoidance");
    expect(flagship(run(interactions)).selectedCountermeasureKey).toBe("avoidance");
  });

  it("計算不能な保存済み対策案だけを除外し、警告付きで既定案へ戻す", () => {
    const interactions = emptyInteractionState();
    interactions.decisionParameters.set("site-042", {
      baselineNpvValue: 1_200_000_000,
      discountRate: 0.06,
      horizon: 10,
      approvalThresholdValue: 1_200_000_000,
    });
    interactions.selectedCountermeasureKey.set("site-042", "acceptance");
    const result = run(interactions);
    const decision = flagship(result);

    expect(decision.countermeasureCandidates.map((candidate) => candidate.key)).not.toContain("acceptance");
    expect(decision.countermeasureCandidates).toHaveLength(3);
    expect(decision.selectedCountermeasureKey).toBe("reduction");
    expect(result.warnings.map((warning) => warning.id)).toContain(
      "countermeasure-selection-unavailable-site-042",
    );
  });

  it("拘束方式、全履歴、直近の変更理由を最終判定と台帳へ引き継ぐ", () => {
    const interactions = emptyInteractionState();
    interactions.bindingMechanismState.set("site-042", {
      mechanism: { kind: "budget_allocation", targetSiteId: "site-042", amount: exchangeAmount(20_000_000) },
      history: [
        {
          changedAt: "2027-01-10T00:00:00Z",
          previousMechanism: { kind: "weak_reference" },
          newMechanism: { kind: "npv_formula_replacement" },
          reason: "稟議式に反映するため",
        },
        {
          changedAt: "2027-02-10T00:00:00Z",
          previousMechanism: { kind: "npv_formula_replacement" },
          newMechanism: { kind: "budget_allocation", targetSiteId: "site-042", amount: exchangeAmount(20_000_000) },
          reason: "拠点予算へ配賦するため",
        },
      ],
    });
    const result = run(interactions);
    const decision = flagship(result).decision;

    expect(decision.decisionRecord.bindingMechanism.kind).toBe("budget_allocation");
    expect(decision.decisionRecord.bindingMechanismHistory).toEqual(
      interactions.bindingMechanismState.get("site-042")!.history,
    );
    expect(decision.assumptionEntries).toHaveLength(1);
    expect(JSON.stringify(decision.assumptionEntries[0])).toContain("拠点予算へ配賦するため");
  });
});
