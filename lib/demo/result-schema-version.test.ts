/**
 * T-14:保存・版管理・後方互換。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md T-14
 *
 * - 結果構造の版(`RESULT_SCHEMA_VERSION`)が M4 新エンジンへの切り替えで上がっていること
 * - 比較レシピレジストリ版・許容誤差版・同一対象判定規則版・因果経路対応表版・F-3/F-8 閾値版が
 *   再計算ハッシュに入り、**どれか1つでも変わればハッシュが変わる**こと
 *   (閾値の有効・無効も版として区別される)
 * - 旧形式(resultSchemaVersion ≤ 10)の分解結果を読んでも例外にならず、
 *   「旧形式のため再計算が必要」を返すこと
 */
import { describe, expect, it } from "vitest";
import { RESULT_SCHEMA_VERSION, runDemoPipeline } from "./run-demo-pipeline";
import { buildDemoRecalculationHash, type DecompositionVersions } from "./build-recalculation-hash";
import { readDivergenceDecomposition } from "@/lib/pipeline/valuation-insights";
import { F3_THRESHOLD_DISABLED_VERSION, F8_THRESHOLD_DISABLED_VERSION } from "@core/divergence/mode-selection";
import { RECIPE_REGISTRY_VERSION } from "@core/divergence/recipes/registry";
import { SUBJECT_IDENTITY_RULE_VERSION } from "@core/divergence/comparability";
import { TOLERANCE_POLICY } from "@core/divergence/tolerance";
import { PATHWAY_MAPPING_VERSION } from "@core/monetization/trace/pathway-mapping";
import type { DivergenceDecomposition } from "@core/types/divergence";

const BASE: DecompositionVersions = {
  algorithmVersion: "shapley-subset-v2",
  cicesMatchLevel: "group",
  aopMappingVersion: "aop-mapping-v1",
  f3ThresholdVersion: F3_THRESHOLD_DISABLED_VERSION,
  f8ThresholdVersion: F8_THRESHOLD_DISABLED_VERSION,
  recipeRegistryVersion: RECIPE_REGISTRY_VERSION,
  toleranceVersion: TOLERANCE_POLICY.version,
  subjectRuleVersion: SUBJECT_IDENTITY_RULE_VERSION,
  pathwayMappingVersion: PATHWAY_MAPPING_VERSION,
};

describe("T-14 保存・版管理・後方互換", () => {
  it("結果構造の版は 11(M4を新エンジンへ切り替えたため上げた)", () => {
    expect(RESULT_SCHEMA_VERSION).toBe(16);
  });

  it("同じ版からは同じ再計算ハッシュが出る", () => {
    expect(buildDemoRecalculationHash(BASE).hash).toBe(buildDemoRecalculationHash({ ...BASE }).hash);
  });

  it.each([
    ["recipeRegistryVersion", { recipeRegistryVersion: "recipe-registry-v3" }],
    ["toleranceVersion", { toleranceVersion: "tol-v2" }],
    ["subjectRuleVersion", { subjectRuleVersion: "subject-identity-v2" }],
    ["pathwayMappingVersion", { pathwayMappingVersion: "pathway-mapping-v2" }],
    ["algorithmVersion", { algorithmVersion: "shapley-v1" }],
  ])("%s が変われば再計算ハッシュが変わる", (_label, override) => {
    expect(buildDemoRecalculationHash({ ...BASE, ...override }).hash).not.toBe(buildDemoRecalculationHash(BASE).hash);
  });

  it("F-3/F-8 の閾値は有効時と無効時でハッシュが区別される(T-02-9)", () => {
    const disabled = buildDemoRecalculationHash(BASE);
    const enabled = buildDemoRecalculationHash({ ...BASE, f3ThresholdVersion: "f3-v1", f8ThresholdVersion: "f8-v1" });
    expect(enabled.hash).not.toBe(disabled.hash);
    expect(disabled.inputs.m4_f3ThresholdVersion).toBe(F3_THRESHOLD_DISABLED_VERSION);
    expect(disabled.inputs.m4_f8ThresholdVersion).toBe(F8_THRESHOLD_DISABLED_VERSION);
  });

  it("デモrunの再計算ハッシュ入力に、M4新経路の版がすべて入る", () => {
    const { inputs } = runDemoPipeline().recalculationHash;
    expect(inputs.m4_decompositionAlgorithmVersion).toBe("shapley-subset-v2");
    expect(inputs.m4_recipeRegistryVersion).toBe(RECIPE_REGISTRY_VERSION);
    expect(inputs.m4_toleranceVersion).toBe(TOLERANCE_POLICY.version);
    expect(inputs.m4_subjectRuleVersion).toBe(SUBJECT_IDENTITY_RULE_VERSION);
    expect(inputs.m4_pathwayMappingVersion).toBe(PATHWAY_MAPPING_VERSION);
    expect(inputs.m4_f3ThresholdVersion).toBe(F3_THRESHOLD_DISABLED_VERSION);
    expect(inputs.m4_f8ThresholdVersion).toBe(F8_THRESHOLD_DISABLED_VERSION);
  });

  it("デモrunの分解結果は新形式(schemaVersion 2)で、版が結果へ保存される", () => {
    const result = runDemoPipeline();
    expect(result.valuation.divergenceDecompositions.length).toBeGreaterThan(0);
    for (const decomposition of result.valuation.divergenceDecompositions) {
      expect(decomposition.schemaVersion).toBe(2);
      expect(decomposition.versions.recipeRegistryVersion).toBe(RECIPE_REGISTRY_VERSION);
      expect(decomposition.versions.toleranceVersion).toBe(TOLERANCE_POLICY.version);
      expect(decomposition.recalculationHash.startsWith("dd2:")).toBe(true);
      // 全 v(S) と差し替え内容は監査用に保存される(分解できたペアのみ)。
      for (const pair of decomposition.groups.flatMap((group) => group.crossMethodPairs)) {
        if (pair.status !== "decomposed") continue;
        expect(pair.subsets.length).toBe(2 ** pair.contributions.length);
        expect(pair.tolerance.version).toBe(TOLERANCE_POLICY.version);
      }
    }
  });

  it("旧形式(schemaVersion なし)の分解結果を読んでも落ちず、再計算が必要だと分かる", () => {
    const legacy = {
      id: "dd-legacy",
      targetPhysicalQuantityId: "pq-site042-water-2027",
      siteId: "site-042",
      valuationRecordIds: [],
      groups: [{ valueConcept: "welfare", methodIds: [], usage: "", pairwiseDecompositions: [] }],
      crossGroupComparison: null,
      assumptionEntryIds: [],
      recalculationHash: "dd:legacy",
    } as unknown as DivergenceDecomposition;

    expect(() => readDivergenceDecomposition(legacy)).not.toThrow();
    expect(readDivergenceDecomposition(legacy)).toEqual({ kind: "legacy_needs_recalculation", id: "dd-legacy" });
    expect(readDivergenceDecomposition(undefined)).toEqual({ kind: "missing" });
  });
});
