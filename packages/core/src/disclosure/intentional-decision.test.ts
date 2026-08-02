import { describe, expect, it } from "vitest";
import { buildIntentionalDecisionRecord } from "./intentional-decision";

describe("buildIntentionalDecisionRecord", () => {
  it("理由付きで正しく組み立てる", () => {
    const record = buildIntentionalDecisionRecord(
      "finding-1",
      "軽微なギャップであり、次回開示までに是正する予定のため現時点では意図的に許容する",
      "sustainability-team",
      "2026-08-02T00:00:00Z"
    );
    expect(record.gapFindingId).toBe("finding-1");
    expect(record.reason).toContain("是正する予定");
  });

  it("理由が空文字列の場合はエラーを投げる(D-4)", () => {
    expect(() =>
      buildIntentionalDecisionRecord("finding-1", "", "sustainability-team", "2026-08-02T00:00:00Z")
    ).toThrow();
  });

  it("理由が空白のみの場合もエラーを投げる", () => {
    expect(() =>
      buildIntentionalDecisionRecord("finding-1", "   ", "sustainability-team", "2026-08-02T00:00:00Z")
    ).toThrow();
  });
});
