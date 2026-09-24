import { describe, expect, it } from "vitest";
import { METRICS, evaluateTarget, isOverdue, targetDelta, type EnvironmentalTarget } from "./metrics";
import { parseTargetForm } from "./validation";
import { applyTargetUpdate } from "./projection";
import { buildPortfolioRows, filterPortfolio, portfolioCsv } from "./portfolio";
import { projectInteractionState, type InteractionEvent } from "@/lib/demo/interaction-state";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";

const record: EnvironmentalTarget = {
  id: "target-test", revision: "v1", siteId: "site-1", metricId: "certified_procurement_share",
  boundary: "国内の認証木材", reportingYear: 2027, current: 70, baseline: 60, target: 80,
  direction: "at_least", measuredOn: "2027-06-30", evidence: "2027年購買台帳・認証木材重量／総調達重量",
  targetBasis: "2027年度の購買方針で80%以上と承認", owner: "購買部", dueDate: "2027-09-30",
  actionPlan: "未認証の仕入先を確認", archived: false, updatedAt: "2027-07-01T00:00:00.000Z",
};
function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...record, ...overrides })) if (value !== undefined) data.set(key, String(value));
  return data;
}
function event(value: EnvironmentalTarget, expectedRevision: string | null): InteractionEvent {
  return { id: value.revision, createdAt: value.updatedAt, actor: "検証", kind: "environmental_target_update", subjectId: value.id, payload: { record: value, expectedRevision } };
}

describe("物理指標の入力と判定", () => {
  it("未測定・目標未設定を未達やゼロに置き換えず、0と境界値を正しく判定する", () => {
    expect(evaluateTarget({ ...record, current: null })).toBe("missing_measurement");
    expect(evaluateTarget({ ...record, target: null })).toBe("missing_target");
    expect(evaluateTarget(record)).toBe("not_met");
    expect(evaluateTarget({ ...record, current: 80 })).toBe("met");
    expect(evaluateTarget({ ...record, current: 0, target: 0, direction: "at_most" })).toBe("met");
    expect(evaluateTarget({ ...record, current: 0.1, target: 0, direction: "at_most" })).toBe("not_met");
    expect(targetDelta(record)).toBe(10);
    expect(targetDelta({ ...record, baseline: null })).toBeNull();
  });
  it("期限当日・達成済み・保管は超過とせず、未測定で期限を過ぎた対象は拾う", () => {
    expect(isOverdue(record, "2027-09-30")).toBe(false);
    expect(isOverdue(record, "2027-10-01")).toBe(true);
    expect(isOverdue({ ...record, current: null }, "2027-10-01")).toBe(true);
    expect(isOverdue({ ...record, current: 80 }, "2027-10-01")).toBe(false);
    expect(isOverdue({ ...record, archived: true }, "2027-10-01")).toBe(false);
  });
  it("値のない計画を登録でき、未入力の値はnullとして保持する", () => {
    expect(parseTargetForm(form({ current: "", baseline: "", target: "", measuredOn: "", evidence: "", targetBasis: "" }))).toMatchObject({ current: null, baseline: null, target: null });
  });
  it.each(["current", "baseline", "target"])("割合の%sは0〜100の範囲に制限する", (key) => {
    expect(parseTargetForm(form({ [key]: "101" }))).toHaveProperty("error");
    expect(parseTargetForm(form({ [key]: "-1" }))).toHaveProperty("error");
    expect(parseTargetForm(form({ [key]: "0" }))).not.toHaveProperty("error");
  });
  it.each([
    { metricId: "invented" }, { reportingYear: "2027.5" }, { current: "Infinity" }, { current: "NaN" },
    { measuredOn: "2027-02-30" }, { dueDate: "2027-13-01" }, { evidence: "" }, { targetBasis: "" },
    { direction: "" }, { boundary: "" }, { current: "", baseline: "0", measuredOn: "" },
  ])("不正な入力・根拠不足を保存前に拒否する: %j", (override) => {
    expect(parseTargetForm(form(override))).toHaveProperty("error");
  });
  it("全15指標を登録でき、生物資源・鉱物資源の各2指標と生態系4指標を含む", () => {
    expect(METRICS).toHaveLength(15);
    for (const metric of METRICS) expect(parseTargetForm(form({ metricId: metric.id }))).not.toHaveProperty("error");
    for (const category of ["biological_resources", "mineral_resources", "ecosystem"]) expect(METRICS.filter((metric) => metric.category === category)).toHaveLength(category === "ecosystem" ? 4 : 2);
  });
});

