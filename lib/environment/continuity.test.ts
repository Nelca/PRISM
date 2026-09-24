import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { describe, expect, it } from "vitest";
import { editableTargetCsv, parseTargetCsv, planTargetImport } from "./csv";
import { carryForwardValues } from "./carry-forward";
import { claimFingerprint, decisionFingerprint, resourceInvestmentComparison, physicalDisclosureBundle, resourceCostComparison, targetFingerprint, targetReviewNeeds, type ResourceCostCase } from "./review";
import type { EnvironmentalTarget } from "./metrics";
const record: EnvironmentalTarget = {
  id: "one", revision: "v1", siteId: "site-042", metricId: "biological_procurement", reportingYear: 2026,
  boundary: '国産木材,"調達"', current: 100, target: 80, baseline: 110, direction: "at_most", measuredOn: "2026-09-20",
  evidence: "2026年度購買台帳\n総重量100トン", targetBasis: "2026年度の社内削減目標80トン", owner: "=formula()", dueDate: "2026-12-01",
  actionPlan: "'先頭の引用符を残す", archived: false, updatedAt: "2026-09-21T00:00:00Z",
};
const scenario: ResourceCostCase = { name: "歩留まり改善", baselineUnitCost: 10000, alternativeUnitCost: 11000, alternativeQuantity: 80, additionalAnnualCost: 20000, initialInvestment: 300000, evidence: "仕入先見積と設備見積の検証値", sourceFingerprint: targetFingerprint(record), confirmedAt: record.updatedAt };
const sites = new Set([record.siteId]);
let sequence = 0;
const id = () => `id-${++sequence}`;

describe("環境指標CSV", () => {
  it("改行・引用符・数式として解釈される文字列を可逆に出力・入力する", () => {
    const csv = editableTargetCsv([record]);
    expect(csv).toContain("'=formula");
    const parsed = parseTargetCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ targetId: "one", expectedRevision: "v1", value: { boundary: record.boundary, evidence: record.evidence, owner: record.owner, actionPlan: record.actionPlan } });
  });
  it("更新と新規を混在でき、以前のレビューと引継ぎ元を履歴用に保持する", () => {
    const current = { ...record, costCase: scenario, carriedFrom: { id: "prior", revision: "old", year: 2025 } };
    const csv = editableTargetCsv([{ ...record, current: 90 }, { ...record, id: "", revision: "", boundary: "輸入木材" }]);
    const plan = planTargetImport(parseTargetCsv(csv).rows, new Map([[record.id, current]]), sites, id, record.updatedAt);
    expect(plan).toHaveLength(2);
    expect(plan[0].record.costCase).toEqual(scenario);
    expect(plan[0].record.carriedFrom).toEqual(current.carriedFrom);
    expect(plan[0].record.current).toBe(90);
    expect(plan[1].expectedRevision).toBeNull();
    expect(current.current).toBe(100);
  });
  it.each([
    (csv: string) => csv.replace('"単位"', '"違う列"'),
    (csv: string) => csv.replace('"t"', '"kg"'),
    (csv: string) => csv.replace('"以下"', '"自動"'),
    (csv: string) => csv.replace('"v1"', '""'),
    (csv: string) => csv + '\n"閉じない引用符',
  ])("不正な列・単位・条件・版・引用符を受け付けない", (mutate) => {
    expect(parseTargetCsv(mutate(editableTargetCsv([record]))).errors.length).toBeGreaterThan(0);
  });
  it("空CSV・上限件数・上限サイズを検証する", () => {
    expect(parseTargetCsv(editableTargetCsv([])).errors).not.toEqual([]);
    expect(parseTargetCsv(editableTargetCsv(Array.from({ length: 201 }, () => record))).errors).not.toEqual([]);
    expect(parseTargetCsv("あ".repeat(400000)).errors).toEqual(["CSVは1MB以内にしてください。"]);
  });
  it.each([
    { ...record, siteId: "another-tenant-site" },
    { ...record, revision: "old" },
    { ...record, reportingYear: 2027 },
    { ...record, id: "unknown" },
  ])("拠点不明・古い版・同一性変更・管理ID不明を保存前に拒否する", (row) => {
    expect(() => planTargetImport(parseTargetCsv(editableTargetCsv([row])).rows, new Map([[record.id, record]]), sites, id, record.updatedAt)).toThrow();
  });
  it("重複更新・重複新規を拒否し、保管中の対象をCSVで復帰しない", () => {
    expect(() => planTargetImport(parseTargetCsv(editableTargetCsv([record, record])).rows, new Map([[record.id, record]]), sites, id, record.updatedAt)).toThrow();
    const fresh = { ...record, id: "", revision: "" };
    expect(() => planTargetImport(parseTargetCsv(editableTargetCsv([fresh, fresh])).rows, new Map(), sites, id, record.updatedAt)).toThrow("登録済み");
    expect(() => planTargetImport(parseTargetCsv(editableTargetCsv([record])).rows, new Map([[record.id, { ...record, archived: true }]]), sites, id, record.updatedAt)).toThrow("保管中");
  });
});

