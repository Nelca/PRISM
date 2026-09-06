import { describe, expect, it } from "vitest";
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { buildPublicPipelineResult } from "./public-result";

describe("buildPublicPipelineResult", () => {
  it("既存の公開結果を壊さない", () => {
    const source = runDemoPipeline();
    const result = buildPublicPipelineResult(source);
    expect(result.companyName).toBe(source.companyName);
    expect(Object.keys(result.valuation.valuationRecordsByMaterialIssue)).toEqual(
      Object.keys(source.valuation.valuationRecordsByMaterialIssue)
    );
  });

  it("顧客原本識別子・入力hash・LIME3原係数をAPI結果から除く", () => {
    const source = runDemoPipeline();
    const [issueId] = Object.keys(source.valuation.valuationRecordsByMaterialIssue);
    const [record, ...rest] = source.valuation.valuationRecordsByMaterialIssue[issueId];
    const privateQuantity = 1_234_567.89;
    const sensitiveRecord = {
      ...record,
      inputSnapshot: {
        category: "pollution" as const,
        physicalQuantity: privateQuantity,
        unit: "kg" as const,
        siteId: record.siteId,
        sourceRegion: "JP",
        targetRegion: "JP",
        reportingYear: 2025,
        prtrListVersion: "2025",
        facilityId: "private-facility",
        prtrSubstanceCode: "001",
        casRns: ["secret-cas"],
        releaseMedium: "air" as const,
        sourceKind: "customer_prtr" as const,
        sourceRecordId: "private-row",
        sourceRecordHash: "private-input-hash",
      },
      factorSnapshot: {
        factorId: "factor-1",
        methodId: "lime3-pollution",
        methodVersion: "3.0.0",
        sourceFlowId: "flow-1",
        sourceFlowName: "licensed-name",
        valuePerUnit: 987654321.123,
        denominatorUnit: "kg" as const,
        currency: "USD" as const,
        priceYear: null,
        geographicPerspective: "JP",
        sourceRegion: "JP",
        sourceHash: "factor-hash",
        licenseMode: "bring_your_own_license" as const,
      },
    };
    const augmented = {
      ...source,
      valuation: {
        ...source.valuation,
        valuationRecordsByMaterialIssue: {
          ...source.valuation.valuationRecordsByMaterialIssue,
          [issueId]: [sensitiveRecord, ...rest],
        },
        physicalQuantityByMaterialIssue: {
          ...source.valuation.physicalQuantityByMaterialIssue,
          [issueId]: { category: "pollution" as const, quantity: privateQuantity, unit: "kg" },
        },
        physicalQuantitiesByMaterialIssue: {
          ...source.valuation.physicalQuantitiesByMaterialIssue,
          [issueId]: [{ physicalQuantityId: "private-row", category: "pollution" as const, quantity: privateQuantity, unit: "kg" }],
        },
        coverageByMaterialIssue: {
          ...source.valuation.coverageByMaterialIssue,
          [issueId]: {
            sourceKind: "customer_prtr",
            reportingPeriod: "2025",
            quantities: [{
              unit: "kg", total: privateQuantity, calculated: privateQuantity, unmapped: 0, transferOnly: 0, blocked: 0,
              rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
            }],
            rowCounts: { total: 1, calculated: 1, unmapped: 0, transferOnly: 0, blocked: 0 },
          },
        },
      },
    };
    const serialized = JSON.stringify(buildPublicPipelineResult(augmented));
    expect(serialized).not.toContain("private-facility");
    expect(serialized).not.toContain("private-row");
    expect(serialized).not.toContain("private-input-hash");
    expect(serialized).not.toContain("licensed-name");
    expect(serialized).not.toContain("987654321.123");
    expect(serialized).not.toContain(String(privateQuantity));
    expect(serialized).not.toContain("private-row");
    expect(serialized).toContain("factor-1");
    expect(serialized).toContain('"quantitiesRedacted":true');
  });

  it("T-14:トレース内の係数リテラル値と反実仮想の差し替え値を再配布しない", () => {
    const source = runDemoPipeline();
    const serialized = JSON.stringify(buildPublicPipelineResult(source));

    // LIME3(AIST-IDEA、BYOL)・IFVI(要契約)の原係数は出力に現れない。
    for (const coefficient of ["0.0135886259", "5.73450112e-7", "2.97"]) {
      expect(serialized).not.toContain(coefficient);
    }

    // 監査に必要な情報(最終値・ハッシュ・入手状態・因果経路・設定キー・出典)は残る。
    expect(serialized).toContain('"valueRedacted":true');
    expect(serialized).toContain('"finalValue"');
    expect(serialized).toContain('"pathway"');
    expect(serialized).toContain('"settingKey"');
    expect(serialized).toContain("aist-idea-lime3-v4.0-lcia-coefficients.csv");
  });

  it("T-14:乖離分解は寄与・残差・到達値・停止理由を返し、差し替え前後の係数値だけを省く", () => {
    const source = runDemoPipeline();
    const result = buildPublicPipelineResult(source);
    const decompositions = result.valuation.divergenceDecompositions as unknown as {
      schemaVersion: number;
      groups: {
        crossMethodPairs: {
          status: string;
          vStar?: number;
          residual?: unknown;
          reason?: string;
          contributions?: { swapped: { from: Record<string, unknown> }[] }[];
        }[];
      }[];
    }[];
    expect(decompositions.length).toBeGreaterThan(0);
    expect(decompositions[0].schemaVersion).toBe(2);

    const pairs = decompositions.flatMap((decomposition) => decomposition.groups.flatMap((group) => group.crossMethodPairs));
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      if (pair.status === "decomposed") {
        expect(pair.vStar).toBeTypeOf("number");
        expect(pair.residual).toBeDefined();
        for (const contribution of pair.contributions ?? []) {
          for (const swapped of contribution.swapped) {
            expect(swapped.from).not.toHaveProperty("value");
            expect(swapped.from.valueRedacted).toBe(true);
          }
        }
      } else {
        expect(pair.reason).toBeTypeOf("string");
      }
    }
  });
});
