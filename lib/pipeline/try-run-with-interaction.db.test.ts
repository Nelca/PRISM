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
import { replaceSiteEntries } from "@/lib/db/repositories/sites";
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
});
