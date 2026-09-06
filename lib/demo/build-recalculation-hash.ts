import { computeRecalculationHash } from "@core/ledger/recalculation-hash";

/**
 * 再計算ハッシュへ入れるM4の版。完成実装 T-14 で新経路(V2)の版を追加した。
 * `DivergenceDecompositionVersionsV2` をそのまま渡せる形にしている。
 */
export interface DecompositionVersions {
  algorithmVersion: string;
  cicesMatchLevel: string;
  aopMappingVersion: string;
  f3ThresholdVersion?: string;
  f8ThresholdVersion?: string;
  recipeRegistryVersion?: string;
  toleranceVersion?: string;
  subjectRuleVersion?: string;
  pathwayMappingVersion?: string;
}

export interface ExpansionHashEvidence {
  activeInputBatchHashes: string[];
  inputMappingHashes: string[];
  valueFactorSourceHashes: string[];
  financialEffectSourceHashes: string[];
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
    // T-14:比較レシピレジストリ・許容誤差・同一対象判定規則・因果経路対応表・F-3/F-8閾値の版。
    // どれか1つでも変われば再計算ハッシュが変わる(閾値の有効・無効も版として区別される)。
    ...(decomposition.recipeRegistryVersion ? { m4_recipeRegistryVersion: decomposition.recipeRegistryVersion } : {}),
    ...(decomposition.toleranceVersion ? { m4_toleranceVersion: decomposition.toleranceVersion } : {}),
    ...(decomposition.subjectRuleVersion ? { m4_subjectRuleVersion: decomposition.subjectRuleVersion } : {}),
    ...(decomposition.pathwayMappingVersion ? { m4_pathwayMappingVersion: decomposition.pathwayMappingVersion } : {}),
    ...(decomposition.f3ThresholdVersion ? { m4_f3ThresholdVersion: decomposition.f3ThresholdVersion } : {}),
    ...(decomposition.f8ThresholdVersion ? { m4_f8ThresholdVersion: decomposition.f8ThresholdVersion } : {}),
    m5_carbonPriceScenarioSetVersion: "nature-internalization-v3",
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
    ...(expansion && expansion.financialEffectSourceHashes.length > 0
      ? { financialEffectSourceHashes: [...new Set(expansion.financialEffectSourceHashes)].sort() }
      : {}),
  });
}
