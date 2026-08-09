/**
 * 判定件数のカウンタ(M6 D-8、design-rationale-log D-30・D-42・D-45)。
 * 従量課金の唯一の根拠なので、二重課金しないこと・未確定を数えないことをテストで固定する。
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "./client";
import { decisionCountEntry } from "./schema";
import { buildDecisionCountRows, countDecisions, listDecisionCounts } from "./repositories/decision-counts";
import { persistRun } from "./repositories/runs";
import { DEFAULT_RNG_SEED, runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { emptyInteractionState } from "@/lib/demo/interaction-state";
import type { DecisionRecord } from "@core/types/decision";

const TENANT = "decision-count-test";

function makeDecision(id: string, verdict: DecisionRecord["verdict"]): DecisionRecord {
  return {
    id,
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

beforeEach(async () => {
  // このテスト専用テナントの明細を消す。追記テーブルなのでアプリロールでは消せず、
  // 所有者ロールでもないため、テナントIDの分離で他のテストと干渉しないようにしている。
  // ここでは残っていても件数の相対変化で検証する。
});

afterAll(async () => {
  await closeDb();
});

describe("カウント対象の判定(core の shouldCountDecision に従う)", () => {
  it("確定した判定は向きを問わず1件ずつ数える(D-30:結論の向きは課金に影響しない)", () => {
    const rows = buildDecisionCountRows(TENANT, "run-1", [
      { decisionRecord: makeDecision("dr-a", "crosses"), siteId: "site-1" },
      { decisionRecord: makeDecision("dr-b", "does_not_cross"), siteId: "site-2" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.verdict).sort()).toEqual(["crosses", "does_not_cross"]);
  });

  it("pending は数えない(D-45:未確定の状態を課金対象にしない)", () => {
    const rows = buildDecisionCountRows(TENANT, "run-1", [
      { decisionRecord: makeDecision("dr-c", "pending"), siteId: "site-3" },
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("永続化された判定件数", () => {
  it("同じDecisionRecordは何度runを作り直しても1件のまま(二重課金しない)", async () => {
    const result = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED });
    const confirmed = result.decisions.filter((d) => d.decision.decisionRecord.verdict !== "pending");
    expect(confirmed.length).toBeGreaterThan(0); // 前提:確定した判定が少なくとも1件ある

    await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });
    const afterFirst = await countDecisions(TENANT);

    // 操作のたびにrunは作り直される。ここで件数が増えると同じ判定が何度も課金される
    await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });
    await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });

    expect(await countDecisions(TENANT)).toBe(afterFirst);
  });

  it("初回に確定したrunと計上日時が残る(課金根拠の説明に使う)", async () => {
    const entries = await listDecisionCounts(TENANT);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.verdict === "crosses" || entry.verdict === "does_not_cross").toBe(true);
      expect(entry.countedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("計上済みの行は書き換えられない(追記のみ)", async () => {
    const [entry] = await listDecisionCounts(TENANT);

    // drizzleは元のエラーを`cause`に包むため、包まれた側のメッセージで権限拒否を確認する。
    const error = await getDb()
      .update(decisionCountEntry)
      .set({ verdict: "tampered" })
      .where(and(eq(decisionCountEntry.tenantId, TENANT), eq(decisionCountEntry.decisionRecordId, entry.decisionRecordId)))
      .then(
        () => null,
        (e: Error) => e
      );

    expect(error).not.toBeNull();
    const cause = (error as Error & { cause?: Error }).cause;
    expect(`${cause?.message ?? error?.message}`).toMatch(/permission denied/i);
  });
});
