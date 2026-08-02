import { describe, expect, it } from "vitest";
import { shouldCountDecision } from "./decision-count";

describe("shouldCountDecision", () => {
  it("does_not_crossはカウント対象(結論の向きを問わない)", () => {
    expect(shouldCountDecision("does_not_cross")).toBe(true);
  });

  it("crossesはカウント対象", () => {
    expect(shouldCountDecision("crosses")).toBe(true);
  });

  it("pendingはカウント対象外", () => {
    expect(shouldCountDecision("pending")).toBe(false);
  });
});
