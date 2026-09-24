/**
 * 永続化のラウンドトリップ検証(T-11)。
 *
 * 確認すること:
 *   1. パイプラインの結果をDBに保存して読み戻すと、同じオブジェクトとして復元できる
 *      (JSONを経由しても壊れないこと。branded type は実行時ただの数値なので保持される)
 *   2. run本体(pipeline_run.result)と派生索引(valuation_record 等)が食い違わない
 *   3. 操作イベントを追記すると、畳み込んだ現在値がそのとおりに変わる(計画B-1)
 *   4. 同じシードなら同じ結果になる(計画B-3。runの再現性の前提)
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "./client";
import { interactionEvent, pipelineRun, site, valuationRecord } from "./schema";
import { getLatestRun, persistRun } from "./repositories/runs";
import { appendInteractionEvent, listInteractionEvents, loadInteractionState } from "./repositories/interactions";
import { addSiteEntry, listSiteEntries } from "./repositories/sites";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { DEFAULT_RNG_SEED, RESULT_SCHEMA_VERSION, runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { emptyInteractionState } from "@/lib/demo/interaction-state";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";

const TENANT = "persistence-test";

async function resetTenant(): Promise<void> {
  // テスト用テナントの掃除。アプリ用ロールは追記テーブルをDELETEできないため、
  // 所有者ロール(DATABASE_URL_MIGRATOR)ではなくテナントIDの分離で衝突を避ける方針を取り、
  // ここでは削除できる`site`のみ初期化する。runは追記され続けてよい(最新runだけを見るため)。
  await getDb().delete(site).where(eq(site.tenantId, TENANT));
}

beforeEach(async () => {
  await resetTenant();
});

afterAll(async () => {
  await closeDb();
});

describe("run の永続化", () => {
  it("環境データのみの拠点を保存・再読込しても、投資前提のnullと判定保留を保持する", async () => {
    await addSiteEntry(TENANT,
      { name: "投資前提未入力の検証拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 139 },
      { physicalQuantity: 1000, unit: "m3", unitReplacementCost: 300, investmentCostInitial: null, investmentCostRecurring: null, baselineNpvValue: null, approvalThresholdValue: null, forcePromote: true }
    );
    const [entry] = await listSiteEntries(TENANT);
    expect(entry.deepDive.baselineNpvValue).toBeNull();
    const result = await executeAndPersistRun(TENANT);
    expect(result.deferredDecisions.some((item) => item.siteId === entry.row.id)).toBe(true);
    expect(result.decisions.some((item) => item.siteId === entry.row.id)).toBe(false);
    expect(result.valuation.valuationRecordsByMaterialIssue[`${entry.row.id}-mi-water`].length).toBeGreaterThan(0);
    expect((await getLatestRun(TENANT))!.result.deferredDecisions).toEqual(result.deferredDecisions);
  });
  it("保存した結果を読み戻すと同じオブジェクトになる", async () => {
    const result = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED });

    await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });
    const stored = await getLatestRun(TENANT);

    expect(stored).not.toBeNull();
    expect(stored!.rngSeed).toBe(DEFAULT_RNG_SEED);
    // JSONを経由しても計算結果が変質しないこと(ExchangeAmount等のbranded typeは実行時は数値)
    expect(stored!.result).toEqual(result);
  });

  it("run本体と派生索引(valuation_record)が食い違わない", async () => {
    const result = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED });
    const runId = await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });

    const indexed = await getDb()
      .select()
      .from(valuationRecord)
      .where(and(eq(valuationRecord.tenantId, TENANT), eq(valuationRecord.runId, runId)));

    const fromResult = Object.values(result.valuation.valuationRecordsByMaterialIssue).flat();
    expect(indexed).toHaveLength(fromResult.length);

    for (const record of fromResult) {
      const row = indexed.find((r) => r.id === record.id)!;
      expect(row).toBeDefined();
      expect(row.centralValue).toBe(record.centralValue as unknown as number);
      // not_applicable を A や C に読み替えていないこと(M3 D-4.2 / D-109)
      expect(row.transferFitnessTier).toBe(record.transferFitness.tier);
    }
  });

  it("同じシードで再実行すると、モンテカルロの結果まで一致する", async () => {
    const first = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: 42 });
    const second = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: 42 });
    expect(second.valuation.valuationRecordsByMaterialIssue).toEqual(first.valuation.valuationRecordsByMaterialIssue);
  });
});

describe("結果構造の版(RESULT_SCHEMA_VERSION)", () => {
  it("保存時に現在の版が記録される", async () => {
    const result = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED });
    await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });

    expect((await getLatestRun(TENANT))!.resultSchemaVersion).toBe(RESULT_SCHEMA_VERSION);
  });

  it("版が古いrunは読み出し時に再実行され、新しい版のrunが積まれる", async () => {
    // 古い版のrunを直接作る(結果の構造を変えるコード変更をデプロイした直後の状態)
    const staleRunId = `run-stale-${Date.now()}`;
    await getDb()
      .insert(pipelineRun)
      .values({
        id: staleRunId,
        tenantId: TENANT,
        rngSeed: DEFAULT_RNG_SEED,
        recalculationHash: "m8:stale",
        hashInputs: {},
        result: { companyName: "古い形の結果" },
        resultSchemaVersion: RESULT_SCHEMA_VERSION - 1,
      });

    const result = await getOrCreateLatestResult(TENANT);

    // 古い結果をそのまま返さない(ページが壊れる原因になる)
    expect(result.companyName).not.toBe("古い形の結果");
    const latest = await getLatestRun(TENANT);
    expect(latest!.resultSchemaVersion).toBe(RESULT_SCHEMA_VERSION);
    // 古いrunは削除せず残る(追記のみ、M8 D-5)
    const all = await getDb().select({ id: pipelineRun.id }).from(pipelineRun).where(eq(pipelineRun.tenantId, TENANT));
    expect(all.map((r) => r.id)).toContain(staleRunId);
  });
});

describe("拠点の永続化", () => {
  it("追加した拠点を読み戻せる(プロセスをまたいでも残る)", async () => {
    await addSiteEntry(
      TENANT,
      { name: "テスト工場", siteType: "own_site", industrySector: "chemicals", lat: 35.1, lng: 139.2 },
      {
        physicalQuantity: 1000,
        unit: "m3",
        unitReplacementCost: 300,
        investmentCostInitial: 1_000_000,
        investmentCostRecurring: 100_000,
        baselineNpvValue: 5_000_000,
        approvalThresholdValue: 4_000_000,
        forcePromote: true,
      }
    );

    const entries = await listSiteEntries(TENANT);
    expect(entries).toHaveLength(1);
    expect(entries[0].row.name).toBe("テスト工場");
    expect(entries[0].row.lat).toBe(35.1);
    expect(entries[0].deepDive.forcePromote).toBe(true);
  });

  it("追加した拠点が、保存されたrunの結果に反映される", async () => {
    await addSiteEntry(
      TENANT,
      { name: "追加拠点", siteType: "own_site", industrySector: "chemicals", lat: 34.0, lng: 135.0 },
      {
        physicalQuantity: 500,
        unit: "m3",
        unitReplacementCost: 200,
        investmentCostInitial: 500_000,
        investmentCostRecurring: 50_000,
        baselineNpvValue: 3_000_000,
        approvalThresholdValue: 2_000_000,
        forcePromote: false,
      }
    );

    const result = await executeAndPersistRun(TENANT);
    expect(result.assessment.sites.map((s) => s.name)).toContain("追加拠点");

    // 保存済みrunを読み直しても同じ(ページはこちらを読む)
    const stored = await getLatestRun(TENANT);
    expect(stored!.result.assessment.sites.map((s) => s.name)).toContain("追加拠点");
  });
});

describe("操作イベントの畳み込み(計画B-1)", () => {
  it("追記したイベントの最新値が現在値になり、履歴も同じ列から得られる", async () => {
    const subjectId = `mi-${Date.now()}`;

    await appendInteractionEvent(TENANT, {
      actor: "テスト",
      kind: "representative_selection",
      subjectId,
      payload: { recordId: "vr-a", fromLabel: "A", toLabel: "B", reason: "初回選択", logMessage: "代表値をBに変更" },
    });
    await appendInteractionEvent(TENANT, {
      actor: "テスト",
      kind: "representative_selection",
      subjectId,
      payload: { recordId: "vr-c", fromLabel: "B", toLabel: "C", reason: "再選択", logMessage: "代表値をCに変更" },
    });

    const state = await loadInteractionState(TENANT);

    // 現在値は最新イベント
    expect(state.representativeRecordId.get(subjectId)).toBe("vr-c");
    expect(state.m4ChangeLog.get(subjectId)?.reason).toBe("再選択");

    // 過去のイベントは消えない(この対象について2件そのまま残っている)。
    // interaction_event はテナント単位で追記され続けるため、全体件数ではなく
    // この対象のイベントだけを数える。
    const events = (await listInteractionEvents(TENANT)).filter((e) => e.subjectId === subjectId);
    expect(events.map((e) => e.payload.recordId)).toEqual(["vr-a", "vr-c"]);
    expect(state.actionLog[0].what).toBe("代表値をCに変更");
  });

  it("拘束方式の変更は上書きではなく履歴を積む(M6 D-9)", async () => {
    const siteId = `site-${Date.now()}`;

    await appendInteractionEvent(TENANT, {
      actor: "テスト",
      kind: "binding_mechanism_change",
      subjectId: siteId,
      payload: { mechanism: { kind: "weak_reference" }, reason: "初期選択" },
    });
    await appendInteractionEvent(TENANT, {
      actor: "テスト",
      kind: "binding_mechanism_change",
      subjectId: siteId,
      payload: { mechanism: { kind: "npv_formula_replacement" }, reason: "判定式に組み込むことにしたため" },
    });

    const state = await loadInteractionState(TENANT);
    const binding = state.bindingMechanismState.get(siteId)!;

    expect(binding.mechanism).toEqual({ kind: "npv_formula_replacement" });
    expect(binding.history).toHaveLength(1);
    expect(binding.history[0].previousMechanism).toEqual({ kind: "weak_reference" });
    expect(binding.history[0].reason).toBe("判定式に組み込むことにしたため");
  });
});

describe("追記テーブルの不変性", () => {
  it("過去のrunは新しいrunを作っても消えない", async () => {
    const result = runDemoPipeline({ userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED });
    const firstId = await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });
    const secondId = await persistRun({ tenantId: TENANT, rngSeed: DEFAULT_RNG_SEED, result });

    const rows = await getDb().select({ id: pipelineRun.id }).from(pipelineRun).where(eq(pipelineRun.tenantId, TENANT));
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(firstId);
    expect(ids).toContain(secondId);
  });

  it("操作イベントは追記されるだけで、既存行が書き換わらない", async () => {
    const before = await getDb().select().from(interactionEvent).where(eq(interactionEvent.tenantId, TENANT));

    await appendInteractionEvent(TENANT, {
      actor: "テスト",
      kind: "depth_override",
      subjectId: `mi-${Date.now()}`,
      payload: { mode: "promote" },
    });

    const after = await getDb().select().from(interactionEvent).where(eq(interactionEvent.tenantId, TENANT));
    expect(after.length).toBe(before.length + 1);
    // 既存行がそのまま残っている
    for (const row of before) {
      expect(after.find((r) => r.id === row.id)).toEqual(row);
    }
  });
});
