import { describe, expect, it } from "vitest";
import { buildDisclosureClaimsFromExtraction } from "./claim-extraction";
import type { RawExtractedClaim } from "./claim-extraction";

describe("buildDisclosureClaimsFromExtraction", () => {
  it("AIの構造化出力をDisclosureClaim[]に変換し、IDを連番で割り付ける", () => {
    const raw: RawExtractedClaim[] = [
      {
        sourcePageOrSection: "p.18",
        rawText: "当社は2030年までに本社工場における水使用量を20%削減することを目指します。",
        claimType: "future_commitment",
        category: "water",
        quantityMentioned: { value: 20, unit: "%" },
        periodMentioned: { startYear: 2027, endYear: 2030 },
        scopeMentioned: "本社工場",
        extractionConfidence: "high",
      },
      {
        sourcePageOrSection: "p.22",
        rawText: "気候変動対応を推進しています。",
        claimType: "state",
        category: null,
        quantityMentioned: null,
        periodMentioned: null,
        scopeMentioned: null,
        extractionConfidence: "low",
      },
    ];

    const claims = buildDisclosureClaimsFromExtraction("統合報告書2027", "claim-2027-report", raw);

    expect(claims).toHaveLength(2);
    expect(claims[0].id).toBe("claim-2027-report-1");
    expect(claims[1].id).toBe("claim-2027-report-2");
    expect(claims[0].sourceDocument).toBe("統合報告書2027");
    expect(claims[0].extractedMetadata).toEqual({
      category: "water",
      quantityMentioned: { value: 20, unit: "%" },
      periodMentioned: { startYear: 2027, endYear: 2030 },
      scopeMentioned: "本社工場",
    });
  });

  it("読み取れないフィールドはnullのまま保持する(推測で埋めない)", () => {
    const raw: RawExtractedClaim[] = [
      {
        sourcePageOrSection: "p.5",
        rawText: "環境負荷の低減に努めています。",
        claimType: "state",
        category: null,
        quantityMentioned: null,
        periodMentioned: null,
        scopeMentioned: null,
        extractionConfidence: "low",
      },
    ];

    const [claim] = buildDisclosureClaimsFromExtraction("doc", "claim-doc", raw);

    expect(claim.extractedMetadata.category).toBeNull();
    expect(claim.extractedMetadata.quantityMentioned).toBeNull();
    expect(claim.extractedMetadata.periodMentioned).toBeNull();
    expect(claim.extractedMetadata.scopeMentioned).toBeNull();
    expect(claim.extractionConfidence).toBe("low");
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(buildDisclosureClaimsFromExtraction("doc", "claim-doc", [])).toEqual([]);
  });
});
