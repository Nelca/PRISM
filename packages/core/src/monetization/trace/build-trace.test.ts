/**
 * 完成実装 T-05 完了条件のテスト。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md T-05
 *
 * - 全waterプラグイン(3手法・6レコード)で trace.finalValue ≈ centralValue かつ replayTrace が一致する
 * - LIME3の2段トレースが externalValueFactors の単一係数と同じ最終値になる
 * - IFVI日本の0が published_zero(candidatesに computed_zero)、出典未供給時はゼロ意味を付けない
 * - buildIfviAggregateTrace の最終値が reconstructIfviWaterConsumption(IFVI_WATER_AGGREGATION)と一致する
 * - 汎用フォールバックが他プラグイン(water以外)で例外なく動き adapterCoverage: "generic_fallback"
 * - recalculability がトレースの availability から導出される
 */
import { describe, expect, it } from "vitest";
import { buildMethodEvaluationTrace } from "./build-trace";
import { replayTrace } from "../../trace/evaluate-trace";
import { TOLERANCE_POLICY, toleranceScale, withinTolerance } from "../../divergence/tolerance";
import { TEST_VALUATION_VERSIONS } from "../../divergence/test-helpers";
import { buildValuationRecordsForPlugin } from "../build-valuation-records";
import { lime3WaterPlugin } from "../plugins/lime3-water";
import { ifviWaterConsumptionPlugin, IFVI_WATER_AGGREGATION, buildIfviAggregateTrace } from "../plugins/ifvi-water-consumption";
import { replacementCostPlugin } from "../plugins/replacement-cost";
import { ghgCarbonPriceConversionPlugin } from "../plugins/ghg-carbon-price-conversion";
import { lime3PollutionPlugin } from "../plugins/lime3-pollution";
import { lime3WastePlugin } from "../plugins/lime3-waste";
import { lime3LandUsePlugin } from "../plugins/lime3-land-use";
import { companyExchangeValuePlugin } from "../plugins/company-exchange-value";
import { LIME3_WATER_SURFACE_CONSUMPTION_JAPAN } from "@/lib/data/lime3/water-coefficients";
import type {
  CorporateFinancialEffectInput,
  CurrencyConversionRecord,
  FactorResolution,
  GeographicCalibrationRecord,
  IfviWaterValueFactorSource,
  LandConversionInput,
  MethodConfig,
  PhysicalQuantityInput,
  PollutionReleaseInput,
  WasteQuantityInput,
} from "../../types/valuation";

const identityCalibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "test",
  pppValue: 1,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  deflator: 1,
  relativePriceEscalationRate: 1,
  elapsedYears: 0,
  areaScaling: 1,
};

const waterInput: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 45_000,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

const ifviSource: IfviWaterValueFactorSource = {
  country: "JP",
  table: "Appendix D Table D1",
  perspective: "global",
  priceYear: 2024,
  currency: "USD",
  coefficientSetVersion: "test-ifvi-v1",
  nationalBiodiversityPressure: 3.59,
  nationalWaterStress: 1.97,
  evidence: [{ source: "IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf", locator: "Appendix D Table D1", tier: "primary" }],
};

const ifviValueFactors = {
  "ifvi-vfnutrition": 0.0,
  "ifvi-vfdisease": 0.0,
  "ifvi-vfes": 2.97,
  "ifvi-vfaccess": 0.0,
};

function withinTol(a: number, b: number): boolean {
  const scale = toleranceScale([a, b]);
  return withinTolerance(a, b, scale, TOLERANCE_POLICY.money);
}

function assertNumbersClose(a: number, b: number, label: string): void {
  expect(withinTol(a, b), `${label}: ${a} と ${b} が tol-v1(money) 内で一致しない`).toBe(true);
}

