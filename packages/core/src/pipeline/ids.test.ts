import { describe, expect, it } from "vitest";
import { createIdSequence } from "./ids";

describe("createIdSequence", () => {
  it("呼び出すたびに連番が増えるIDを返す", () => {
    const next = createIdSequence("ae");
    expect(next()).toBe("ae-0");
    expect(next()).toBe("ae-1");
    expect(next()).toBe("ae-2");
  });

  it("異なるシーケンスは独立してカウントする", () => {
    const a = createIdSequence("a");
    const b = createIdSequence("b");
    expect(a()).toBe("a-0");
    expect(b()).toBe("b-0");
    expect(a()).toBe("a-1");
  });
});