describe("年度引継ぎと根拠の再確認", () => {
  it("翌年へ担当・範囲を引き継ぎ、当年実績・目標・費用前提・期限を勝手に補完しない", () => {
    const next = carryForwardValues({ ...record, costCase: scenario });
    expect(next).toMatchObject({ reportingYear: 2027, siteId: record.siteId, boundary: record.boundary, owner: record.owner, baseline: 100, current: null, target: null, targetBasis: "", dueDate: "", actionPlan: "" });
    expect(next.evidence).toContain("2026年の実測値");
    expect(next).not.toHaveProperty("costCase");
    expect(carryForwardValues({ ...record, current: 0 }).baseline).toBe(0);
    expect(carryForwardValues({ ...record, current: null })).toMatchObject({ baseline: null, evidence: "", measuredOn: "" });
  });
  it("年間費用と初期費用を分け、増額も正しい符号で示す", () => {
    expect(resourceCostComparison(record, scenario)).toEqual({ currentAnnualCost: 1000000, alternativeAnnualCost: 900000, annualSavings: 100000, firstYearSavings: -200000 });
    expect(resourceCostComparison(record, { ...scenario, alternativeUnitCost: 20000 })?.annualSavings).toBe(-620000);
    expect(resourceCostComparison({ ...record, current: 0 }, scenario)?.currentAnnualCost).toBe(0);
    expect(resourceCostComparison({ ...record, current: null }, scenario)).toBeNull();
    expect(resourceCostComparison({ ...record, metricId: "habitat_area" }, scenario)).toBeNull();
    expect(resourceCostComparison(record, { ...scenario, baselineUnitCost: Number.MAX_VALUE })).toBeNull();
  });
  it("確認済み文案のみを出力し、値・根拠が変わると再確認待ちに戻す", () => {
    const reviewed = { ...record, disclosureNote: { siteName: "本社工場", text: "確認済みの社内文案です。", reason: "期間・範囲・原本を確認", sourceFingerprint: targetFingerprint(record), confirmedAt: record.updatedAt } };
    const names = new Map([[record.siteId, "本社工場"]]);
    expect(targetReviewNeeds({ ...reviewed, costCase: scenario, current: 70 }, "本社工場")).toEqual(["費用前提", "開示文案"]);
    const bundle = physicalDisclosureBundle([reviewed], names);
    expect(bundle.count).toBe(1);
    expect(bundle.text).toContain(record.evidence);
    expect(bundle.text).toContain(record.revision);
    for (const patch of [{ current: 90 }, { target: 85 }, { evidence: "差し替えた原本資料" }, { boundary: "別の範囲" }]) {
      const stale = physicalDisclosureBundle([{ ...reviewed, ...patch }], names);
      expect(stale.count).toBe(0);
      expect(stale.pending).toHaveLength(1);
      expect(stale.text).not.toContain("確認済みの社内文案");
    }
    expect(physicalDisclosureBundle([reviewed], new Map([[record.siteId, "名称変更後"]])).count).toBe(0);
    expect(physicalDisclosureBundle([{ ...reviewed, owner: "新担当" }], names).count).toBe(1);
    expect(physicalDisclosureBundle([{ ...reviewed, archived: true }], names).count).toBe(0);
  });
});

