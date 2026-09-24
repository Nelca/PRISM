/**
 * 第4版 D-01-2:「検証してから永続化」。
 *
 * 従来は「イベントをDBへ追記 → パイプライン実行」の順だったため、パイプラインが
 * 例外を投げる入力でもイベントだけが永続化され、**以後のあらゆる操作が同じ例外で
 * 失敗し続けた**(イベントは追記のみで取り消せない)。
 *
 * ここでは実際に到達しうる壊れる入力(評価期間0年 —— 対策案の1年目の回避コストが
 * 期間を超える。M6 D-4 の `HorizonExceededError`)で、DBに何も書かれないことを検証する。
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db/client";
import { listInteractionEvents } from "@/lib/db/repositories/interactions";
import { getLatestRun } from "@/lib/db/repositories/runs";
import { addSiteEntry, listSiteEntries, replaceSiteEntries } from "@/lib/db/repositories/sites";
import { projectInteractionState } from "@/lib/demo/interaction-state";
import { runDemoPipeline, DEFAULT_RNG_SEED } from "@/lib/demo/run-demo-pipeline";
import { loadCategoryExpansion } from "./execute-run";
import { tryRunAndPersist } from "./try-run-with-interaction";

const TENANT = "try-run-with-interaction-test";
const SITE_ID = "site-042";

afterAll(async () => {
  await closeDb();
});

function decisionParametersEvent(horizon: number) {
  return {
    actor: "テスト",
    kind: "decision_parameters" as const,
    subjectId: SITE_ID,
    payload: {
      parameters: {
        baselineNpvValue: 1_000_000_000,
        discountRate: 0.06,
        horizon,
        approvalThresholdValue: 1_010_000_000,
      },
    },
  };
}

describe("検証してから永続化する(D-01-2)", () => {
  it("パイプラインが通らない入力では、イベントもrunもDBに書かない", async () => {
    await replaceSiteEntries(TENANT, []);
    const eventsBefore = await listInteractionEvents(TENANT);
    const runBefore = await getLatestRun(TENANT);

    const outcome = await tryRunAndPersist(TENANT, {
      label: "投資判断の前提の入力",
      events: [decisionParametersEvent(0)],
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // 平易な日本語で返し、生の例外メッセージ・内部IDは画面に出さない。
      expect(outcome.message).toContain("投資判断の前提の入力を適用できませんでした");
      expect(outcome.message).not.toContain("HorizonExceeded");
      expect(outcome.message).not.toContain("avoidedNatureCost");
    }

    expect((await listInteractionEvents(TENANT)).length).toBe(eventsBefore.length);
    expect((await getLatestRun(TENANT))?.id).toBe(runBefore?.id);
  });

  it("成功する入力なら、イベントの追記と検証済みrunの保存が両方行われる", async () => {
    await replaceSiteEntries(TENANT, []);
    const eventsBefore = await listInteractionEvents(TENANT);

    const outcome = await tryRunAndPersist(TENANT, {
      label: "投資判断の前提の入力",
      events: [decisionParametersEvent(10)],
    });

    expect(outcome.ok).toBe(true);
    expect((await listInteractionEvents(TENANT)).length).toBe(eventsBefore.length + 1);

    const latest = await getLatestRun(TENANT);
    const record = latest!.result.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord;
    expect(record.baselineNpv.horizon).toBe(10);
  });

  it("失敗したあとでも、次の正しい操作は通る(操作不能の連鎖が起きない)", async () => {
    await replaceSiteEntries(TENANT, []);

    const failed = await tryRunAndPersist(TENANT, { label: "投資判断の前提の入力", events: [decisionParametersEvent(0)] });
    expect(failed.ok).toBe(false);

    const recovered = await tryRunAndPersist(TENANT, {
      label: "投資判断の前提の入力",
      events: [decisionParametersEvent(8)],
    });
    expect(recovered.ok).toBe(true);

    const latest = await getLatestRun(TENANT);
    const record = latest!.result.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord;
    expect(record.baselineNpv.horizon).toBe(8);
  });

  it("commit後に例外が起きてもsiteを含む全変更をロールバックする", async () => {
    await replaceSiteEntries(TENANT, []);
    const outcome = await tryRunAndPersist(TENANT, {
      label: "拠点の追加",
      userSites: (sites) => sites,
      commit: async (db) => {
        await addSiteEntry(
          TENANT,
          { name: "ロールバック対象", siteType: "own_site", industrySector: "chemicals", address: "東京" },
          { physicalQuantity: 1, unit: "m3", unitReplacementCost: 1, investmentCostInitial: 1,
            investmentCostRecurring: 1, baselineNpvValue: 1, approvalThresholdValue: 1, forcePromote: false },
          db
        );
        throw new Error("commit後の擬似障害");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(await listSiteEntries(TENANT)).toEqual([]);
  });

  it("同時操作後の最新runは、保存された全イベントから再計算した結果と一致する", async () => {
    await replaceSiteEntries(TENANT, []);
    const before = (await listInteractionEvents(TENANT)).length;
    await Promise.all([
      tryRunAndPersist(TENANT, { label: "操作A", events: [decisionParametersEvent(7)] }),
      tryRunAndPersist(TENANT, { label: "操作B", events: [decisionParametersEvent(9)] }),
    ]);

    const events = await listInteractionEvents(TENANT);
    expect(events).toHaveLength(before + 2);
    const expansion = await loadCategoryExpansion(TENANT);
    const expected = runDemoPipeline({
      ...expansion,
      userSites: await listSiteEntries(TENANT),
      interactions: projectInteractionState(events),
      rngSeed: DEFAULT_RNG_SEED,
    });
    expect((await getLatestRun(TENANT))?.result.recalculationHash.hash).toBe(expected.recalculationHash.hash);
  });
});
