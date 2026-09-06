/**
 * T-11:水の負例を新エンジン(V2)で完成させる。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §1.2・§6.5・T-11
 *
 * `lib/demo/company.ts` の DEEP_DIVE_* と同じ実値(係数は一次資料由来、物理量45,000 m³と
 * 代替調達単価620円/m³はデモ既定値)を packages/core だけで再現し、
 *   - 手法間4ペアの状態(停止1・加法2・乗法1)
 *   - 内訳分析1件(IFVI Eq.2)
 *   - 内訳間ペアが crossMethodPairs に無いこと
 *   - §6.5 のコーパス指標
 * を固定する。
 *
 * **旧エンジンの履歴値(手法間4・内訳間3の計7ペア、F-1が6件、乗法1件、非ゼロ寄与0件)は
 * `docs/roadmap/divergence-decomposition-work-log.md` §2 に残っている。旧件数へ合わせるために
 * 新エンジンを変えることはしない。**
 *
 * 期待値は実装出力からのコピーではなく、公表係数からの手計算で固定する。
 */
import { describe, expect, it } from "vitest";
import { buildDivergenceDecompositionV2 } from "../build-divergence-decomposition-v2";
import { createProductionRegistry } from "../recipes/registry";
import { buildDefaultBreakdownSpecs } from "../../monetization/breakdown-specs";
import { summarizeBaseline, WATER_CASE_VERSIONS, DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2 } from "./baseline-water-case";
import { buildWaterRecords, buildWaterSubject, WATER_PHYSICAL_QUANTITY_ID } from "./water-case-fixtures";

/** 独立検算(手計算)。 */
const LIME3_JPY = 45_000 * 0.0135886259 * 94.46; // 57,761.172113
const VFES_JPY = 45_000 * 2.97 * 94.46; // 12,624,579
const REPLACEMENT_COST_JPY = 45_000 * 620; // 27,900,000

const records = buildWaterRecords();
const subject = buildWaterSubject();
const decomposition = buildDivergenceDecompositionV2({
  id: "dd-baseline",
  targetPhysicalQuantityId: WATER_PHYSICAL_QUANTITY_ID,
  siteId: "site-042",
  subject,
  records,
  registry: createProductionRegistry(),
  versions: DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2,
  breakdownSpecs: buildDefaultBreakdownSpecs(records),
});
const summary = summarizeBaseline(decomposition, records);

function pair(methodIdA: string, methodIdB: string) {
  const found = summary.crossMethodPairs.find(
    (candidate) =>
      [candidate.methodIdA, candidate.methodIdB].includes(methodIdA) &&
      [candidate.methodIdA, candidate.methodIdB].includes(methodIdB)
  );
  if (!found) throw new Error(`${methodIdA} × ${methodIdB} のペアがありません`);
  return found;
}

