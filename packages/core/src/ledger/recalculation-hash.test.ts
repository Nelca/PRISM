import { describe, expect, it } from "vitest";
import { computeRecalculationHash } from "./recalculation-hash";
import type { RecalculationHashInputs } from "../types/ledger";

const baseInputs: RecalculationHashInputs = {
  m1_sensitivityCriteriaVersion: "tnfd-leap-l3-v1",
  m2_priorityFormulaVersion: "priority-v1",
  m3_methodPluginVersions: { "replacement-cost": "1.0.0", "lime3-water": "3.0.0" },
  m3_geoCalibrationVersion: "geo-calib-v1",
  m3_fitnessTierThresholdVersion: "fitness-tier-v1",
  m4_decompositionAlgorithmVersion: "shapley-v1",
  m4_cicesMatchLevel: "group",
  m4_aopMappingVersion: "aop-mapping-v1",
  m5_carbonPriceScenarioSetVersion: "carbon-price-v1",
  m6_bindingMechanismDefinitionVersion: "binding-mechanism-v1",
  m7_gapDetectionRuleVersion: "gap-detection-v1",
};

describe("computeRecalculationHash", () => {
  it("同じ入力なら常に同じハッシュを返す(決定論的)", () => {
    const a = computeRecalculationHash(baseInputs);
    const b = computeRecalculationHash(baseInputs);
    expect(a.hash).toBe(b.hash);
  });

  it("ネストしたオブジェクト(m3_methodPluginVersions)のキー順序が違っても同じハッシュになる", () => {
    const inputsA: RecalculationHashInputs = {
      ...baseInputs,
      m3_methodPluginVersions: { "replacement-cost": "1.0.0", "lime3-water": "3.0.0" },
    };
    const inputsB: RecalculationHashInputs = {
      ...baseInputs,
      m3_methodPluginVersions: { "lime3-water": "3.0.0", "replacement-cost": "1.0.0" },
    };
    expect(computeRecalculationHash(inputsA).hash).toBe(computeRecalculationHash(inputsB).hash);
  });

  it("いずれかの版が異なれば異なるハッシュになる", () => {
    const changed: RecalculationHashInputs = { ...baseInputs, m4_decompositionAlgorithmVersion: "shapley-v2" };
    expect(computeRecalculationHash(baseInputs).hash).not.toBe(computeRecalculationHash(changed).hash);
  });

  it("inputsをそのまま保持する", () => {
    const result = computeRecalculationHash(baseInputs);
    expect(result.inputs).toEqual(baseInputs);
  });
});
