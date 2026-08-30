import { describe, expect, it } from "vitest";
import { coverageRows, coverageStatusLabel, inputDetail, isLime3SingleMethodPilot, mediumLabel } from "./category-expansion";

describe("追加カテゴリの価値算定表示", () => {
  it("移動量を環境放出量ではなく算定対象外として表示する", () => {
    expect(coverageStatusLabel("transferOnly")).toBe("移動量(算定対象外)");
    expect(mediumLabel("offsite_waste")).toBe("事業所外への移動");
  });

  it("0のカバレッジ状態は明細から省く", () => {
    expect(
      coverageRows({
        sourceKind: "public_prtr", reportingPeriod: "2024",
        quantities: [{
          unit: "kg", total: 3, calculated: 3, unmapped: 0, transferOnly: 0, blocked: 0,
          rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
        }],
        rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
      }).map(([status, , unit]) => `${status}:${unit}`)
    ).toEqual(["calculated:kg"]);
  });

  it("未報告行は量が0でもblocked行として表示する", () => {
    const rows = coverageRows({
      sourceKind: "public_prtr", reportingPeriod: "2024",
      quantities: [{
        unit: "kg", total: 0, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 0,
        rowCounts: { total: 1, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 1 },
      }],
      rowCounts: { total: 1, calculated: 0, unmapped: 0, transferOnly: 0, blocked: 1 },
    });
    expect(rows).toEqual([["blocked", 0, "kg", 1]]);
  });

  it("PRTR入力は物質・媒体・年度を一緒に示す", () => {
    expect(
      inputDetail({
        category: "pollution", physicalQuantity: 12, unit: "kg", siteId: "s", sourceRegion: "JP", targetRegion: "JP",
        reportingYear: 2024, prtrListVersion: "v1", facilityId: "f", prtrSubstanceCode: "101", casRns: [],
        releaseMedium: "air", sourceKind: "public_prtr", sourceRecordId: "r", sourceRecordHash: "h",
      })
    ).toContain("大気");
  });

  it("LIME3単独の算定結果だけを単一手法パイロットとして扱う", () => {
    expect(isLime3SingleMethodPilot([{ methodId: "lime3-pollution" } as never])).toBe(true);
    expect(isLime3SingleMethodPilot([{ methodId: "replacement-cost" } as never])).toBe(false);
  });
});
