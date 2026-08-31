/**
 * パイプライン層:M3(貨幣化エンジン、深掘り深度)→M4(乖離分解)。
 * 参照元: docs/roadmap/build-plan.md §7.1(GATE:M1からM8まで通す)
 *
 * assessment-pipeline.tsで深掘りに昇格したMaterialIssueごとに、呼び出し側が用意した
 * 深掘り深度の設定でM3を実行し、生成されたValuationRecordからM4の乖離分解を実行する。
 * 各ステップでM8のderive*Payload()を呼びAssumptionEntryを実際に生成する。
 */

import { buildValuationRecords } from "../monetization/build-valuation-records";
import { computeFitnessTier } from "../monetization/fitness";
import { buildDivergenceDecomposition } from "../divergence/build-divergence-decomposition";
import { buildRepresentativeValueSelection } from "../divergence/representative-value";
import type { RepresentativeValueSelectionResult } from "../divergence/representative-value";
import {
  buildAssumptionEntry,
  deriveM3CoefficientCalibrationPayload,
  deriveM3CorporateFinancialEffectPayload,
  deriveM3FitnessTierPayload,
  deriveM3InputMappingPayload,
  deriveM3ReconciliationCheckPayload,
  deriveM4DecompositionPayload,
  deriveM4RepresentativeValueSelectionPayload,
} from "../ledger/assumption-entry";
import type { M4DecompositionVersions } from "../ledger/assumption-entry";
import type {
  GeographicCalibrationRecord,
  MethodConfig,
  MonetizationMethodPlugin,
  PhysicalQuantityInput,
  ValuationRecord,
} from "../types/valuation";
import type { DivergenceDecomposition } from "../types/divergence";
import type { AssumptionEntry } from "../types/ledger";
import type { ValueConcept } from "../types/common";

export interface DeepDiveQuantityConfig {
  physicalQuantityId: string;
  input: PhysicalQuantityInput;
  config: MethodConfig;
  calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion">;
  plugins: MonetizationMethodPlugin[];
  officialAggregates?: Record<string, number>;
  /** M3 AssumptionEntry(coefficient_calibration)に記録する版。 */
  calibrationSetVersion: string;
  /** M3 AssumptionEntry(reconciliation_check)に記録する版。 */
  reconciliationFunctionVersion: string;
  /** 適合度ティア閾値の版(M3 D-5)。ValuationRecordの再計算ハッシュに入る。 */
  fitnessTierThresholdVersion: string;
}

/**
 * 既存の1物理量設定と、PRTR等の複数物理量設定を同じ入口で扱う。
 * 新規呼び出しは`quantities`を使い、既存水・GHGは単数形をそのまま利用できる。
 */
export type DeepDiveConfig =
  | DeepDiveQuantityConfig
  | {
      quantities: DeepDiveQuantityConfig[];
    };

export function quantitiesInDeepDiveConfig(config: DeepDiveConfig): DeepDiveQuantityConfig[] {
  return "quantities" in config ? config.quantities : [config];
}

/** 利用者が選んだ代表値(M4 §7.4)。システムは推奨しないため、選択は必ず外から渡される。 */
export interface RepresentativeSelectionInput {
  groupValueConcept: ValueConcept;
  selectedMethodId: string;
  /** 変更理由。必須(デフォルト値を設けない)。 */
  reason: string;
  /** 前年度に採用した手法(顧客提供の事実)。初年度は未指定。 */
  priorYearMethodId?: string;
}

export interface ValuationPipelineOptions {
  /** assessment-pipelineのDepthDecisionでdepth==="deep_dive"だったMaterialIssueのID一覧。 */
  materialIssueIds: string[];
  deepDiveConfigForMaterialIssue: (materialIssueId: string) => DeepDiveConfig;
  /**
   * 代表値の選択(M4 §7.4)。未選択のMaterialIssueにはundefinedを返す。
   * 選択があると、手法変更時に前年度手法での再計算値が並記される(構想書9.3)。
   */
  representativeSelectionForMaterialIssue?: (materialIssueId: string) => RepresentativeSelectionInput | undefined;
  decompositionVersions: M4DecompositionVersions;
  idSequence: () => string;
  now: string;
  /**
   * モンテカルロの乱数源。省略時は Math.random。
   * シードを保存しておけば、この run を後から同じ結果で再現できる(monetization/rng.ts)。
   */
  rng?: () => number;
}

export interface ValuationPipelineResult {
  valuationRecordsByMaterialIssue: Record<string, ValuationRecord[]>;
  divergenceDecompositions: DivergenceDecomposition[];
  /**
   * 代表値選択の結果ステータス(MaterialIssueId → 結果)。
   * 前年度手法での再計算ができなかった場合(手法セットから消えている等)、
   * 画面がその事実を表示できるように理由を持ち回る。推定で埋めない(D-15)。
   */
  representativeSelectionStatus: Record<string, RepresentativeValueSelectionResult>;
  assumptionEntries: AssumptionEntry[];
}

