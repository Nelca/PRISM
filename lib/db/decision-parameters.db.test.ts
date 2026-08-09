/**
 * M6 D-10(段階的開示)の実動作(GAP-03)。
 *
 * これまで承認閾値はデモの固定値で、**`pending` の経路を一度も通っていなかった。**
 * 入力UIが入って初めて「未入力 → 保留 → 入力 → 確定」が実際に起きる。
 * design-rationale-log R-1が「営業難度に直結する」と書いた設計そのもの。
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "./client";
import { appendInteractionEvent } from "./repositories/interactions";
import { countDecisions } from "./repositories/decision-counts";
import { replaceSiteEntries } from "./repositories/sites";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const TENANT = "decision-parameters-test";
const SITE_ID = "site-042"; // 架空企業の深掘り対象(company.tsの固定データ)

afterAll(async () => {
  await closeDb();
});

async function saveParameters(approvalThresholdValue: number | null): Promise<void> {
  await appendInteractionEvent(TENANT, {
    actor: "テスト",
    kind: "decision_parameters",
    subjectId: SITE_ID,
    payload: {
      parameters: {
        baselineNpvValue: 100_000_000,
        discountRate: 0.05,
        horizon: 10,
        approvalThresholdValue,
      },
    },
  });
}

describe("承認閾値の段階的開示(M6 D-10)", () => {
  it("承認閾値が未入力なら★判定はpendingで、判定件数に計上されない", async () => {
    await replaceSiteEntries(TENANT, []);
    // 判定件数は追記のみで消えないため、絶対値ではなく「増えないこと」で検証する
    const before = await countDecisions(TENANT);

    await saveParameters(null);
    const result = await executeAndPersistRun(TENANT);
    const record = result.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord;

    expect(record.approvalThreshold).toBe("pending");
    expect(record.verdict).toBe("pending");
    // 未確定の状態を課金対象にしない(D-45)
    expect(await countDecisions(TENANT)).toBe(before);

    // 段階的開示:判定は保留でも、自然調整後NPVのレンジは通常どおり算出される
    expect(record.natureAdjustedNpv.quantileRange.p95).toBeGreaterThan(record.natureAdjustedNpv.quantileRange.p5);
    // 深掘り推奨はcrossesのときだけ付く
    expect(record.deepDiveRecommendation).toBeUndefined();
  });

  it("承認閾値を入力すると判定が確定し、その時点で計上される", async () => {
    const before = await countDecisions(TENANT);

    // レンジの下限より低い閾値 → 「どう転んでも閾値を上回る」= does_not_cross
    await saveParameters(1_000);
    const result = await executeAndPersistRun(TENANT);
    const record = result.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord;

    expect(record.approvalThreshold).not.toBe("pending");
    expect(record.verdict).toBe("does_not_cross");
    // pendingのままだった判定が、確定した時点で初めて1件になる
    expect(await countDecisions(TENANT)).toBe(Math.max(before, 1));
  });

  it("閾値がレンジの内側なら crosses になり、深掘り推奨が付く", async () => {
    const countBefore = await countDecisions(TENANT);
    const previous = await executeAndPersistRun(TENANT);
    const range = previous.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord.natureAdjustedNpv
      .quantileRange;

    await saveParameters((range.p5 + range.p95) / 2);
    const result = await executeAndPersistRun(TENANT);
    const record = result.decisions.find((d) => d.siteId === SITE_ID)!.decision.decisionRecord;

    expect(record.verdict).toBe("crosses");
    expect(record.deepDiveRecommendation).toBeDefined();
    // 同じDecisionRecordなので件数は増えない(D-117:判定の向きが変わっても再課金しない)
    expect(await countDecisions(TENANT)).toBe(countBefore);
  });
});
