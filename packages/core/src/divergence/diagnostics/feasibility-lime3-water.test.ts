/**
 * T-10a:早期成立性検証の実行と、独立検算との照合。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md T-10a
 *
 * `node --experimental-strip-types` 用の独立スクリプトではなく **vitest から実行する診断** にした。
 * リポジトリの TypeScript は `@core/*` などの tsconfig パスエイリアスを前提にしており、
 * strip-types 単体ではこれを解決できないため(vitest は同じ解決規則で動く)。
 * 出力 JSON はこのテストの console.log から `docs/data/divergence-feasibility-report.md` §5 へ転記する。
 */
import { describe, expect, it } from "vitest";
import { buildFeasibilityReport } from "./feasibility-lime3-water";

const report = buildFeasibilityReport();

function candidate(id: string) {
  const found = report.candidates.find((entry) => entry.id === id);
  if (!found) throw new Error(`候補 ${id} がありません`);
  return found;
}

describe("T-10a 早期成立性検証(水・実データ)", () => {
  it("転記用 JSON を出力する", () => {
    console.log(JSON.stringify(report, null, 2));
    expect(report.candidates).toHaveLength(5);
  });

  it("独立検算がすべて一致する(実装出力のコピーではない期待値)", () => {
    for (const entry of report.candidates) {
      for (const verification of entry.independentChecks) {
        expect(verification.matches, `${entry.id} / ${verification.label}`).toBe(true);
      }
    }
    // 検算が1件も無い候補が無いこと(検算なしで「成立」と言わない)。
    expect(report.candidates.every((entry) => entry.independentChecks.length > 0)).toBe(true);
  });

  it("候補ごとの結果区分が §7.4 の分類どおりになる", () => {
    expect(candidate("lime3-perspective-world-vs-japan").outcome).toBe("成立");
    expect(candidate("lime3-vs-ifvi-vfes").outcome).toBe("ゼロ寄与");
    expect(candidate("lime3-vs-ifvi-vfnutrition").outcome).toBe("ゼロ寄与");
    expect(candidate("replacement-cost-vs-ifvi-vfaccess").outcome).toBe("データ待ち");
    expect(candidate("lime3-surface-vs-ground").outcome).toBe("比較不能");
    expect(report.outcomeCounts).toEqual({ 成立: 1, ゼロ寄与: 2, 比較不能: 1, データ待ち: 1, 式不足: 0 });
  });

  it("成立した1件は同一手法の内部変種であり、状態Bの実証件数へ算入しない", () => {
    const entry = candidate("lime3-perspective-world-vs-japan");
    expect(entry.analysisUnit).toBe("intra_method_variant");
    expect(entry.countsTowardRealDataEvidence).toBe(false);
    expect(entry.decompositionKind).toBe("full");
    expect(entry.contributions[0].isZero).toBe(false);
    expect(entry.contributions[0].multiplier).toBeCloseTo(2.56623, 5);
    expect(entry.residual!.value).toBeCloseTo(0, 12);
  });

  it("手法間3件はいずれも非ゼロ寄与を出せていない(状態Bは未達)", () => {
    const crossMethod = report.candidates.filter((entry) => entry.analysisUnit === "cross_method");
    expect(crossMethod).toHaveLength(3);
    expect(crossMethod.every((entry) => entry.outcome !== "成立")).toBe(true);
  });

  it("出力に係数の生値を含めない(比・金額差・状態コードだけ)", () => {
    const serialized = JSON.stringify(report);
    for (const rawCoefficient of ["0.0135886259", "0.0348715398", "0.0900848111", "0.0351039504", "1.47160489e-6", "23696.265"]) {
      expect(serialized).not.toContain(rawCoefficient);
    }
  });
});