describe("更新履歴・競合・統合管理", () => {
  it("古い画面の更新と同一範囲の二重登録を拒否し、別資源・別年度は併存できる", () => {
    const state = new Map<string, EnvironmentalTarget>();
    applyTargetUpdate(state, record, null);
    expect(() => applyTargetUpdate(state, { ...record, revision: "stale", current: 90 }, null)).toThrow("別の操作");
    expect(() => applyTargetUpdate(state, { ...record, id: "duplicate", boundary: " 国内の認証木材 " }, null)).toThrow("登録済み");
    applyTargetUpdate(state, { ...record, id: "next-year", reportingYear: 2028 }, null);
    applyTargetUpdate(state, { ...record, id: "other", boundary: "輸入木材" }, null);
    expect(state.get(record.id)?.current).toBe(70);
    expect(state.size).toBe(3);
  });
  it("登録→更新→保管→復帰を再現し、以前の根拠を残す", () => {
    const updated = { ...record, revision: "v2", current: 85, evidence: "追加分を反映した2027年購買台帳" };
    const archived = { ...updated, revision: "v3", archived: true };
    const restored = { ...archived, revision: "v4", archived: false };
    const events = [event(record, null), event(updated, "v1"), event(archived, "v2"), event(restored, "v3")];
    expect(projectInteractionState(events).environmentalTargets.get(record.id)).toEqual(restored);
    expect(events[0].payload.record).toEqual(record);
    expect(evaluateTarget(projectInteractionState(events.slice(0, 2)).environmentalTargets.get(record.id)!)).toBe("met");
  });
  it("保管中に同範囲の新対象ができた場合は重複する復帰を拒否する", () => {
    const archived = { ...record, archived: true };
    const state = new Map([[record.id, archived], ["new", { ...record, id: "new" }]]);
    expect(() => applyTargetUpdate(state, { ...record, revision: "v2" }, "v1")).toThrow("登録済み");
    expect(state.get(record.id)?.archived).toBe(true);
  });
  it("新領域を保存結果と一覧へ含め、金融計算の値は変更しない", () => {
    const initial = runDemoPipeline({ rngSeed: 42, userSites: [], interactions: projectInteractionState([]) });
    const targets = [record, { ...record, id: "mineral", metricId: "virgin_mineral_input", current: null }, { ...record, id: "ecosystem", metricId: "habitat_area", archived: true }];
    const interactions = projectInteractionState(targets.map((value) => event(value, null)));
    const result = runDemoPipeline({ rngSeed: 42, userSites: [], interactions });
    expect(result.environmentalTargets).toEqual(targets);
    expect(result.valuation).toEqual(initial.valuation);
    expect(result.decisions).toEqual(initial.decisions);
    const rows = buildPortfolioRows(result, "2027-10-01");
    const filter = { site: "", category: "", state: "", query: "", year: "" };
    expect(filterPortfolio(rows, { ...filter, state: "overdue" }).map((row) => row.id)).toEqual([record.id, "mineral"]);
    expect(filterPortfolio(rows, { ...filter, state: "archived" }).map((row) => row.id)).toEqual(["ecosystem"]);
    expect(filterPortfolio(rows, { ...filter, category: "biological_resources", year: "2027", query: "購買部" })).toHaveLength(1);
    expect(filterPortfolio(rows, { ...filter, category: "ecosystem" })).toHaveLength(0);
    const csv = portfolioCsv(filterPortfolio(rows, { ...filter, category: "biological_resources" }));
    expect(csv).toContain('"以上"');
    expect(csv).toContain(record.evidence);
    expect(csv).toContain(record.actionPlan);
    expect(csv).not.toContain('"ecosystem"');
    const malicious = { ...rows[0], owner: '=HYPERLINK("example")' };
    expect(portfolioCsv([malicious])).toContain("'=HYPERLINK");
  });
});
