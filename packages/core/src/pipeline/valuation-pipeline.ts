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
import {
  buildAssumptionEntry,
  deriveM3CoefficientCalibrationPayload,
  deriveM3FitnessTierPayload,
  deriveM3ReconciliationCheckPayload,
  deriveM4DecompositionPayload,
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

export interface DeepDiveConfig {
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

export interface ValuationPipelineOptions {
  /** assessment-pipelineのDepthDecisionでdepth==="deep_dive"だったMaterialIssueのID一覧。 */
  materialIssueIds: string[];
  deepDiveConfigForMaterialIssue: (materialIssueId: string) => DeepDiveConfig;
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
  assumptionEntries: AssumptionEntry[];
}

export function runValuationPipeline(options: ValuationPipelineOptions): ValuationPipelineResult {
  const assumptionEntries: AssumptionEntry[] = [];
  const valuationRecordsByMaterialIssue: Record<string, ValuationRecord[]> = {};
  const divergenceDecompositions: DivergenceDecomposition[] = [];

  for (const materialIssueId of options.materialIssueIds) {
    const deepDiveConfig = options.deepDiveConfigForMaterialIssue(materialIssueId);

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
        // AoP正規化対応表はM3(aopCodeの付与)とM4(グループ化)が共有する1つの表なので、
        // 分解側の版をそのまま使う。2つに分かれると対応表の版が食い違いうる。
        aopMappingVersion: options.decompositionVersions.aopMappingVersion,
      },
    });

    const records: ValuationRecord[] = [];

    for (const group of groups) {
      const reconciliationPayload = deriveM3ReconciliationCheckPayload(group, deepDiveConfig.reconciliationFunctionVersion);
      const reconciliationEntryId = reconciliationPayload
        ? (() => {
            const entry = buildAssumptionEntry(options.idSequence(), options.now, "M3", group.methodId, reconciliationPayload);
            assumptionEntries.push(entry);
            return entry.id;
          })()
        : null;

      for (const record of group.records) {
        const calibrationPayload = deriveM3CoefficientCalibrationPayload(
          record.geographicCalibration,
          deepDiveConfig.calibrationSetVersion
        );
        const calibrationEntry = buildAssumptionEntry(options.idSequence(), options.now, "M3", record.id, calibrationPayload);
        assumptionEntries.push(calibrationEntry);

        const compositeScore = record.transferFitness.dimensions
          ? computeFitnessTier(record.transferFitness.dimensions).compositeScore
          : null;
        const fitnessPayload = deriveM3FitnessTierPayload(record.transferFitness.tier, compositeScore);
        const fitnessEntry = buildAssumptionEntry(options.idSequence(), options.now, "M3", record.id, fitnessPayload);
        assumptionEntries.push(fitnessEntry);

        const entryIds = [calibrationEntry.id, fitnessEntry.id];
        if (reconciliationEntryId) {
          entryIds.push(reconciliationEntryId);
        }
        records.push({ ...record, assumptionEntryIds: entryIds });
      }
    }

    valuationRecordsByMaterialIssue[materialIssueId] = records;

    const decomposition = buildDivergenceDecomposition({
      id: `dd-${materialIssueId}`,
      targetPhysicalQuantityId: deepDiveConfig.physicalQuantityId,
      siteId: deepDiveConfig.input.siteId,
      records,
      versions: options.decompositionVersions,
    });

    for (const group of decomposition.groups) {
      for (const pairwise of group.pairwiseDecompositions) {
        const payload = deriveM4DecompositionPayload(pairwise, options.decompositionVersions);
        const entry = buildAssumptionEntry(options.idSequence(), options.now, "M4", decomposition.id, payload);
        assumptionEntries.push(entry);
      }
    }

    divergenceDecompositions.push(decomposition);
  }

  return { valuationRecordsByMaterialIssue, divergenceDecompositions, assumptionEntries };
}