describe("T-05: 全waterプラグイン(3手法・6レコード)のトレース再生", () => {
  it("lime3-water(構成要素あり)のtraceが centralValue と一致し再生できる", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: { "lime3-water": LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3 },
      lime3WaterCoefficient: LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
    };
    const [record] = buildValuationRecordsForPlugin(lime3WaterPlugin, {
      physicalQuantityId: "pq-lime3",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records;

    expect(record.trace).toBeDefined();
    const trace = record.trace!;
    assertNumbersClose(trace.finalValue.value, Number(record.centralValue), "lime3-water");
    expect(replayTrace(trace).matches).toBe(true);
    expect(trace.adapterCoverage).toBe("full");
    expect(trace.steps.length).toBeGreaterThanOrEqual(5); // 4段(coefficient_lookup/endpoint_allocation/×2 coefficient_application) + geographic_calibration
  });

  it("ifvi-water-consumptionの4レコードすべてでtraceが centralValue と一致し再生できる", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: ifviValueFactors,
      ifviWaterValueFactorSource: ifviSource,
    };
    const { records } = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-ifvi",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    expect(records).toHaveLength(4);
    for (const record of records) {
      const trace = record.trace!;
      assertNumbersClose(trace.finalValue.value, Number(record.centralValue), record.methodId);
      expect(replayTrace(trace).matches).toBe(true);
      expect(trace.adapterCoverage).toBe("full");
    }
  });

  it("replacement-costのtraceが centralValue と一致し再生できる", () => {
    const config: MethodConfig = { depth: "deep_dive", unitReplacementCost: 620 };
    const [record] = buildValuationRecordsForPlugin(replacementCostPlugin, {
      physicalQuantityId: "pq-replacement",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records;

    const trace = record.trace!;
    assertNumbersClose(trace.finalValue.value, Number(record.centralValue), "replacement-cost");
    expect(replayTrace(trace).matches).toBe(true);
    expect(trace.adapterCoverage).toBe("full");
  });
});

describe("T-05: LIME3の2段トレースは単一係数と同じ最終値になる", () => {
  it("lime3WaterCoefficientの有無でcentralValueは不変、traceの最終値もtol-v1内で一致する", () => {
    const singleFactorConfig: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: { "lime3-water": LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3 },
    };
    const decomposedConfig: MethodConfig = {
      ...singleFactorConfig,
      lime3WaterCoefficient: LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
    };

    const single = buildValuationRecordsForPlugin(lime3WaterPlugin, {
      physicalQuantityId: "pq-single",
      input: waterInput,
      config: singleFactorConfig,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records[0];
    const decomposed = buildValuationRecordsForPlugin(lime3WaterPlugin, {
      physicalQuantityId: "pq-decomposed",
      input: waterInput,
      config: decomposedConfig,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records[0];

    // centralValueの計算式自体は変えていないため厳密一致する
    expect(decomposed.centralValue).toBe(single.centralValue);
    assertNumbersClose(decomposed.trace!.finalValue.value, single.trace!.finalValue.value, "lime3-water single vs decomposed");

    expect(single.trace!.endpointBreakdown.status).toBe("not_published");
    expect(decomposed.trace!.endpointBreakdown.status).toBe("available");
  });
});

describe("T-05: IFVIのゼロ意味(§5.6)", () => {
  it("出典(ifviWaterValueFactorSource)ありで0の場合はpublished_zero、candidatesにcomputed_zeroを含む", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: ifviValueFactors,
      ifviWaterValueFactorSource: ifviSource,
    };
    const { records } = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-zero",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    const nutrition = records.find((r) => r.methodId === "ifvi-water-consumption.VFnutrition")!;
    expect(nutrition.trace!.zeroMeaning?.code).toBe("published_zero");
    expect(nutrition.trace!.zeroMeaning?.candidates).toContain("computed_zero");

    const disease = records.find((r) => r.methodId === "ifvi-water-consumption.VFdisease")!;
    expect(disease.trace!.zeroMeaning?.code).toBe("published_zero");

    const access = records.find((r) => r.methodId === "ifvi-water-consumption.VFaccess")!;
    expect(access.trace!.zeroMeaning?.code).toBe("published_zero");

    // VFesは非ゼロ(2.97)のためゼロ意味は付かない
    const es = records.find((r) => r.methodId === "ifvi-water-consumption.VFes")!;
    expect(es.trace!.zeroMeaning).toBeUndefined();
  });

  it("出典が未供給で0の場合はゼロ意味を確定しない(missingとして0計算しないのではなく、意味だけ未確定)", () => {
    const config: MethodConfig = { depth: "deep_dive", externalValueFactors: ifviValueFactors };
    const { records } = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-no-source",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    const nutrition = records.find((r) => r.methodId === "ifvi-water-consumption.VFnutrition")!;
    expect(nutrition.trace!.zeroMeaning).toBeUndefined();
    // centralValue自体は0のまま計算される(推定で埋めない、意味だけが未確定)
    expect(nutrition.centralValue).toBe(0);
  });
});

describe("T-05: buildIfviAggregateTrace", () => {
  it("最終値がIFVI_WATER_AGGREGATION.reconstruct(=reconstructIfviWaterConsumption)と一致する(MAXの相互作用を保持)", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: { "ifvi-vfnutrition": 12_000, "ifvi-vfdisease": 9_500, "ifvi-vfes": 15_200, "ifvi-vfaccess": 3_000 },
      ifviWaterValueFactorSource: ifviSource,
    };
    const { records } = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-aggregate",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    const subTraces = records.map((r) => r.trace!);
    const aggregate = buildIfviAggregateTrace(subTraces);

    const valuesBySubFactor: Record<string, number> = Object.fromEntries(
      records.map((r) => [r.trace!.subFactorId, Number(r.centralValue)])
    );
    const expected = IFVI_WATER_AGGREGATION.reconstruct(valuesBySubFactor);

    assertNumbersClose(aggregate.finalValue.value, expected, "buildIfviAggregateTrace");
    expect(IFVI_WATER_AGGREGATION.mixesValueConcepts).toBe(true);
  });

  it("4本のうち1本でも欠けると例外を投げる", () => {
    const config: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: ifviValueFactors,
      ifviWaterValueFactorSource: ifviSource,
    };
    const { records } = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-missing",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });
    const subTraces = records.slice(0, 3).map((r) => r.trace!);
    expect(() => buildIfviAggregateTrace(subTraces)).toThrow();
  });
});

