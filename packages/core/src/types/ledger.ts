/**
 * M8:記録・版管理基盤。
 * 参照元: docs/requirements/m8-ledger-versioning.md
 */

import type { LicenseMode } from "./common";

export type AssumptionSourceModule = "M1" | "M2" | "M3" | "M4" | "M6" | "M7";

/**
 * モジュール別の判別可能ユニオン。M1〜M7で記録が約束されている項目をすべて集約する
 * (M8 D-1。m4-divergence-decomposition.md §9の9項目、m3-monetization-engine.md §5の
 * 適合度ティア判定根拠を含む)。
 */
export type AssumptionEntryPayload =
  | { module: "M1"; kind: "exclusion"; reason: string }
  | { module: "M2"; kind: "depth_decision"; promotedManually: boolean; exclusionReason?: string }
  | { module: "M3"; kind: "coefficient_calibration"; setVersion: string; pppSource: string; incomeElasticity: number }
  | { module: "M3"; kind: "reconciliation_check"; aggregationFunctionVersion: string; goldenTestPassed: boolean }
  | { module: "M3"; kind: "fitness_tier_assignment"; tier: "A" | "B" | "C" | "not_applicable"; compositeScore: number | null }
  | {
      module: "M4";
      kind: "decomposition";
      algorithmVersion: string;
      symmetryAxiomApplied: true;
      cicesMatchLevel: string;
      aopMappingVersion: string;
      fallbackApplied: string[];
      nonDecomposableFactors: string[];
      f3ThresholdVersion: string;
      f8ThresholdVersion: string;
    }
  | { module: "M4"; kind: "representative_value_selection"; selectedMethodId: string; reason: string }
  | { module: "M6"; kind: "binding_mechanism_change"; previous: string; next: string; reason: string }
  | { module: "M7"; kind: "gap_finding"; gapType: string }
  | { module: "M7"; kind: "intentional_decision"; reason: string };

export interface AssumptionEntry {
  id: string;
  createdAt: string;
  sourceModule: AssumptionSourceModule;
  /** MaterialIssueId / ValuationRecordId / DivergenceDecompositionId / DecisionRecordId / GapFindingId 等。 */
  relatedRecordId: string;
  payload: AssumptionEntryPayload;
}

export interface RecalculationHashInputs {
  m1_sensitivityCriteriaVersion: string;
  m2_priorityFormulaVersion: string;
  m3_methodPluginVersions: Record<string, string>;
  m3_geoCalibrationVersion: string;
  m3_fitnessTierThresholdVersion: string;
  m4_decompositionAlgorithmVersion: string;
  m4_cicesMatchLevel: string;
  m4_aopMappingVersion: string;
  m5_carbonPriceScenarioSetVersion: string;
  m6_bindingMechanismDefinitionVersion: string;
  m7_gapDetectionRuleVersion: string;
}

export interface RecalculationHash {
  hash: string;
  inputs: RecalculationHashInputs;
}

/** 旧版は削除せず保持し続ける(M8 D-3)。 */
export interface VersionedParameterSet {
  /** 例 "ifvi-water-consumption" / "aop-mapping" / "cices-match-level" / "carbon-price-scenarios"。 */
  setId: string;
  version: string;
  effectiveFrom: string;
  supersededBy?: string;
  /** 版を更新した場合は必須。 */
  changeReason?: string;
}

export interface LicenseGate {
  dataSourceId: string;
  licenseMode: LicenseMode;
}

/**
 * pending_reviewのデータソースに依存する評価・判定は実行しない(M8 D-4)。
 * M6のD-10(承認閾値未入力時のpending状態)と同じ表示パターンを使う。
 */
export function isLicenseBlocked(gate: LicenseGate): boolean {
  return gate.licenseMode === "pending_review";
}
