import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/lib/db/client";
import { loadInteractionState, listInteractionEvents } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { getLatestRun } from "@/lib/db/repositories/runs";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { evaluateTarget, type EnvironmentalTarget } from "./metrics";

const tenant = `environment-test-${randomUUID()}`;
const record: EnvironmentalTarget = {
  id: `target-${randomUUID()}`, revision: "v1", siteId: "site-042", metricId: "recycled_material_share",
  boundary: "検証用のアルミニウム", reportingYear: 2027, current: 20, baseline: 10, target: 40,
  direction: "at_least", measuredOn: "2027-06-30", evidence: "架空の投入重量台帳による検証値",
  targetBasis: "検証用の社内方針40%以上", owner: "検証担当", dueDate: "2027-09-30",
  actionPlan: "再生材の導入計画を確認", archived: false, updatedAt: "2027-07-01T00:00:00.000Z",
};
function save(value: EnvironmentalTarget, expectedRevision: string | null) {
  return tryRunAndPersist(tenant, { label: "統合管理のDB検証", events: [{ actor: "自動検証", kind: "environmental_target_update", subjectId: value.id, payload: { record: value, expectedRevision, reason: "DB保存の動作確認" } }] });
}
afterAll(closeDb);
describe("環境目標の永続化", () => {
  it("テナント分離・競合の原子性・更新履歴・保管復帰をDBから再現する", async () => {
    const original = await executeAndPersistRun(tenant);
    expect(original.assessment.materialIssues.some((issue) => issue.impactCategory === "waste")).toBe(true);
    expect(await save(record, null)).toEqual({ ok: true });
    expect((await getLatestRun(tenant))!.result.environmentalTargets).toEqual([record]);
    expect((await loadInteractionState(`${tenant}-other`)).environmentalTargets.size).toBe(0);
    expect((await getLatestRun(tenant))!.result.valuation).toEqual(original.valuation);
    expect((await getLatestRun(tenant))!.result.decisions).toEqual(original.decisions);
    const updated = { ...record, revision: "v2", current: 45 };
    expect(await save(updated, "v1")).toEqual({ ok: true });
    const before = await getLatestRun(tenant);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await save({ ...record, revision: "stale" }, "v1")).ok).toBe(false);
      expect((await save({ ...record, id: "duplicate" }, null)).ok).toBe(false);
    } finally { errors.mockRestore(); }
    expect((await listInteractionEvents(tenant)).length).toBe(2);
    expect((await getLatestRun(tenant))!.id).toBe(before!.id);
    const archived = { ...updated, revision: "v3", archived: true };
    expect(await save(archived, "v2")).toEqual({ ok: true });
    const restored = { ...archived, revision: "v4", archived: false };
    expect(await save(restored, "v3")).toEqual({ ok: true });
    const loaded = (await loadInteractionState(tenant)).environmentalTargets.get(record.id)!;
    expect(loaded).toEqual(restored);
    expect(evaluateTarget(loaded)).toBe("met");
    const events = await listInteractionEvents(tenant);
    expect(events).toHaveLength(4);
    expect(events[0].payload.record).toEqual(record);
    expect((await getLatestRun(tenant))!.result.environmentalTargets).toEqual([restored]);
  });
});
