import { describe, expect, it } from "vitest";
import { computeInternalizationStatus } from "./internalization-status";
import { exchangeAmount } from "../types/common";

describe("computeInternalizationStatus", () => {
  it("内部化率・未内部化コストを正しく算出する", () => {
    const result = computeInternalizationStatus(exchangeAmount(1_000_000), exchangeAmount(300_000));
    expect(result.internalizationRate).toBeCloseTo(0.3, 9);
    expect(result.uninternalizedCost).toBe(700_000);
  });

  it("totalExternalCostが0の場合、内部化率は0として扱う(0除算を避ける)", () => {
    const result = computeInternalizationStatus(exchangeAmount(0), exchangeAmount(0));
    expect(result.internalizationRate).toBe(0);
    expect(result.uninternalizedCost).toBe(0);
  });

  it("内部化済み額が総額を超える異常入力も、推定で補正せずそのまま計算結果に反映する", () => {
    const result = computeInternalizationStatus(exchangeAmount(1000), exchangeAmount(1200));
    expect(result.internalizationRate).toBeCloseTo(1.2, 9);
    expect(result.uninternalizedCost).toBe(-200);
  });
});
