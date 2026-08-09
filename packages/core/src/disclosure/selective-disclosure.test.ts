/**
 * M7 G6:選択的開示の検出。
 * build-plan §5.5「M2の除外理由記録はG6を可能にする唯一の情報源」の回収。
 */

import { describe, expect, it } from "vitest";
import { detectSelectiveDisclosure } from "./selective-disclosure";
import type { ExclusionRecord } from "./selective-disclosure";
import { buildGapFinding, determineGapType } from "./gap-finding";
import type { EvidenceCandidate } from "./evidence-match";
import type { DisclosureClaim } from "../types/disclosure";

const exclusions: ExclusionRecord[] = [
  {
    siteId: "site-099",
    category: "water",
    scope: "海外サプライヤー(繊維)",
    kind: "not_assessed",
    reason: "座標・住所ともに解決できませんでした",
  },
  {
    siteId: "site-077",
    category: "water",
    scope: "金属加工工場",
    kind: "not_deep_dived",
    reason: "優先度が深掘りの閾値に達しなかったため",
  },
  {
    siteId: "site-042",
    category: "climate",
    scope: "本社工場",
    kind: "criteria_unevaluated",
    reason: "1件の基準を評価できていません(license_pending)",
  },
];

function claim(overrides: Partial<DisclosureClaim["extractedMetadata"]> = {}): DisclosureClaim {
  return {
    id: "claim-1",
    sourceDocument: "統合報告書2027",
    sourcePageOrSection: "p.42",
    rawText: "当社は全拠点で水使用量を20%削減します。",
    claimType: "future_commitment",
    extractedMetadata: {
      category: "water",
      quantityMentioned: { value: 20, unit: "%" },
      periodMentioned: { startYear: 2027, endYear: 2030 },
      scopeMentioned: null,
      ...overrides,
    },
    extractionConfidence: "high",
  };
}

const strongCandidate: EvidenceCandidate = {
  recordId: "vr-1",
  category: "water",
  period: { startYear: 2027, endYear: 2030 },
  scope: "本社工場",
  transferFitnessTier: "A",
};

describe("detectSelectiveDisclosure", () => {
  it("カテゴリが一致する未評価対象を拾う", () => {
    const result = detectSelectiveDisclosure("water", null, exclusions);

    expect(result.undisclosedExclusions).toHaveLength(2); // waterの2件のみ(climateは対象外)
    expect(result.undisclosedExclusions.map((e) => e.siteId).sort()).toEqual(["site-077", "site-099"]);
  });

  it("開示が範囲を特定している場合、その範囲の外は拾わない", () => {
    const result = detectSelectiveDisclosure("water", "金属加工工場", exclusions);

    expect(result.undisclosedExclusions).toHaveLength(1);
    expect(result.undisclosedExclusions[0].siteId).toBe("site-077");
  });

  it("カテゴリも範囲も特定されていない開示は、すべての未評価対象が範囲に入る", () => {
    expect(detectSelectiveDisclosure(null, null, exclusions).undisclosedExclusions).toHaveLength(3);
  });

  it("未評価対象がなければ何も返さない", () => {
    expect(detectSelectiveDisclosure("water", null, []).undisclosedExclusions).toEqual([]);
  });

  it("除外の種類と理由をそのまま保持する(「評価していない」理由を区別したまま渡す)", () => {
    const [first] = detectSelectiveDisclosure("water", "海外サプライヤー(繊維)", exclusions).undisclosedExclusions;

    expect(first.kind).toBe("not_assessed");
    expect(first.reason).toContain("座標・住所");
  });
});

describe("G6の判定順序(M7 D-3の優先順位を延長する)", () => {
  it("根拠が充足していても、範囲内に未評価対象があればG6になる", () => {
    const result = determineGapType(claim(), [strongCandidate], exclusions);

    expect(result.gapType).toBe("G6_selective_disclosure");
    expect(result.undisclosedExclusions).toHaveLength(2);
    // 根拠自体は見つかっている(G1ではない)
    expect(result.matchedRecordIds).toEqual(["vr-1"]);
  });

  it("根拠が存在しない場合はG1が優先される(より根本的な問題を先に出す)", () => {
    const result = determineGapType(claim({ category: "pollution" }), [strongCandidate], exclusions);

    expect(result.gapType).toBe("G1_no_evidence");
  });

  it("G1〜G4が立っていても、未評価対象があれば事実としては出力に残す", () => {
    // 開示は水について語っているが、根拠として見つかるのは汚染のレコードだけ → G1。
    // 一方、水の未評価対象は開示の範囲内にあるので、事実としては残す必要がある。
    const pollutionOnly: EvidenceCandidate = { ...strongCandidate, category: "pollution" };
    const finding = buildGapFinding("gf-1", claim(), [pollutionOnly], exclusions);

    expect(finding.gapType).toBe("G1_no_evidence");
    // gapTypeとしては採用しないが、未開示の除外は捨てない
    expect(finding.undisclosedExclusions).toHaveLength(2);
  });

  it("未評価対象がなければ従来どおり根拠充足(gapType=null)になる", () => {
    const finding = buildGapFinding("gf-2", claim(), [strongCandidate], []);

    expect(finding.gapType).toBeNull();
    expect(finding.undisclosedExclusions).toBeUndefined();
  });

  it("exclusionsを渡さない既存の呼び出しはG6を判定しない(後方互換)", () => {
    expect(buildGapFinding("gf-3", claim(), [strongCandidate]).gapType).toBeNull();
  });

  it("G6にも推奨アクション3種が提示される(①弱める ②根拠を取る ③意図的判断として記録)", () => {
    const finding = buildGapFinding("gf-4", claim(), [strongCandidate], exclusions);

    expect(finding.recommendedActions.map((a) => a.kind)).toEqual([
      "weaken_claim",
      "acquire_additional_evidence",
      "record_as_intentional_decision",
    ]);
  });
});
