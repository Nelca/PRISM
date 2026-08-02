/**
 * M3の統合パイプライン:PhysicalQuantityInput → ValuationRecord[]
 * 参照元: docs/requirements/m3-monetization-engine.md(D-1〜D-8全体)
 *
 * 各プラグインの MethodOutput[](較正前)に対して、
 *   1. 地理較正(D-3、calibration.ts)を適用
 *   2. 層i×層iiの不確実性合成(D-4・D-7、uncertainty.ts)を適用
 *   3. reconciliation があれば整合性検証(D-2)を実行
 *   4. ValuationRecord を組み立てる
 * という順で処理する。
 */

import type {
  GeographicCalibrationRecord,
  MethodConfig,
  MethodOutput,
  MonetizationMethodPlugin,
  PhysicalQuantityInput,
  ValuationRecord,
} from "../types/valuation";
import { exchangeAmount, welfareAmount } from "../types/common";
import { applyGeographicCalibration } from "./calibration";
import { combineUncertainty } from "./uncertainty";

export class ReconciliationError extends Error {
  constructor(
    public readonly methodId: string,
    public readonly reconstructedAggregate: number,
    public readonly officialAggregate: number
  ) {
    super(
      `[${methodId}] 集計整合性検証に失敗しました。復元集計値(${reconstructedAggregate})が` +
        `公式集計値(${officialAggregate})と許容誤差を超えて食い違っています。` +
        "誤った分解を出すより出さない方針のため、この手法の結果は返しません(M3 D-2)。"
    );
  }
}

export interface BuildValuationRecordsOptions {
  physicalQuantityId: string;
  input: PhysicalQuantityInput;
  config: MethodConfig;
  plugins: MonetizationMethodPlugin[];
  /**
   * 地理較正パラメータ(sourceRegion/targetRegionはinputから取るため除く)。
   * D-3の監査対応要件により、PPP出典・η・デフレータ・相対価格上昇係数・面積スケーリングを明示する。
   */
  calibration: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion">;
  /**
   * 外部データ源がIFVI等の公式集計値も同時に提供している場合、それと突き合わせて
   * 整合性を検証する(D-2)。methodIdをキーとする。提供されない場合、その手法の
   * 検証はスキップされる(復元集計値の算出自体は常に行われるが、比較対象がないため)。
   */
  officialAggregates?: Record<string, number>;
}

export interface ValuationRecordGroup {
  methodId: string;
  records: ValuationRecord[];
  /** D-2:復元集計値。UIに常時表示する(公式集計値との一致を利用者が確認できるようにする)。 */
  reconciledAggregate?: number;
}

function deriveRecalculability(output: MethodOutput): ValuationRecord["recalculability"] {
  return {
    endpointBreakdownPublished: output.aopMappingConfidence !== "unmapped",
    damageTimeProfilePublished: output.discountRateStatus === "explicit",
  };
}

/**
 * 再計算ハッシュ(プレースホルダー)。M8の正式なハッシュ計算(パイプライン全体の版を
 * 横断的に含む、docs/requirements/m8-ledger-versioning.md §2)が実装されるまでの仮実装。
 * 少なくとも入力が変われば値が変わる程度の決定論的な文字列にしておく。
 */
function placeholderRecalculationHash(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return `placeholder:${(hash >>> 0).toString(16)}`;
}

function buildValuationRecordFromOutput(
  output: MethodOutput,
  methodId: string,
  methodVersion: string,
  physicalQuantityId: string,
  siteId: string,
  calibration: GeographicCalibrationRecord
): ValuationRecord {
  const centralValue = applyGeographicCalibration(output.centralValue, calibration);
  const quantileRange = combineUncertainty(centralValue, output.parameterUncertainty, output.transferFitness);

  const common = {
    id: `${methodId}-${physicalQuantityId}`,
    methodId,
    methodVersion,
    physicalQuantityId,
    siteId,
    aopCode: output.aopCode,
    aopSourceLabel: output.aopSourceLabel,
    aopMappingConfidence: output.aopMappingConfidence,
    metric: output.metric,
    cicesRef: output.cicesRef,
    quantileRange,
    parameterUncertainty: output.parameterUncertainty,
    transferFitness: output.transferFitness,
    discountRate: output.discountRate,
    discountRateStatus: output.discountRateStatus,
    geographicCalibration: calibration,
    scopeExclusions: output.scopeExclusions,
    recalculability: deriveRecalculability(output),
    assumptionEntryIds: [] as string[], // M8との実配線は本フェーズのスコープ外
    recalculationHash: placeholderRecalculationHash(`${methodId}:${physicalQuantityId}:${centralValue}`),
  };

  return output.valueConcept === "exchange"
    ? { ...common, valueConcept: "exchange", centralValue: exchangeAmount(centralValue) }
    : { ...common, valueConcept: "welfare", centralValue: welfareAmount(centralValue) };
}

export function buildValuationRecordsForPlugin(
  plugin: MonetizationMethodPlugin,
  options: Omit<BuildValuationRecordsOptions, "plugins">
): ValuationRecordGroup {
  const { input, config, physicalQuantityId, calibration: calibrationParams, officialAggregates } = options;

  const outputs = plugin.evaluate(input, config);

  const calibration: GeographicCalibrationRecord = {
    ...calibrationParams,
    sourceRegion: input.sourceRegion,
    targetRegion: input.targetRegion,
  };

  let reconciledAggregate: number | undefined;
  if (plugin.reconciliation) {
    reconciledAggregate = plugin.reconciliation.reconstruct(outputs);
    const officialAggregate = officialAggregates?.[plugin.methodId];
    if (officialAggregate !== undefined) {
      const diff = Math.abs(reconciledAggregate - officialAggregate);
      if (diff > plugin.reconciliation.tolerance) {
        throw new ReconciliationError(plugin.methodId, reconciledAggregate, officialAggregate);
      }
    }
  }

  const records = outputs.map((output) => {
    // 分解元を追跡できるよう {親手法ID}.{内訳ID} 形式にする(M4要件定義書2026-08-01追記)。
    // 単一内訳の手法(代替費用法・LIME3)は手法IDと同一のsubFactorIdを使うため、
    // methodId自体がそのまま親手法IDになる。
    const methodId = outputs.length > 1 ? `${plugin.methodId}.${output.subFactorId}` : plugin.methodId;
    return buildValuationRecordFromOutput(
      output,
      methodId,
      plugin.version,
      physicalQuantityId,
      input.siteId,
      calibration
    );
  });

  return { methodId: plugin.methodId, records, reconciledAggregate };
}

export function buildValuationRecords(options: BuildValuationRecordsOptions): ValuationRecordGroup[] {
  return options.plugins.map((plugin) => buildValuationRecordsForPlugin(plugin, options));
}
