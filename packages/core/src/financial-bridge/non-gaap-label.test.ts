import { describe, expect, it } from "vitest";
import { buildNonGaapLabel } from "./non-gaap-label";

describe("buildNonGaapLabel", () => {
  it("固定ラベルと適用対象フィールド名を保持する", () => {
    const label = buildNonGaapLabel(["natureAdjustedOperatingProfit"]);
    expect(label).toEqual({ label: "非GAAP指標", appliesTo: ["natureAdjustedOperatingProfit"] });
  });
});
