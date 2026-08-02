import { describe, expect, it } from "vitest";
import { periodsEqual } from "./evidence-match";

describe("periodsEqual", () => {
  it("両方nullなら等価", () => {
    expect(periodsEqual(null, null)).toBe(true);
  });

  it("片方だけnullなら不等価", () => {
    expect(periodsEqual(null, { startYear: 2026, endYear: 2030 })).toBe(false);
    expect(periodsEqual({ startYear: 2026, endYear: 2030 }, null)).toBe(false);
  });

  it("startYear・endYearが両方一致すれば等価", () => {
    expect(periodsEqual({ startYear: 2026, endYear: 2030 }, { startYear: 2026, endYear: 2030 })).toBe(true);
  });

  it("startYearまたはendYearが異なれば不等価", () => {
    expect(periodsEqual({ startYear: 2026, endYear: 2030 }, { startYear: 2025, endYear: 2030 })).toBe(false);
    expect(periodsEqual({ startYear: 2026, endYear: 2030 }, { startYear: 2026, endYear: 2031 })).toBe(false);
  });
});
