import { describe, expect, it } from "vitest";
import { parseOptionalNumber, parseRequiredNumber } from "./number";

describe("FormData数値パーサー", () => {
  it("有限な数値だけを受け付ける", () => {
    expect(parseRequiredNumber("12.5", { label: "値" })).toEqual({ value: 12.5 });
    expect(parseRequiredNumber("Infinity", { label: "値" })).toEqual({ error: "値は有限の数値で入力してください。" });
  });

  it("整数と範囲を検証する", () => {
    expect(parseRequiredNumber("1.5", { label: "期間", integer: true, min: 1 })).toEqual({ error: "期間は整数で入力してください。" });
    expect(parseRequiredNumber("0", { label: "期間", integer: true, min: 1 })).toEqual({ error: "期間は1以上で入力してください。" });
  });

  it("任意入力は空欄だけをnullとし、不正値を握りつぶさない", () => {
    expect(parseOptionalNumber("", { label: "閾値" })).toEqual({ value: null });
    expect(parseOptionalNumber("invalid", { label: "閾値" })).toHaveProperty("error");
  });
});
