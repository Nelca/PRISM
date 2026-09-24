import { expect, it } from "vitest";
import { formatYen, formatCompactYenRange } from "./numeric";

it("共通単位でも非ゼロの金額を0.0と表示しない", () => {
  expect(formatYen(38_000, "million")).toBe("0.04百万円");
  expect(formatYen(100, "million")).toBe("0.0001百万円");
  expect(formatYen(-100, "million")).toBe("-0.0001百万円");
  expect(formatYen(0, "million")).toBe("0.0百万円");
  expect(formatCompactYenRange(100, 20_000_000)).toBe("0.0001百万円〜20.0百万円");
});