export function runValuationPipeline(options: ValuationPipelineOptions): ValuationPipelineResult {
  const assumptionEntries: AssumptionEntry[] = [];
  const valuationRecordsByMaterialIssue: Record<string, ValuationRecord[]> = {};
  const divergenceDecompositions: DivergenceDecomposition[] = [];
  const representativeSelectionStatus: Record<string, RepresentativeValueSelectionResult> = {};

  for (const materialIssueId of options.materialIssueIds) {
    const quantityConfigs = quantitiesInDeepDiveConfig(options.deepDiveConfigForMaterialIssue(materialIssueId));
    const materialIssueRecords: ValuationRecord[] = [];

    for (const deepDiveConfig of quantityConfigs) {
      const groups = buildValuationRecords({
        physicalQuantityId: deepDiveConfig.physicalQuantityId,
        input: deepDiveConfig.input,
        config: deepDiveConfig.config,
        calibration: deepDiveConfig.calibration,
        plugins: deepDiveConfig.plugins,
        officialAggregates: deepDiveConfig.officialAggregates,
        rng: options.rng,
        versions: {
          calibrationSetVersion: deepDiveConfig.calibrationSetVersion,
          fitnessTierThresholdVersion: deepDiveConfig.fitnessTierThresholdVersion,
          aopMappingVersion: options.decompositionVersions.aopMappingVersion,
        },
      });
      const quantityRecords: ValuationRecord[] = [];

      for (const group of groups) {
        const reconciliationPayload = deriveM3ReconciliationCheckPayload(
          group,
          deepDiveConfig.reconciliationFunctionVersion
        );
        const reconciliationEntryId = reconciliationPayload
          ? (() => {
              const entry = buildAssumptionEntry(
                options.idSequence(),
                options.now,
                "M3",
                group.methodId,
                reconciliationPayload
              );
              assumptionEntries.push(entry);
              return entry.id;
            })()
          : null;

        for (const record of group.records) {
          const calibrationEntry = buildAssumptionEntry(
            options.idSequence(),
            options.now,
            "M3",
            record.id,
            deriveM3CoefficientCalibrationPayload(record.geographicCalibration, deepDiveConfig.calibrationSetVersion)
          );
          assumptionEntries.push(calibrationEntry);

          const compositeScore = record.transferFitness.dimensions
            ? computeFitnessTier(record.transferFitness.dimensions).compositeScore
            : null;
          const fitnessEntry = buildAssumptionEntry(
            options.idSequence(),
            options.now,
            "M3",
            record.id,
            deriveM3FitnessTierPayload(record.transferFitness.tier, compositeScore)
          );
          assumptionEntries.push(fitnessEntry);

          const entryIds = [calibrationEntry.id, fitnessEntry.id];
          if (reconciliationEntryId) entryIds.push(reconciliationEntryId);
          const mappingPayload = deriveM3InputMappingPayload(record);
          if (mappingPayload) {
            const mappingEntry = buildAssumptionEntry(options.idSequence(), options.now, "M3", record.id, mappingPayload);
            assumptionEntries.push(mappingEntry);
            entryIds.push(mappingEntry.id);
          }
          const financialEffectPayload = deriveM3CorporateFinancialEffectPayload(record);
          if (financialEffectPayload) {
            const financialEntry = buildAssumptionEntry(
              options.idSequence(),
              options.now,
              "M3",
              record.id,
              financialEffectPayload
            );
            assumptionEntries.push(financialEntry);
            entryIds.push(financialEntry.id);
          }
          quantityRecords.push({ ...record, assumptionEntryIds: entryIds });
        }
      }
      materialIssueRecords.push(...quantityRecords);

      // 単一手法のLIME3パイロットではM4を起動しない。複数手法でも物理量を跨いで比較しない。
      const isSingleMethodExpansionPilot =
        groups.length === 1 && ["lime3-pollution", "lime3-waste", "lime3-land-use"].includes(groups[0].methodId);
      if (isSingleMethodExpansionPilot || quantityRecords.length < 2) continue;
      const decomposition = buildDivergenceDecomposition({
        id:
          quantityConfigs.length === 1
            ? `dd-${materialIssueId}`
            : `dd-${materialIssueId}-${deepDiveConfig.physicalQuantityId}`,
        targetPhysicalQuantityId: deepDiveConfig.physicalQuantityId,
        siteId: deepDiveConfig.input.siteId,
        records: quantityRecords,
        versions: options.decompositionVersions,
      });
      for (const group of decomposition.groups) {
        for (const pairwise of group.pairwiseDecompositions) {
          const entry = buildAssumptionEntry(
            options.idSequence(),
            options.now,
            "M4",
            decomposition.id,
            deriveM4DecompositionPayload(pairwise, options.decompositionVersions)
          );
          assumptionEntries.push(entry);
        }
      }

      let decompositionWithSelection = decomposition;
      // 現行の代表値操作はMaterialIssue単位。複数物理量で曖昧になるため適用しない。
      const selectionInput =
        quantityConfigs.length === 1 ? options.representativeSelectionForMaterialIssue?.(materialIssueId) : undefined;
      if (selectionInput) {
        const group = decomposition.groups.find((entry) => entry.valueConcept === selectionInput.groupValueConcept);
        const groupRecords = quantityRecords.filter((record) => record.valueConcept === selectionInput.groupValueConcept);
        if (group && groupRecords.length > 0) {
          const result = buildRepresentativeValueSelection({
            groupValueConcept: selectionInput.groupValueConcept,
            records: groupRecords,
            selectedMethodId: selectionInput.selectedMethodId,
            reason: selectionInput.reason,
            priorYearMethodId: selectionInput.priorYearMethodId,
          });
          const entry = buildAssumptionEntry(
            options.idSequence(),
            options.now,
            "M4",
            decomposition.id,
            deriveM4RepresentativeValueSelectionPayload(result.selection)
          );
          assumptionEntries.push(entry);
          decompositionWithSelection = {
            ...decomposition,
            representativeValueSelection: result.selection,
            assumptionEntryIds: [...decomposition.assumptionEntryIds, entry.id],
          };
          representativeSelectionStatus[materialIssueId] = result;
        }
      }
      divergenceDecompositions.push(decompositionWithSelection);
    }
    valuationRecordsByMaterialIssue[materialIssueId] = materialIssueRecords;
  }

  return {
    valuationRecordsByMaterialIssue,
    divergenceDecompositions,
    representativeSelectionStatus,
    assumptionEntries,
  };
}
