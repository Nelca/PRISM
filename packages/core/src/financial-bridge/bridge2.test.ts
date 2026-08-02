import { describe, expect, it } from "vitest";
import { buildBridge2SocialCostView } from "./bridge2";
import { buildBridge1NatureAdjustedProfit } from "./bridge1";
import { exchangeAmount, sumExchangeAmounts, welfareAmount } from "../types/common";

describe("buildBridge2SocialCostView", () => {
  it("disclosureOnlyLabelとnonGaapLabelを常時付与する", () => {
    const bridge2 = buildBridge2SocialCostView(welfareAmount(300_000_000), 0.1);

    expect(bridge2.socialCost).toBe(300_000_000);
    expect(bridge2.disclosureOnlyLabel).toBe(true);
    expect(bridge2.nonGaapLabel).toEqual({ label: "非GAAP指標", appliesTo: ["socialCost"] });
  });

  it("ブリッジ1(交換価値)とブリッジ2(厚生価値)は、同じ合算関数に混在させるとコンパイルエラーになる(design-rationale-log D-24)", () => {
    const bridge1 = buildBridge1NatureAdjustedProfit(exchangeAmount(1000), exchangeAmount(100), exchangeAmount(50));
    const bridge2 = buildBridge2SocialCostView(welfareAmount(300), 0.1);

    // @ts-expect-error sumExchangeAmountsはExchangeAmount[]のみを受け付ける。
    // bridge2.socialCost(WelfareAmount)を混ぜるとコンパイルエラーになる。
    const invalidSum = sumExchangeAmounts([bridge1.natureAdjustedOperatingProfit, bridge2.socialCost]);
    expect(invalidSum).toBeDefined(); // 到達しない想定。型エラーで検出されることの確認が目的
  });
});
