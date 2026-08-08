/**
 * M7統合テスト(実装計画フェーズ4)。
 * 要件定義書§1の具体例(水消費20%削減の将来約束、3拠点中1拠点のみ根拠→G3)を再現し、
 * G1・G2はM3の実際のValuationRecord(monetization/)を使って再現する。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import { ALL_PLUGINS } from "../monetization/registry";
import { buildGapFinding } from "./gap-finding";
import type { EvidenceCandidate } from "./evidence-match";
import type { DisclosureClaim } from "../types/disclosure";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import { TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";

const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "test",
  pppValue: 1.0,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  deflator: 1.0,
  relativePriceEscalationRate: 1.0,
  elapsedYears: 0,
  areaScaling: 1.0,
};

const config: MethodConfig = {
  depth: "screening",
  unitReplacementCost: 500,
  externalValueFactors: {
    "lime3-water": 30_000,
    "ifvi-vfnutrition": 1.2,
    "ifvi-vfdisease": 0.95,
    "ifvi-vfes": 1.5,
    "ifvi-vfaccess": 0.3,
  },
};

function buildWaterRecords() {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000,
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };
  const groups = buildValuationRecords({
    physicalQuantityId: "pq-site042-water-2027",
    input,
    config,
    calibration,
    plugins: ALL_PLUGINS,
    versions: TEST_VALUATION_VERSIONS,
  });
  return groups.flatMap((g) => g.records);
}

describe("M7統合テスト:要件定義書§1の具体例(3拠点中1拠点のみ根拠→G3)", () => {
  it("主張の対象範囲(国内主要拠点)に対し、根拠が1拠点分しかない場合G3_scope_mismatchになる", () => {
    const claim: DisclosureClaim = {
      id: "claim-2024-report-p42-01",
      sourceDocument: "統合報告書2024",
      sourcePageOrSection: "p.42",
      rawText:
        "当社は2030年までに国内主要拠点における水使用量をScope1・2排出量とあわせて20%削減することを目指します。",
      claimType: "future_commitment",
      extractedMetadata: {
        category: "water",
        quantityMentioned: { value: 20, unit: "%" },
        periodMentioned: { startYear: 2026, endYear: 2030 },
        scopeMentioned: "国内主要拠点",
      },
      extractionConfidence: "high",
    };

    // 3拠点中、site-Aのみ「国内主要拠点」としてタグ付けされている(残り2拠点は個別サイトのまま)
    const candidates: EvidenceCandidate[] = [
      { recordId: "mi-site-A-water", category: "water", period: { startYear: 2026, endYear: 2030 }, scope: "国内主要拠点", transferFitnessTier: null },
      { recordId: "mi-site-B-water", category: "water", period: { startYear: 2026, endYear: 2030 }, scope: "site-B", transferFitnessTier: null },
      { recordId: "mi-site-C-water", category: "water", period: { startYear: 2026, endYear: 2030 }, scope: "site-C", transferFitnessTier: null },
    ];

    // site-Aだけを候補から除いた場合(=主張範囲に該当する根拠が皆無)を検証する前段として、
    // まず全件を渡した場合は根拠充足になることを確認
    const fullFinding = buildGapFinding("finding-full", claim, candidates);
    expect(fullFinding.gapType).toBeNull();

    // 要件定義書の具体例通り、「国内主要拠点」に該当する根拠が実際には存在しないケース
    const partialCandidates = candidates.filter((c) => c.scope !== "国内主要拠点");
    const finding = buildGapFinding("finding-1", claim, partialCandidates);

    expect(finding.gapType).toBe("G3_scope_mismatch");
    expect(finding.recommendedActions).toHaveLength(3);
  });

  it("該当カテゴリの候補が皆無の場合、M3の水カテゴリValuationRecordを使ってもG1になる(カテゴリ不一致)", () => {
    const claim: DisclosureClaim = {
      id: "claim-climate-01",
      sourceDocument: "統合報告書2024",
      sourcePageOrSection: "p.10",
      rawText: "当社はGHG排出量を削減します。",
      claimType: "future_commitment",
      extractedMetadata: {
        category: "climate",
        quantityMentioned: null,
        periodMentioned: null,
        scopeMentioned: null,
      },
      extractionConfidence: "high",
    };

    const records = buildWaterRecords();
    const candidates: EvidenceCandidate[] = records.map((r) => ({
      recordId: r.id,
      category: "water", // すべて水カテゴリの記録であり、climateの主張とは一致しない
      period: null,
      scope: null,
      transferFitnessTier: r.transferFitness.tier,
    }));

    const finding = buildGapFinding("finding-climate", claim, candidates);
    expect(finding.gapType).toBe("G1_no_evidence");
  });

  it("スクリーニング深度で強制ティアCになったVFesのみを根拠とする場合、G2_weak_evidenceになる", () => {
    const records = buildWaterRecords();
    const vfes = records.find((r) => r.methodId === "ifvi-water-consumption.VFes")!;
    expect(vfes.transferFitness.tier).toBe("C"); // M3 D-6:スクリーニングは無条件でティアC固定

    const claim: DisclosureClaim = {
      id: "claim-water-es-01",
      sourceDocument: "統合報告書2024",
      sourcePageOrSection: "p.50",
      rawText: "当社は水資源に関する生態系サービスへの影響を評価しています。",
      claimType: "state",
      extractedMetadata: { category: "water", quantityMentioned: null, periodMentioned: null, scopeMentioned: null },
      extractionConfidence: "high",
    };

    const candidates: EvidenceCandidate[] = [
      { recordId: vfes.id, category: "water", period: null, scope: null, transferFitnessTier: vfes.transferFitness.tier },
    ];

    const finding = buildGapFinding("finding-vfes", claim, candidates);
    expect(finding.gapType).toBe("G2_weak_evidence");
  });
});
