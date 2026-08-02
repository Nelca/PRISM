/**
 * M3統合テスト(実装計画フェーズ8)。
 * build-plan §5.2の完了条件「同一の物理量に対し複数手法のValuationRecordが生成され、
 * 各々にレンジ・ティア・メタデータが付く」を検証する。
 */
import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "./build-valuation-records";
import { ALL_PLUGINS, getPluginsForCategory } from "./registry";
import type { GeographicCalibrationRecord, MethodConfig, PhysicalQuantityInput } from "../types/valuation";

describe("M3統合テスト:水カテゴリで3手法・合計6本のValuationRecordを生成する", () => {
  const input: PhysicalQuantityInput = {
    category: "water",
    physicalQuantity: 10_000, // m3
    unit: "m3",
    siteId: "site-042",
    sourceRegion: "JP",
    targetRegion: "JP",
  };

  const calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
    pppSource: "世界銀行ICP 2024年版",
    pppValue: 1.0, // 国内サイトのため較正なし
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

  it("registryが水カテゴリの3手法すべてを返す", () => {
    const plugins = getPluginsForCategory("water");
    expect(plugins.map((p) => p.methodId).sort()).toEqual(
      ["ifvi-water-consumption", "lime3-water", "replacement-cost"].sort()
    );
  });

  it("3手法・合計6本のValuationRecordが生成される(IFVI4本+LIME3 1本+代替費用法1本)", () => {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: ALL_PLUGINS,
    });

    const allRecords = groups.flatMap((g) => g.records);
    expect(allRecords).toHaveLength(6);

    // D-1の表通りの価値概念・AoP・割引ステータスになっていることを確認
    const byId = Object.fromEntries(allRecords.map((r) => [r.methodId, r]));

    expect(byId["replacement-cost"].valueConcept).toBe("exchange");
    expect(byId["replacement-cost"].aopCode).toBe("not_applicable");

    expect(byId["lime3-water"].valueConcept).toBe("welfare");
    expect(byId["lime3-water"].aopCode).toBe("human_health");

    expect(byId["ifvi-water-consumption.VFnutrition"].valueConcept).toBe("welfare");
    expect(byId["ifvi-water-consumption.VFnutrition"].aopCode).toBe("human_health");

    expect(byId["ifvi-water-consumption.VFdisease"].valueConcept).toBe("welfare");
    expect(byId["ifvi-water-consumption.VFdisease"].aopCode).toBe("human_health");

    expect(byId["ifvi-water-consumption.VFes"].valueConcept).toBe("welfare");
    expect(byId["ifvi-water-consumption.VFes"].aopCode).toBe("resource_availability");

    expect(byId["ifvi-water-consumption.VFaccess"].valueConcept).toBe("exchange");
    expect(byId["ifvi-water-consumption.VFaccess"].aopCode).toBe("not_applicable");
    expect(byId["ifvi-water-consumption.VFaccess"].discountRateStatus).toBe("explicit");
    expect(byId["ifvi-water-consumption.VFaccess"].discountRate).toBe(0.02);
  });

  it("各ValuationRecordにレンジ(quantileRange)・ティア(transferFitness)・メタデータが付いている", () => {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: ALL_PLUGINS,
    });

    for (const record of groups.flatMap((g) => g.records)) {
      expect(record.quantileRange.p5).toBeLessThanOrEqual(record.quantileRange.p50);
      expect(record.quantileRange.p50).toBeLessThanOrEqual(record.quantileRange.p95);
      expect(record.transferFitness.tier).toMatch(/^(A|B|C|not_applicable)$/);
      expect(record.recalculationHash).toMatch(/^placeholder:/);
      expect(Array.isArray(record.scopeExclusions)).toBe(true);
    }
  });

  it("IFVIの整合性検証(復元集計値)が、内訳4本から正しく算出される", () => {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: ALL_PLUGINS,
    });

    const ifviGroup = groups.find((g) => g.methodId === "ifvi-water-consumption")!;
    expect(ifviGroup.reconciledAggregate).toBeDefined();

    const nutrition = input.physicalQuantity * config.externalValueFactors!["ifvi-vfnutrition"];
    const disease = input.physicalQuantity * config.externalValueFactors!["ifvi-vfdisease"];
    const es = input.physicalQuantity * config.externalValueFactors!["ifvi-vfes"];
    const access = input.physicalQuantity * config.externalValueFactors!["ifvi-vfaccess"];

    expect(ifviGroup.reconciledAggregate).toBe(access + Math.max(nutrition, disease, es));
  });

  it("代替費用法とLIME3にはreconciliationがない(単一内訳のため不要)", () => {
    const groups = buildValuationRecords({
      physicalQuantityId: "pq-site042-water-2027",
      input,
      config,
      calibration,
      plugins: ALL_PLUGINS,
    });

    const replacementCostGroup = groups.find((g) => g.methodId === "replacement-cost")!;
    const lime3Group = groups.find((g) => g.methodId === "lime3-water")!;

    expect(replacementCostGroup.reconciledAggregate).toBeUndefined();
    expect(lime3Group.reconciledAggregate).toBeUndefined();
  });
});
