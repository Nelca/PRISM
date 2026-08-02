import { describe, expect, it } from "vitest";
import { computeGatedSensitivityScore } from "./license-gated-sensitivity";
import type { CriteriaMet } from "../types/site";
import type { LicenseGate } from "../types/ledger";

const fullCriteria: CriteriaMet = {
  highEcosystemIntegrity: false,
  rapidIntegrityDecline: false,
  highBiodiversityImportance: true,
  waterStress: true,
  likelySignificantDependencyImpact: true,
};

describe("computeGatedSensitivityScore", () => {
  it("ゲートがない場合は通常通り全基準をカウントする", () => {
    const result = computeGatedSensitivityScore(fullCriteria, {});
    expect(result.score).toBe(3);
    expect(result.pendingCriteria).toEqual([]);
  });

  it("要件定義書D-4の具体例:WDPA pending時、highBiodiversityImportanceを除いた4基準で暫定算出する", () => {
    const gates: Partial<Record<keyof CriteriaMet, LicenseGate>> = {
      highBiodiversityImportance: { dataSourceId: "wdpa", licenseMode: "pending_review" },
    };

    const result = computeGatedSensitivityScore(fullCriteria, gates);

    // highBiodiversityImportance(true)は除外されるため、残り4基準中2件(waterStress・dependency)のみカウント
    expect(result.score).toBe(2);
    expect(result.pendingCriteria).toEqual(["highBiodiversityImportance"]);
  });

  it("ゲートが設定されていてもブロックされていなければ通常通りカウントする", () => {
    const gates: Partial<Record<keyof CriteriaMet, LicenseGate>> = {
      highBiodiversityImportance: { dataSourceId: "wdpa", licenseMode: "embedded" },
    };
    const result = computeGatedSensitivityScore(fullCriteria, gates);
    expect(result.score).toBe(3);
    expect(result.pendingCriteria).toEqual([]);
  });
});