describe("T-05: 汎用フォールバック(modelSteps未提供のプラグイン)", () => {
  const fullCalibration = (input: PhysicalQuantityInput): GeographicCalibrationRecord => ({
    ...identityCalibration,
    sourceRegion: input.sourceRegion,
    targetRegion: input.targetRegion,
  });

  it("ghg-carbon-price-conversion: 例外なく動きadapterCoverage=generic_fallback、再生一致する", () => {
    const climateInput: PhysicalQuantityInput = {
      category: "climate",
      physicalQuantity: 1_000,
      unit: "tCO2e",
      siteId: "site-050",
      sourceRegion: "JP",
      targetRegion: "JP",
    };
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: { "carbon-social-cost-usd-per-tco2": 236, "gx-ets-adjustment-baseline-price-jpy-per-tco2": 1_700 },
    };
    const outputs = ghgCarbonPriceConversionPlugin.evaluate(climateInput, config);
    for (const output of outputs) {
      const recordMethodId = `ghg-carbon-price-conversion.${output.subFactorId}`;
      const trace = buildMethodEvaluationTrace({
        output,
        plugin: ghgCarbonPriceConversionPlugin,
        recordMethodId,
        physicalQuantityId: "pq-ghg",
        input: climateInput,
        calibration: fullCalibration(climateInput),
        config,
      });
      expect(trace.adapterCoverage).toBe("generic_fallback");
      expect(replayTrace(trace).matches).toBe(true);
    }
  });

  it("lime3-pollution: 例外なく動きadapterCoverage=generic_fallback、再生一致する", () => {
    const input: PollutionReleaseInput = {
      category: "pollution",
      physicalQuantity: 10,
      unit: "kg",
      siteId: "site-1",
      sourceRegion: "JP",
      targetRegion: "JP",
      reportingYear: 2023,
      prtrListVersion: "2023",
      facilityId: "f1",
      prtrSubstanceCode: "009",
      casRns: ["107-13-1"],
      releaseMedium: "air",
      sourceKind: "public_prtr",
      sourceRecordId: "r1",
      sourceRecordHash: "h",
    };
    const resolution: FactorResolution = {
      factor: {
        factorId: "f",
        methodId: "lime3-pollution",
        methodVersion: "3.0.0",
        sourceFlowId: "002P22009",
        sourceFlowName: "排出, アクリロニトリル, 大気, 不特定",
        medium: "air",
        valuePerUnit: 2.5,
        denominatorUnit: "kg",
        currency: "USD",
        priceYear: null,
        geographicPerspective: "production-japan",
        sourceRegion: "JP",
        sourceHash: "hash",
        licenseMode: "bring_your_own_license",
        licenseValidUntil: "2027-06-30",
      },
      mappingId: "lime3-pollution:2023:2023:009:air",
      mappingVersion: "1.0.0",
      mappingHash: "mapping-hash",
    };
    const currencyConversion: CurrencyConversionRecord = { fromCurrency: "USD", toCurrency: "JPY", rate: 150, rateDate: "2026-01-01", source: "test" };
    const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution, currencyConversion };
    const [output] = lime3PollutionPlugin.evaluate(input, config);
    const trace = buildMethodEvaluationTrace({
      output,
      plugin: lime3PollutionPlugin,
      recordMethodId: "lime3-pollution",
      physicalQuantityId: "pq-pollution",
      input,
      calibration: fullCalibration(input),
      currencyConversion,
      factorResolution: resolution,
      config,
    });
    expect(trace.adapterCoverage).toBe("generic_fallback");
    expect(replayTrace(trace).matches).toBe(true);
  });

  it("lime3-waste: 例外なく動きadapterCoverage=generic_fallback、再生一致する", () => {
    const input: WasteQuantityInput = {
      category: "waste",
      physicalQuantity: 100,
      unit: "kg",
      siteId: "site-1",
      sourceRegion: "JP",
      targetRegion: "JP",
      reportingPeriod: "2025",
      wasteTypeCode: "industrial_unspecified",
      hazardous: false,
      treatmentRoute: "landfill",
      treatmentLocation: "offsite",
      weightBasis: "wet",
      sourceRecordId: "r1",
      sourceRecordHash: "h",
    };
    const resolution: FactorResolution = {
      factor: {
        factorId: "f",
        methodId: "lime3-waste",
        methodVersion: "3.0.0",
        sourceFlowId: "006153",
        sourceFlowName: "排出, 埋立物, 産廃 (特定せず), 陸域, 不特定",
        valuePerUnit: 0.0641845845,
        denominatorUnit: "kg",
        currency: "USD",
        priceYear: null,
        geographicPerspective: "production-japan",
        sourceRegion: "JP",
        sourceHash: "hash",
        licenseMode: "bring_your_own_license",
        licenseValidUntil: "2027-06-30",
      },
      mappingId: "lime3-waste:industrial_unspecified:landfill:offsite",
      mappingVersion: "1.0.0",
      mappingHash: "mapping-hash",
    };
    const currencyConversion: CurrencyConversionRecord = { fromCurrency: "USD", toCurrency: "JPY", rate: 150, rateDate: "2026-01-01", source: "test" };
    const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution, currencyConversion };
    const [output] = lime3WastePlugin.evaluate(input, config);
    const trace = buildMethodEvaluationTrace({
      output,
      plugin: lime3WastePlugin,
      recordMethodId: "lime3-waste",
      physicalQuantityId: "pq-waste",
      input,
      calibration: fullCalibration(input),
      currencyConversion,
      factorResolution: resolution,
      config,
    });
    expect(trace.adapterCoverage).toBe("generic_fallback");
    expect(replayTrace(trace).matches).toBe(true);
  });

  it("lime3-land-use: 例外なく動きadapterCoverage=generic_fallback、再生一致する", () => {
    const input: LandConversionInput = {
      category: "land_use",
      activityKind: "conversion",
      physicalQuantity: 10,
      unit: "m2",
      siteId: "site-1",
      sourceRegion: "JP",
      targetRegion: "JP",
      projectId: "p1",
      landClassBefore: "forest",
      landClassAfter: "building",
      sourceRecordId: "r1",
      sourceRecordHash: "h",
    };
    const resolution: FactorResolution = {
      factor: {
        factorId: "f",
        methodId: "lime3-land-use",
        methodVersion: "3.0.0",
        sourceFlowId: "008273",
        sourceFlowName: "land",
        valuePerUnit: 12.340288,
        denominatorUnit: "m2",
        currency: "USD",
        priceYear: null,
        geographicPerspective: "production-japan",
        sourceRegion: "JP",
        sourceHash: "hash",
        licenseMode: "bring_your_own_license",
        licenseValidUntil: "2027-06-30",
      },
      mappingId: "lime3-land-use:conversion:forest:building",
      mappingVersion: "1.0.0",
      mappingHash: "mapping-hash",
    };
    const currencyConversion: CurrencyConversionRecord = { fromCurrency: "USD", toCurrency: "JPY", rate: 150, rateDate: "2026-01-01", source: "test" };
    const config: MethodConfig = { depth: "deep_dive", factorResolution: resolution, currencyConversion };
    const [output] = lime3LandUsePlugin.evaluate(input, config);
    const trace = buildMethodEvaluationTrace({
      output,
      plugin: lime3LandUsePlugin,
      recordMethodId: "lime3-land-use",
      physicalQuantityId: "pq-land",
      input,
      calibration: fullCalibration(input),
      currencyConversion,
      factorResolution: resolution,
      config,
    });
    expect(trace.adapterCoverage).toBe("generic_fallback");
    expect(replayTrace(trace).matches).toBe(true);
  });

  it("company-exchange-value: 例外なく動きadapterCoverage=generic_fallback、再生一致する", () => {
    const input: PollutionReleaseInput = {
      category: "pollution",
      physicalQuantity: 10,
      unit: "kg",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
      reportingYear: 2023,
      prtrListVersion: "2023",
      facilityId: "facility-1",
      prtrSubstanceCode: "009",
      casRns: ["107-13-1"],
      releaseMedium: "air",
      sourceKind: "customer_prtr",
      sourceRecordId: "row-1",
      sourceRecordHash: "a".repeat(64),
    };
    const effect: CorporateFinancialEffectInput = {
      id: "effect-1",
      siteId: "site-042",
      category: "pollution",
      linkedPhysicalQuantityId: "physical-row-1",
      grossCost: 18_000_000,
      alreadyInternalizedCost: 3_000_000,
      verifiedIncrementalBenefit: 500_000,
      amountBasis: "annual",
      internalizationScenarios: [{ scenario: "pollution_regulation_and_remediation", probability: 0.65, period: 3 }],
      doubleCountKey: "site-042:pollution:air",
      sourceKind: "company_input",
      sourceLabel: "environment cost ledger",
      sourceHash: "b".repeat(64),
      dataVersion: "financial-effects-v1",
      uncertaintySigma: 0.15,
    };
    const config: MethodConfig = { depth: "deep_dive", corporateFinancialEffect: effect };
    const [output] = companyExchangeValuePlugin.evaluate(input, config);
    const trace = buildMethodEvaluationTrace({
      output,
      plugin: companyExchangeValuePlugin,
      recordMethodId: "company-exchange-value",
      physicalQuantityId: "pq-company",
      input,
      calibration: fullCalibration(input),
      config,
    });
    expect(trace.adapterCoverage).toBe("generic_fallback");
    expect(replayTrace(trace).matches).toBe(true);
  });
});

