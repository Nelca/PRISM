import { describe, expect, it } from "vitest";
import { computePercentileRanks } from "./percentile-rank";

describe("computePercentileRanks", () => {
  it("要件定義書§2.2の感応度列(タイなし)を厳密に再現する", () => {
    // A=4, B=2, C=5, D=1 → D=0.25, B=0.5, A=0.75, C=1.00
    const ranks = computePercentileRanks([4, 2, 5, 1]);
    expect(ranks).toEqual([0.75, 0.5, 1.0, 0.25]);
  });

  it("要件定義書§2.2の財務エクスポージャ列(タイなし)を厳密に再現する", () => {
    // A=8000万, B=5000万, C=1200万, D=200万 → A=1.00, B=0.75, C=0.50, D=0.25
    const ranks = computePercentileRanks([8000, 5000, 1200, 200]);
    expect(ranks).toEqual([1.0, 0.75, 0.5, 0.25]);
  });

  it("要件定義書§2.2の不確実性列(タイなし)を厳密に再現する", () => {
    // A=0.5, B=1.8, C=0.3, D=2.5 → A=0.50, B=0.75, C=0.25, D=1.00
    const ranks = computePercentileRanks([0.5, 1.8, 0.3, 2.5]);
    expect(ranks).toEqual([0.5, 0.75, 0.25, 1.0]);
  });

  it("タイがある場合、平均順位を割り当てる(標準的な定義)", () => {
    // A=3, B=2, C=3, D=1 → D=1位, B=2位, A・C=3位・4位タイ→平均3.5位
    // D=0.25, B=0.5, A=C=0.875
    const ranks = computePercentileRanks([3, 2, 3, 1]);
    expect(ranks).toEqual([0.875, 0.5, 0.875, 0.25]);
  });

  it("全て同値の場合、平均順位((1+2+3)/3=2位)を全員に割り当てる", () => {
    const ranks = computePercentileRanks([5, 5, 5]);
    expect(ranks).toEqual([2 / 3, 2 / 3, 2 / 3]);
  });

  it("空配列の場合は空配列を返す", () => {
    expect(computePercentileRanks([])).toEqual([]);
  });

  it("要素が1件の場合は1.0になる", () => {
    expect(computePercentileRanks([42])).toEqual([1.0]);
  });
});
