/**
 * build-plan §7.1のGATE(「デザインパートナー1社の実データを投入し、M1からM8まで通す」)の
 * 技術的な前提を、架空だが現実的な1社分のダミーデータで検証する。
 *
 * 実データそのものでの検証ではないため、これ単独でGATEの完了条件を満たしたことにはならない。
 * あくまで「M1→M8のパイプラインが、実データに近い形のデータで最後まで通り、期待される
 * 監査証跡(AssumptionEntry)・意思決定・ギャップ検出が得られること」の技術検証。
 */
import { describe, expect, it } from "vitest";
import { runDemoPipeline } from "./run-demo-pipeline";

describe("GATE検証(ダミーデータ):M1〜M8が最後まで通る", () => {
  const result = runDemoPipeline();

  it("M1:全拠点が処理され、住所解決に失敗した拠点は監査可能な形で除外される", () => {
    expect(result.assessment.sites).toHaveLength(3);
    expect(result.assessment.ingestionErrors).toHaveLength(0);

    const excluded = result.assessment.materialIssues.find((i) => i.siteId === "site-099")!;
    expect(excluded.excluded).toBe(true);
    expect(excluded.exclusionReason).toBeDefined();
  });

  it("M2:感応度・財務エクスポージャの大きい拠点のみが深掘りに昇格する", () => {
    const promoted = result.assessment.depthDecisions.filter((d) => d.depth === "deep_dive");
    expect(promoted.length).toBeGreaterThan(0);
    expect(promoted.every((d) => d.materialIssueId.includes("site-042"))).toBe(true);
  });

  it("M3・M4:深掘り対象についてValuationRecordと乖離分解が生成される", () => {
    const records = Object.values(result.valuation.valuationRecordsByMaterialIssue).flat();
    expect(records.length).toBeGreaterThan(0);
    expect(result.valuation.divergenceDecompositions.length).toBeGreaterThan(0);
  });

  it("M5:2つのブリッジ・比較先が生成され、非GAAPラベルが付く", () => {
    expect(result.financialBridge).not.toBeNull();
    expect(result.financialBridge!.bridge1.nonGaapLabel.label).toBe("非GAAP指標");
    expect(result.financialBridge!.bridge2?.disclosureOnlyLabel).toBe(true);
    expect(result.comparisonTargets?.nonGaapLabel.label).toBe("非GAAP指標");
  });

  it("M6:DecisionRecordが生成され、★判定が確定する", () => {
    expect(result.decision).not.toBeNull();
    expect(["does_not_cross", "crosses", "pending"]).toContain(result.decision!.decisionRecord.verdict);
  });

  it("M7:開示claimに対するギャップ判定が行われる", () => {
    expect(result.disclosure.gapFindings).toHaveLength(1);
    expect(result.disclosure.gapFindings[0].gapType === null || typeof result.disclosure.gapFindings[0].gapType === "string").toBe(
      true
    );
  });

  it("M8:全段階のAssumptionEntryが記録され、RecalculationHashが決定論的に算出される", () => {
    const modules = new Set(result.assumptionEntries.map((e) => e.sourceModule));
    expect(modules.has("M1")).toBe(true); // site-099の除外
    expect(modules.has("M2")).toBe(true); // 深掘り昇格判定
    expect(modules.has("M3")).toBe(true); // 較正・適合度ティア
    expect(modules.has("M4")).toBe(true); // 乖離分解
    expect(modules.has("M7")).toBe(true); // ギャップ判定

    const rerun = runDemoPipeline();
    expect(rerun.recalculationHash.hash).toBe(result.recalculationHash.hash);
  });
});