describe("T-05: recalculabilityはトレースのavailabilityから導出される", () => {
  it("endpointBreakdown/damageTimeProfileがavailableのときだけpublished=trueになる", () => {
    const decomposedConfig: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: { "lime3-water": LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3 },
      lime3WaterCoefficient: LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
    };
    const decomposed = buildValuationRecordsForPlugin(lime3WaterPlugin, {
      physicalQuantityId: "pq-recalc-1",
      input: waterInput,
      config: decomposedConfig,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records[0];

    expect(decomposed.trace!.endpointBreakdown.status).toBe("available");
    expect(decomposed.recalculability.endpointBreakdownPublished).toBe(true);
    expect(decomposed.trace!.damageTimeProfile.status).not.toBe("available");
    expect(decomposed.recalculability.damageTimeProfilePublished).toBe(false);

    const singleFactorConfig: MethodConfig = {
      depth: "deep_dive",
      externalValueFactors: { "lime3-water": LIME3_WATER_SURFACE_CONSUMPTION_JAPAN.integratedUsdPerM3 },
    };
    const single = buildValuationRecordsForPlugin(lime3WaterPlugin, {
      physicalQuantityId: "pq-recalc-2",
      input: waterInput,
      config: singleFactorConfig,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records[0];

    expect(single.trace!.endpointBreakdown.status).toBe("not_published");
    expect(single.recalculability.endpointBreakdownPublished).toBe(false);
  });

  it("replacement-cost(すべてnot_applicable)ではrecalculabilityの両方がfalseになる", () => {
    const config: MethodConfig = { depth: "deep_dive", unitReplacementCost: 620 };
    const [record] = buildValuationRecordsForPlugin(replacementCostPlugin, {
      physicalQuantityId: "pq-recalc-3",
      input: waterInput,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    }).records;

    expect(record.recalculability.endpointBreakdownPublished).toBe(false);
    expect(record.recalculability.damageTimeProfilePublished).toBe(false);
  });
});
