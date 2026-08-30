import { computeRecalculationHash } from "@core/ledger/recalculation-hash";

export interface DecompositionVersions {
  algorithmVersion: string;
  cicesMatchLevel: "section" | "division" | "group" | "class";
  aopMappingVersion: string;
}

export interface ExpansionHashEvidence {
  activeInputBatchHashes: string[];
  inputMappingHashes: string[];
  valueFactorSourceHashes: string[];
  methodPluginVersions?: Record<string, string>;
}

/** デモで使用したM1〜M7の版を、監査用の再計算ハッシュへ集約する。 */
export function buildDemoRecalculationHash(
  decomposition: DecompositionVersions,
  expansion?: ExpansionHashEvidence
) {
  return computeRecalculationHash({
    m1_sensitivityCriteriaVersion: "tnfd-leap-l3-v1",
    m2_priorityFormulaVersion: "priority-v1",
    m3_methodPluginVersions: {
      "replacement-cost": "1.0.0",
      "lime3-water": "3.0.0",
      "ifvi-water-consumption": "2026-03-final:jp-table-d1-v1",
      "ghg-carbon-price-conversion": "1.0.0",
      ...(expansion?.methodPluginVersions ?? {}),
    },
    m3_geoCalibrationVersion: "ifvi-water-consumption-v2",
    m3_fitnessTierThresholdVersion: "fitness-tier-v1",
    m4_decompositionAlgorithmVersion: decomposition.algorithmVersion,
    m4_cicesMatchLevel: decomposition.cicesMatchLevel,
    m4_aopMappingVersion: decomposition.aopMappingVersion,
    m5_carbonPriceScenarioSetVersion: "carbon-price-v2",
    m6_bindingMechanismDefinitionVersion: "binding-mechanism-v1",
    m7_gapDetectionRuleVersion: "gap-detection-v1",
    ...(expansion && expansion.activeInputBatchHashes.length > 0
      ? { activeInputBatchHashes: [...new Set(expansion.activeInputBatchHashes)].sort() }
      : {}),
    ...(expansion && expansion.inputMappingHashes.length > 0
      ? { inputMappingHashes: [...new Set(expansion.inputMappingHashes)].sort() }
      : {}),
    ...(expansion && expansion.valueFactorSourceHashes.length > 0
      ? { valueFactorSourceHashes: [...new Set(expansion.valueFactorSourceHashes)].sort() }
      : {}),
  });
}
