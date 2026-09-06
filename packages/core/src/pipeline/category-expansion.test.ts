import { describe, expect, it, vi } from "vitest";
import { buildValuationRecords, LicenseGateError } from "../monetization/build-valuation-records";
import { runValuationPipeline } from "./valuation-pipeline";
import { TEST_DECOMPOSITION_VERSIONS_V2 } from "../divergence/test-helpers";
import type {
  FactorResolution,
  GeographicCalibrationRecord,
  MonetizationMethodPlugin,
  PollutionReleaseInput,
} from "../types/valuation";

const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "not_applicable:jpy",
  pppValue: 1,
  incomeElasticity: 0,
  sourceIncomeLevel: 1,
  targetIncomeLevel: 1,
  deflator: 1,
  relativePriceEscalationRate: 0,
  elapsedYears: 0,
  areaScaling: 1,
};

function pollutionInput(id: string, quantity: number): PollutionReleaseInput {
  return {
    category: "pollution",
    physicalQuantity: quantity,
    unit: "kg",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
    reportingYear: 2025,
    prtrListVersion: "2025",
    facilityId: "facility-1",
    prtrSubstanceCode: "001",
    casRns: ["50-00-0"],
    releaseMedium: "air",
    sourceKind: "customer_prtr",
    sourceRecordId: id,
    sourceRecordHash: `sha256:${id}`,
  };
}

function resolution(id: string, licenseMode: FactorResolution["factor"]["licenseMode"] = "embedded"): FactorResolution {
  return {
    mappingId: `mapping-${id}`,
    mappingVersion: "prtr-lime3-v1",
    mappingHash: "sha256:mapping-v1",
    factor: {
      factorId: `factor-${id}`,
      methodId: "lime3-pollution",
      methodVersion: "4.0",
      sourceFlowId: "flow-1",
      sourceFlowName: "ホルムアルデヒド, 大気",
      medium: "air",
      valuePerUnit: 12,
      denominatorUnit: "kg",
      currency: "JPY",
      priceYear: null,
      geographicPerspective: "日本・消費国",
      sourceRegion: "JP",
      sourceHash: "sha256:lime3-v4",
      licenseMode,
    },
  };
}

const plugin: MonetizationMethodPlugin = {
  methodId: "lime3-pollution",
  version: "4.0",
  licenseMode: "embedded",
  supportedCategories: ["pollution"],
  evaluate(input, config) {
    return [
      {
        subFactorId: "lime3-pollution",
        valueConcept: "welfare",
        aopCode: "unmapped",
        aopSourceLabel: "LIME3統合化",
        aopMappingConfidence: "unmapped",
        centralValue: input.physicalQuantity * config.factorResolution!.factor.valuePerUnit,
        parameterUncertainty: { kind: "not_available", reason: "係数原表に分布情報がない" },
        transferFitness: { tier: "not_applicable" },
        discountRate: null,
        discountRateStatus: "no_time_dimension",
        scopeExclusions: ["AoP別金額内訳は未取得"],
        skipGeographicCalibration: true,
      },
    ];
  },
};

const versions = {
  calibrationSetVersion: "jpy-identity-v1",
  fitnessTierThresholdVersion: "not-applicable-v1",
  aopMappingVersion: "aop-mapping-v1",
};

