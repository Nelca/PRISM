import { describe, expect, it } from "vitest";
import { getDisclosureRequirement } from "./disclosure-requirement";

describe("getDisclosureRequirement", () => {
  it("気候は高(3)", () => {
    expect(getDisclosureRequirement("climate")).toBe(3);
  });

  it("水・汚染は中(2)", () => {
    expect(getDisclosureRequirement("water")).toBe(2);
    expect(getDisclosureRequirement("pollution")).toBe(2);
  });
});
