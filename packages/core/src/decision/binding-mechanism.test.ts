import { describe, expect, it } from "vitest";
import { appendBindingMechanismChange, formatBindingMechanismOutput } from "./binding-mechanism";
import { exchangeAmount } from "../types/common";
import type { BindingMechanism } from "../types/decision";

const context = { verdict: "crosses" as const, natureAdjustedNpvCentral: exchangeAmount(600_000_000) };

describe("formatBindingMechanismOutput", () => {
  it("weak_reference: ★判定の結果のみを渡す", () => {
    const result = formatBindingMechanismOutput({ kind: "weak_reference" }, context);
    expect(result).toEqual({ kind: "weak_reference", verdictLabel: "またぐ(crosses)" });
  });

  it("npv_formula_replacement: 自然調整後NPVの値そのものを渡す", () => {
    const result = formatBindingMechanismOutput({ kind: "npv_formula_replacement" }, context);
    expect(result).toEqual({ kind: "npv_formula_replacement", natureAdjustedNpv: exchangeAmount(600_000_000) });
  });

  it("budget_allocation: 対象拠点IDと予算賦課額を渡す", () => {
    const mechanism: BindingMechanism = {
      kind: "budget_allocation",
      targetSiteId: "site-042",
      amount: exchangeAmount(10_000_000),
    };
    const result = formatBindingMechanismOutput(mechanism, context);
    expect(result).toEqual({ kind: "budget_allocation", targetSiteId: "site-042", amount: exchangeAmount(10_000_000) });
  });

  it("procurement_contract_clause: 契約条項の文言を渡す", () => {
    const mechanism: BindingMechanism = { kind: "procurement_contract_clause", clauseText: "更新条件XYZ" };
    const result = formatBindingMechanismOutput(mechanism, context);
    expect(result).toEqual({ kind: "procurement_contract_clause", clauseText: "更新条件XYZ" });
  });

  it("verdictがpendingの場合も未確定であることを明示する", () => {
    const result = formatBindingMechanismOutput(
      { kind: "weak_reference" },
      { verdict: "pending", natureAdjustedNpvCentral: exchangeAmount(0) }
    );
    expect(result).toEqual({ kind: "weak_reference", verdictLabel: "未確定(pending)" });
  });
});

describe("appendBindingMechanismChange", () => {
  it("理由付きで変更履歴に追記する", () => {
    const history = appendBindingMechanismChange([], {
      changedAt: "2026-08-02T00:00:00Z",
      previousMechanism: { kind: "weak_reference" },
      newMechanism: { kind: "npv_formula_replacement" },
      reason: "投資判断予算が確保されたため拘束方式を強化",
    });
    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe("投資判断予算が確保されたため拘束方式を強化");
  });

  it("理由が空文字列の場合はエラーを投げる(D-9)", () => {
    expect(() =>
      appendBindingMechanismChange([], {
        changedAt: "2026-08-02T00:00:00Z",
        previousMechanism: { kind: "weak_reference" },
        newMechanism: { kind: "npv_formula_replacement" },
        reason: "   ",
      })
    ).toThrow();
  });

  it("既存の履歴に追記する(元の配列は変更しない)", () => {
    const existing = [
      {
        changedAt: "2026-01-01T00:00:00Z",
        previousMechanism: { kind: "weak_reference" as const },
        newMechanism: { kind: "budget_allocation" as const, targetSiteId: "site-042", amount: exchangeAmount(1) },
        reason: "初回設定",
      },
    ];
    const updated = appendBindingMechanismChange(existing, {
      changedAt: "2026-08-02T00:00:00Z",
      previousMechanism: { kind: "budget_allocation", targetSiteId: "site-042", amount: exchangeAmount(1) },
      newMechanism: { kind: "npv_formula_replacement" },
      reason: "強化",
    });
    expect(existing).toHaveLength(1);
    expect(updated).toHaveLength(2);
  });
});
