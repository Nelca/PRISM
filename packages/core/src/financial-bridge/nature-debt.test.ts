import { describe, expect, it } from "vitest";
import { computeNatureDebt } from "./nature-debt";
import { exchangeAmount } from "../types/common";
import type { InternalizationProbability } from "../types/financial-bridge";

describe("computeNatureDebt", () => {
  it("単一シナリオ・単年の場合、未内部化コスト×確率×割引係数になる", () => {
    const probabilities: InternalizationProbability[] = [{ scenario: "ngfs_net_zero_2050", probability: 0.5, period: 0 }];
    const result = computeNatureDebt(exchangeAmount(1_000_000), probabilities, 0.05);

    // period=0のため割引係数は1
    expect(result.totalDebt).toBe(500_000);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].discountedAmount).toBe(500_000);
  });

  it("D-4.3のデフォルト(均等割り・各1/3)で3シナリオを合算する", () => {
    const probabilities: InternalizationProbability[] = [
      { scenario: "ngfs_net_zero_2050", probability: 1 / 3, period: 0 },
      { scenario: "ngfs_current_policies", probability: 1 / 3, period: 0 },
      { scenario: "gx_ets_official", probability: 1 / 3, period: 0 },
    ];
    const result = computeNatureDebt(exchangeAmount(900_000), probabilities, 0);

    expect(result.totalDebt).toBeCloseTo(900_000, 6); // 均等割りの合計は全額に一致する
    expect(result.breakdown).toHaveLength(3);
  });

  it("複数時期にまたがる場合、各期の割引係数を個別に適用して合算する", () => {
    const probabilities: InternalizationProbability[] = [
      { scenario: "ngfs_net_zero_2050", probability: 1, period: 0 },
      { scenario: "ngfs_net_zero_2050", probability: 1, period: 1 },
    ];
    const result = computeNatureDebt(exchangeAmount(1_000_000), probabilities, 0.1);

    const expected = 1_000_000 * 1 * 1 + 1_000_000 * 1 * (1 / 1.1);
    expect(result.totalDebt).toBeCloseTo(expected, 6);
  });

  it("非GAAPラベルを付与する", () => {
    const result = computeNatureDebt(exchangeAmount(0), [], 0.05);
    expect(result.nonGaapLabel).toEqual({ label: "非GAAP指標", appliesTo: ["totalDebt"] });
    expect(result.totalDebt).toBe(0);
  });
});
