import { describe, expect, it } from "vitest";
import { buildValuationRecords, buildValuationRecordsForPlugin, ReconciliationError } from "./build-valuation-records";
import { replacementCostPlugin } from "./plugins/replacement-cost";
import { ifviWaterConsumptionPlugin } from "./plugins/ifvi-water-consumption";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import { createSeededRng } from "./rng";
import { TEST_VALUATION_VERSIONS } from "../divergence/test-helpers";

const input: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 1,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

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

describe("buildValuationRecordsForPlugin", () => {
  it("単一手法(代替費用法)から1件のValuationRecordを組み立てる", () => {
    const config: MethodConfig = { depth: "screening", unitReplacementCost: 500 };

    const group = buildValuationRecordsForPlugin(replacementCostPlugin, {
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    expect(group.records).toHaveLength(1);
    const [record] = group.records;
    expect(record.methodId).toBe("replacement-cost"); // 単一内訳なので手法IDそのまま
    expect(record.valueConcept).toBe("exchange");
    expect(record.centralValue).toBe(500); // physicalQuantity=1 × 単価500、較正は恒等
    // quantileRangeはMath.random()による実際のモンテカルロ試行(本番と同じ)のため、厳密一致ではなく
    // 妥当な範囲(±5%程度、σ=0.1のサンプリング誤差を考慮)で検証する。決定論的な検証は
    // uncertainty.test.ts(シード可能な乱数生成器を使用)で別途行っている。
    expect(record.quantileRange.p50).toBeGreaterThan(475);
    expect(record.quantileRange.p50).toBeLessThan(525);
    expect(record.recalculationHash).toMatch(/^vr:[0-9a-f]+$/);
  });

  it("IFVI(複数内訳)は methodId が {親手法ID}.{内訳ID} 形式になる", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: {
        "ifvi-vfnutrition": 12_000,
        "ifvi-vfdisease": 9_500,
        "ifvi-vfes": 15_200,
        "ifvi-vfaccess": 3_000,
      },
    };

    const group = buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: identityCalibration,
      versions: TEST_VALUATION_VERSIONS,
    });

    expect(group.records).toHaveLength(4);
    expect(group.records.map((r) => r.methodId).sort()).toEqual(
      [
        "ifvi-water-consumption.VFaccess",
        "ifvi-water-consumption.VFdisease",
        "ifvi-water-consumption.VFes",
        "ifvi-water-consumption.VFnutrition",
      ].sort()
    );

    // D-2:復元集計値が常に算出される
    expect(group.reconciledAggregate).toBe(3_000 + Math.max(12_000, 9_500, 15_200));
  });

  it("公式集計値が提供され、復元集計値と食い違う場合はReconciliationErrorを投げる", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: {
        "ifvi-vfnutrition": 12_000,
        "ifvi-vfdisease": 9_500,
        "ifvi-vfes": 15_200,
        "ifvi-vfaccess": 3_000,
      },
    };

    expect(() =>
      buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
        physicalQuantityId: "pq-1",
        input,
        config,
        calibration: identityCalibration,
        versions: TEST_VALUATION_VERSIONS,
        officialAggregates: { "ifvi-water-consumption": 999_999 }, // 明らかに食い違う値
      })
    ).toThrow(ReconciliationError);
  });

  it("公式集計値が復元集計値と一致する場合はエラーにならない", () => {
    const config: MethodConfig = {
      depth: "screening",
      externalValueFactors: {
        "ifvi-vfnutrition": 12_000,
        "ifvi-vfdisease": 9_500,
        "ifvi-vfes": 15_200,
        "ifvi-vfaccess": 3_000,
      },
    };
    const expectedAggregate = 3_000 + Math.max(12_000, 9_500, 15_200);

    expect(() =>
      buildValuationRecordsForPlugin(ifviWaterConsumptionPlugin, {
        physicalQuantityId: "pq-1",
        input,
        config,
        calibration: identityCalibration,
        versions: TEST_VALUATION_VERSIONS,
        officialAggregates: { "ifvi-water-consumption": expectedAggregate },
      })
    ).not.toThrow();
  });
});

describe("buildValuationRecords", () => {
  it("複数プラグインをまとめて実行し、それぞれのグループを返す", () => {
    const config: MethodConfig = { depth: "screening", unitReplacementCost: 500 };

    const groups = buildValuationRecords({
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: identityCalibration,
      plugins: [replacementCostPlugin],
      versions: TEST_VALUATION_VERSIONS,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].methodId).toBe("replacement-cost");
  });

  it("同じシードのrngを渡すと、モンテカルロの結果まで含めて同一のValuationRecordが得られる", () => {
    const config: MethodConfig = { depth: "screening", unitReplacementCost: 500 };
    const options = {
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: identityCalibration,
      plugins: [replacementCostPlugin],
      versions: TEST_VALUATION_VERSIONS,
    };

    const first = buildValuationRecords({ ...options, rng: createSeededRng(42) });
    const second = buildValuationRecords({ ...options, rng: createSeededRng(42) });

    // シードを保存しておけば同じrunを後から再現できる、という永続化層の前提(計画B-3)。
    expect(second[0].records[0].quantileRange).toEqual(first[0].records[0].quantileRange);

    const different = buildValuationRecords({ ...options, rng: createSeededRng(43) });
    expect(different[0].records[0].quantileRange).not.toEqual(first[0].records[0].quantileRange);
  });
});