describe("資源対策の複数年判定と既存レコード連携", () => {
  const investment = { horizon: 3, discountRatePercent: 0, approvalThreshold: 0, rationale: "投資委員会の基準と耐用期間" };
  it("初期費用を一度だけ控除し、年末割引・ゼロ割引・閾値一致を扱う", () => {
    const result = resourceInvestmentComparison(record, { ...scenario, investment });
    expect(result?.npv).toBe(0);
    expect(result?.meetsThreshold).toBe(true);
    const discounted = resourceInvestmentComparison(record, { ...scenario, investment: { ...investment, discountRatePercent: 10 } });
    expect(discounted?.npv).toBeCloseTo(-300000 + 100000 / 1.1 + 100000 / 1.1 ** 2 + 100000 / 1.1 ** 3);
    expect(discounted?.meetsThreshold).toBe(false);
    expect(discounted?.cashflows).toHaveLength(3);
  });
  it("不正期間・古い実測・保管・負の削減額を扱う", () => {
    expect(resourceInvestmentComparison(record, { ...scenario, investment: { ...investment, horizon: 1.5 } })).toBeNull();
    expect(resourceInvestmentComparison({ ...record, current: 110 }, { ...scenario, investment })).toBeNull();
    expect(resourceInvestmentComparison({ ...record, archived: true }, { ...scenario, investment })).toBeNull();
    expect(resourceInvestmentComparison(record, { ...scenario, alternativeQuantity: 200, investment })?.npv).toBeLessThan(0);
  });
  it("主張が変更・削除されたら、確認済み文案も出力を止める", () => {
    const claim = runDemoPipeline().disclosureClaims[0];
    const linked = { ...record, disclosureNote: { text: "確認した指標の文案", reason: "主張の期間範囲との対応を確認", siteName: "本社工場", confirmedAt: record.updatedAt, sourceFingerprint: targetFingerprint(record), linkedClaim: { id: claim.id, fingerprint: claimFingerprint(claim), sourceDocument: claim.sourceDocument, sourcePageOrSection: claim.sourcePageOrSection } } };
    const names = new Map([[record.siteId, "本社工場"]]);
    expect(claimFingerprint(Object.fromEntries(Object.entries(claim).reverse()) as typeof claim)).toBe(claimFingerprint(claim));
    expect(physicalDisclosureBundle([linked], names, [claim]).count).toBe(1);
    expect(physicalDisclosureBundle([linked], names, [{ ...claim, rawText: "更新した主張" }]).count).toBe(0);
    expect(physicalDisclosureBundle([linked], names, []).count).toBe(0);
    expect(targetReviewNeeds(linked, "本社工場", []).includes("既存主張との対応")).toBe(true);
  });
  it("関連案件の前提が変わったら対策との対応も再確認する", () => {
    const decision = runDemoPipeline().decisions[0].decision.decisionRecord;
    const linked = { ...scenario, investment: { ...investment, linkedDecision: { id: decision.id, fingerprint: decisionFingerprint(decision) } } };
    expect(resourceInvestmentComparison(record, linked, [decision])?.npv).toBe(0);
    expect(resourceInvestmentComparison(record, linked, [])).toBeNull();
    expect(resourceInvestmentComparison(record, linked, [{ ...decision, decisionTarget: decision.decisionTarget === "investment_approval" ? "procurement_renewal" : "investment_approval" }])).toBeNull();
  });
});
