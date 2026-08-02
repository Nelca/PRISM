import { describe, expect, it } from "vitest";
import { classifyPairPrecondition } from "./preconditions";

describe("classifyPairPrecondition", () => {
  it("符号が異なる場合はF-2(分解不能)", () => {
    const result = classifyPairPrecondition(100, -50);
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.fallback).toBe("F-2");
      expect(result.mode).toBe("not_decomposed");
    }
  });

  it("両方負(符号は一致)の場合はF-1(加法分解)", () => {
    const result = classifyPairPrecondition(-100, -50);
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.fallback).toBe("F-1");
      expect(result.mode).toBe("additive");
    }
  });

  it("一方がゼロの場合はF-1(F-2ではない)", () => {
    const result = classifyPairPrecondition(0, 50);
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.fallback).toBe("F-1");
    }
  });

  it("極端な桁差(6桁超)の場合はF-3(被覆外)", () => {
    const result = classifyPairPrecondition(1e-10, 100);
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.fallback).toBe("F-3");
      expect(result.mode).toBe("not_decomposed");
    }
  });

  it("乖離が5%未満の場合はF-8(有意な乖離なし)", () => {
    const result = classifyPairPrecondition(101, 100);
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.fallback).toBe("F-8");
    }
  });

  it("乖離がちょうど5%の境界を超える場合はproceed", () => {
    // ln(1.06) > ln(1.05) なので有意な乖離ありと判定される
    const result = classifyPairPrecondition(106, 100);
    expect(result.proceed).toBe(true);
  });

  it("通常の乖離(2.67倍)はproceed", () => {
    const result = classifyPairPrecondition(267, 100);
    expect(result.proceed).toBe(true);
  });
});
