import { describe, expect, it } from "vitest";
import { isRapidIntegrityDecline, RAPID_DECLINE_THRESHOLD_FRACTION } from "./ecosystem-integrity-trend";

describe("isRapidIntegrityDecline", () => {
  it("閾値(30%)未満の低下ではfalse", () => {
    expect(isRapidIntegrityDecline({ startValue: 0.8, startYear: 2015, endValue: 0.6, endYear: 2023 })).toBe(false);
  });

  it("閾値(30%)ちょうどの低下ではtrue(以上)", () => {
    expect(
      isRapidIntegrityDecline({ startValue: 1.0, startYear: 2015, endValue: 1 - RAPID_DECLINE_THRESHOLD_FRACTION, endYear: 2023 })
    ).toBe(true);
  });

  it("閾値を超える低下ではtrue", () => {
    expect(isRapidIntegrityDecline({ startValue: 0.9, startYear: 2015, endValue: 0.3, endYear: 2023 })).toBe(true);
  });

  it("上昇(改善)した場合はfalse", () => {
    expect(isRapidIntegrityDecline({ startValue: 0.5, startYear: 2015, endValue: 0.7, endYear: 2023 })).toBe(false);
  });

  it("startValueが0以下の場合は低下率を定義できないためfalse", () => {
    expect(isRapidIntegrityDecline({ startValue: 0, startYear: 2015, endValue: 0, endYear: 2023 })).toBe(false);
  });
});