describe("T-11 水の負例(新エンジン V2)", () => {
  it("診断サマリーを出力する(作業台帳・実証レポートへ転記する値)", () => {
    console.log(JSON.stringify(summary, null, 2));
    expect(summary.recordCount).toBe(6);
    expect(summary.zeroValueRecords.sort()).toEqual(
      [
        "ifvi-water-consumption.VFaccess",
        "ifvi-water-consumption.VFdisease",
        "ifvi-water-consumption.VFnutrition",
      ].sort()
    );
    expect(summary.versions).toBe(WATER_CASE_VERSIONS);
  });

  it("比較対象は取水・水源種別不明のまま(推定で埋めない)", () => {
    expect(summary.subject.waterSource).toBe("unknown");
    expect(summary.subject.waterUse).toBe("withdrawal");
    expect(summary.subject.provenance).toBe("demo_default");
    expect(summary.subject.identityRuleVersion).toBe("subject-identity-v1");
  });

  it("手法間ペアは4件。内訳間ペアは crossMethodPairs に入らない(§4-8)", () => {
    expect(summary.pairs.total).toBe(4);
    for (const candidate of summary.crossMethodPairs) {
      expect(candidate.methodIdA.split(".")[0]).not.toBe(candidate.methodIdB.split(".")[0]);
    }
    // IFVI 内訳どうし(VFnutrition×VFdisease 等)が現れないこと
    const ifviInternal = summary.crossMethodPairs.filter(
      (candidate) => candidate.methodIdA.startsWith("ifvi-") && candidate.methodIdB.startsWith("ifvi-")
    );
    expect(ifviInternal).toHaveLength(0);
    expect(summary.groups.every((group) => group.groupLimitExceeded === false)).toBe(true);
  });

  it("代替費用法 vs VFaccess は no_numerizable_factors で停止する", () => {
    const entry = pair("replacement-cost", "ifvi-water-consumption.VFaccess");
    expect(entry.status).toBe("stopped");
    expect(entry.stopReason).toBe("no_numerizable_factors");
    expect(entry.recipeId).toBe("replacement-cost-vs-vfaccess");
    expect(entry.absoluteDifference).toBe(0 - REPLACEMENT_COST_JPY);
    expect(entry.zeroMeaningA).toBe("published_zero");
    expect(entry.missingDataItems.some((item) => item.includes("損害時間列"))).toBe(true);
    expect(entry.qualitativeDifferenceCategories).toContain("time_model");
  });

  it("LIME3 vs VFnutrition / VFdisease は加法・寄与0・残差=金額差、published_zero を保持する", () => {
    for (const methodId of ["ifvi-water-consumption.VFnutrition", "ifvi-water-consumption.VFdisease"]) {
      const entry = pair("lime3-water", methodId);
      expect(entry.status).toBe("decomposed");
      expect(entry.mode).toBe("additive");
      expect(entry.decompositionKind).toBe("partial");
      expect(entry.valueA).toBe(0);
      expect(entry.valueB).toBeCloseTo(LIME3_JPY, 6);
      expect(entry.zeroMeaningA).toBe("published_zero");
      expect(entry.contributions).toHaveLength(1);
      expect(entry.contributions[0].factorId).toBe("geographic_calibration");
      expect(entry.contributions[0].shapley).toBe(0);
      expect(entry.contributions[0].isZero).toBe(true);
      expect(entry.residual!.value).toBeCloseTo(0 - LIME3_JPY, 6);
      expect(entry.residual!.unclassified).toBe(false);
    }
  });

  it("LIME3 vs VFes は乗法・部分分解。地理較正はゼロ寄与、残差 = ln 比、既知の数値化不能差が3件以上", () => {
    const entry = pair("lime3-water", "ifvi-water-consumption.VFes");
    expect(entry.status).toBe("decomposed");
    expect(entry.mode).toBe("multiplicative");
    expect(entry.decompositionKind).toBe("partial");
    expect(entry.valueA).toBeCloseTo(VFES_JPY, 6);
    expect(entry.valueB).toBeCloseTo(LIME3_JPY, 6);
    expect(entry.contributions[0].shapley).toBe(0);
    expect(entry.explainedSum).toBe(0);
    expect(entry.residual!.value).toBeCloseTo(Math.log(VFES_JPY / LIME3_JPY), 9);
    expect(entry.residual!.ratio).toBeCloseTo(1, 12);
    expect(entry.residual!.knownUnquantifiedCount).toBeGreaterThanOrEqual(3);
    expect(entry.residual!.unclassified).toBe(false);
    expect(entry.implication).toBe("additional_investigation");
  });

  it("要因別の非ゼロ寄与は0件のまま(実データをそのまま評価し、係数を選別していない)", () => {
    expect(summary.nonZeroContributionsByFactor).toEqual({});
    expect(summary.pairs.byMode).toEqual({ additive: 2, multiplicative: 1 });
    expect(summary.pairs.byStopReason).toEqual({ no_numerizable_factors: 1 });
    expect(summary.pairs.withZeroValue).toBe(3);
  });

  it("IFVI の内訳分析は1件。集計 = VFaccess + MAX(...) = 2.97 × 45,000 × 94.46 で価値概念を跨ぐ", () => {
    expect(summary.breakdownAnalyses).toHaveLength(1);
    const [analysis] = summary.breakdownAnalyses;
    expect(analysis.parentMethodId).toBe("ifvi-water-consumption");
    expect(analysis.aggregationFormula).toBe("VFaccess + MAX(VFnutrition, VFdisease, VFes)");
    expect(analysis.aggregate).not.toBeNull();
    expect(analysis.aggregate!.value).toBeCloseTo(VFES_JPY, 6);
    expect(analysis.aggregate!.mixesValueConcepts).toBe(true);
    // 厚生価値グループの内訳3本を並置する(VFaccess は交換価値グループ側)。
    expect(analysis.components.map((component) => component.subFactorId).sort()).toEqual([
      "VFdisease",
      "VFes",
      "VFnutrition",
    ]);
    expect(analysis.components.find((component) => component.subFactorId === "VFes")!.selectedByAggregation).toBe(true);
    expect(analysis.components.filter((component) => component.zeroMeaning === "published_zero")).toHaveLength(2);
  });

  it("§6.5 のコーパス指標:比較可能率・数値分解成立率・非ゼロ寄与件数・未分類残差率", () => {
    const { corpus } = summary;
    console.log(JSON.stringify(corpus, null, 2));
    expect(corpus.manifest.candidatePairCount).toBe(4);
    expect(corpus.countedEntries).toBe(4);
    expect(corpus.duplicatesDropped).toBe(0);
    // 4件すべてが同一対象・同一価値概念・符号意味・正規化条件を満たす(停止理由は反実仮想不能)。
    expect(corpus.comparablePairCount).toBe(4);
    expect(corpus.comparableRate).toBe(1);
    expect(corpus.decomposedCount).toBe(3);
    expect(corpus.decompositionRateOverall).toBeCloseTo(0.75, 12);
    expect(corpus.decompositionRateAmongComparable).toBeCloseTo(0.75, 12);
    // 要因別の非ゼロ寄与は0件。寄与合計が非ゼロの件数も0件(状態Bはこのケースでは通らない)。
    expect(corpus.nonZeroContributionCountsByFactor).toEqual({});
    expect(corpus.pairsWithNonZeroExplainedSum).toBe(0);
    // 非ゼロ残差3件はいずれも根拠付きの定性差異候補を持つため、未分類残差ケース率は0。
    expect(corpus.nonZeroResidualCount).toBe(3);
    expect(corpus.unclassifiedResidualCaseRate).toBe(0);
    expect(corpus.stopReasonCounts).toEqual({ no_numerizable_factors: 1 });
    expect(corpus.toleranceVersion).toBe("tol-v1");
  });
});