describe("追加カテゴリの共通算定契約", () => {
  it("不確実性未取得をnullレンジとして保持し、入力・係数・対応表をハッシュへ含める", () => {
    const build = (quantity: number) =>
      buildValuationRecords({
        physicalQuantityId: "pq-1",
        input: pollutionInput("row-1", quantity),
        config: { depth: "deep_dive", factorResolution: resolution("1") },
        calibration,
        plugins: [plugin],
        versions,
      })[0].records[0];

    const first = build(10);
    const second = build(11);
    expect(first.centralValue).toBe(120);
    expect(first.quantileRange).toBeNull();
    expect(first.parameterUncertainty.kind).toBe("not_available");
    expect(first.inputSnapshot).toEqual(pollutionInput("row-1", 10));
    expect(first.mappingSnapshot?.mappingVersion).toBe("prtr-lime3-v1");
    expect(first.factorSnapshot?.sourceHash).toBe("sha256:lime3-v4");
    expect(second.recalculationHash).not.toBe(first.recalculationHash);
  });

  it("同じMaterialIssueの複数物理量を個別計算し、単独LIME3ではM4を起動しない", () => {
    let nextId = 0;
    const result = runValuationPipeline({
      materialIssueIds: ["site-042-mi-pollution"],
      deepDiveConfigForMaterialIssue: () => ({
        quantities: [10, 20].map((quantity, index) => ({
          physicalQuantityId: `pq-${index + 1}`,
          input: pollutionInput(`row-${index + 1}`, quantity),
          config: { depth: "deep_dive", factorResolution: resolution(String(index + 1)) },
          calibration,
          plugins: [plugin],
          calibrationSetVersion: "jpy-identity-v1",
          reconciliationFunctionVersion: "none",
          fitnessTierThresholdVersion: "not-applicable-v1",
        })),
      }),
      decompositionVersions: TEST_DECOMPOSITION_VERSIONS_V2,
      idSequence: () => `ae-${++nextId}`,
      now: "2026-08-28T00:00:00Z",
    });

    expect(result.valuationRecordsByMaterialIssue["site-042-mi-pollution"]).toHaveLength(2);
    expect(result.divergenceDecompositions).toHaveLength(0);
    expect(result.assumptionEntries.filter((entry) => entry.payload.kind === "input_mapping")).toHaveLength(2);
  });

  it("pending_reviewはプラグイン評価前に停止する", () => {
    const evaluate = vi.fn(plugin.evaluate);
    expect(() =>
      buildValuationRecords({
        physicalQuantityId: "pq-1",
        input: pollutionInput("row-1", 10),
        config: { depth: "deep_dive", factorResolution: resolution("1", "pending_review") },
        calibration,
        plugins: [{ ...plugin, evaluate }],
        versions,
      })
    ).toThrow(LicenseGateError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("日付形式のライセンス期限は日本時間の当日末まで有効にする", () => {
    vi.useFakeTimers();
    try {
      const factorResolution = resolution("1", "bring_your_own_license");
      factorResolution.factor.licenseValidUntil = "2027-06-30";
      const build = () => buildValuationRecords({
        physicalQuantityId: "pq-1",
        input: pollutionInput("row-1", 10),
        config: { depth: "deep_dive", factorResolution },
        calibration,
        plugins: [plugin],
        versions,
      });
      vi.setSystemTime(new Date("2027-06-30T12:00:00+09:00"));
      expect(build).not.toThrow();
      vi.setSystemTime(new Date("2027-07-01T00:00:00+09:00"));
      expect(build).toThrow(LicenseGateError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("USD→JPY換算を地理較正と分離し、換算根拠をレコードへ残す", () => {
    const usdResolution = resolution("1");
    usdResolution.factor.currency = "USD";
    const base = {
      physicalQuantityId: "pq-1",
      input: pollutionInput("row-1", 10),
      calibration,
      plugins: [plugin],
      versions,
    };
    expect(() =>
      buildValuationRecords({ ...base, config: { depth: "deep_dive", factorResolution: usdResolution } })
    ).toThrow("明示的なJPY通貨換算");

    const record = buildValuationRecords({
      ...base,
      config: {
        depth: "deep_dive",
        factorResolution: usdResolution,
        currencyConversion: {
          fromCurrency: "USD",
          toCurrency: "JPY",
          rate: 94.46,
          rateDate: "2024",
          source: "World Bank PA.NUS.PPP",
        },
      },
    })[0].records[0];
    expect(record.centralValue).toBeCloseTo(10 * 12 * 94.46);
    expect(record.currencyConversion?.rate).toBe(94.46);
    expect(record.geographicCalibration.pppValue).toBe(1);
  });
});
