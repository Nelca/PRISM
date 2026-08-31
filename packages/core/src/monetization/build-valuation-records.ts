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
import { computeRecordHash } from "../ledger/recalculation-hash";

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

export class LicenseGateError extends Error {
  constructor(public readonly methodId: string, public readonly reason: "pending_review" | "expired") {
    super(`[${methodId}] ライセンス状態が${reason}のため算定を実行できません。`);
  }
}

/**
 * このValuationRecordの計算に実際に入ったパラメータ版(GAP-06)。
 * `recalculationHash`の入力になるため **Optionalにしない**(build-plan §4.2:
 * Optionalにしてよいのは「まだ確認していない外部データ」だけ)。
 */
export interface ValuationRecordVersions {
  /** 地理較正のパラメータセットの版(M3 D-3の監査対応要件)。 */
  calibrationSetVersion: string;
  /** 適合度ティア閾値の版(M3 D-5)。 */
  fitnessTierThresholdVersion: string;
  /** AoP正規化対応表の版(M4 §0.2、判断を伴う対応付けのため)。 */
  aopMappingVersion: string;
}

export interface BuildValuationRecordsOptions {
  physicalQuantityId: string;
  input: PhysicalQuantityInput;
  config: MethodConfig;
  plugins: MonetizationMethodPlugin[];
  versions: ValuationRecordVersions;
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
  /**
   * モンテカルロの乱数源。省略時は Math.random。
   * シード固定の生成器(rng.ts の createSeededRng)を渡すと結果が再現可能になり、
   * 呼び出し側は「同じシードから同じValuationRecordが出る」ことに依存できる。
   */
  rng?: () => number;
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

function buildValuationRecordFromOutput(
  output: MethodOutput,
  methodId: string,
  methodVersion: string,
  physicalQuantityId: string,
  input: PhysicalQuantityInput,
  factorResolution: MethodConfig["factorResolution"],
  currencyConversion: MethodConfig["currencyConversion"],
  corporateFinancialEffect: MethodConfig["corporateFinancialEffect"],
  siteId: string,
  calibration: GeographicCalibrationRecord,
  versions: ValuationRecordVersions,
  rng?: () => number
): ValuationRecord {
  const financialEffectSnapshot = methodId === "company-exchange-value" ? corporateFinancialEffect : undefined;
  // 較正が不要な値(すでに現地通貨で表現された値)はスキップする(D-127・D-128)。
  const factorCurrency = factorResolution?.factor.currency ?? "JPY";
  let currencyAdjustedValue = output.centralValue;
  if (factorCurrency !== "JPY") {
    if (
      !currencyConversion ||
      currencyConversion.fromCurrency !== factorCurrency ||
      currencyConversion.toCurrency !== "JPY" ||
      !Number.isFinite(currencyConversion.rate) ||
      currencyConversion.rate <= 0
    ) {
      throw new Error(`[${methodId}] ${factorCurrency}建て係数には明示的なJPY通貨換算が必要です。`);
    }
    currencyAdjustedValue *= currencyConversion.rate;
  }
  const centralValue = output.skipGeographicCalibration
    ? currencyAdjustedValue
    : applyGeographicCalibration(currencyAdjustedValue, calibration);
  const quantileRange =
    output.parameterUncertainty.kind === "not_available"
      ? null
      : combineUncertainty(centralValue, output.parameterUncertainty, output.transferFitness, { rng });

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
    transferFitness: output.transferFitness,
    discountRate: output.discountRate,
    discountRateStatus: output.discountRateStatus,
    geographicCalibration: calibration,
    scopeExclusions: output.scopeExclusions,
    inputSnapshot: input,
    factorSnapshot: factorResolution?.factor,
    mappingSnapshot: factorResolution
      ? {
          mappingId: factorResolution.mappingId,
          mappingVersion: factorResolution.mappingVersion,
          mappingHash: factorResolution.mappingHash,
        }
      : undefined,
    currencyConversion: factorCurrency === "JPY" ? undefined : currencyConversion,
    financialEffectSnapshot,
    recalculability: deriveRecalculability(output),
    assumptionEntryIds: [] as string[], // パイプライン層(valuation-pipeline.ts)が実配線する
    /**
     * このレコードを再現するのに必要なものだけを入れる(GAP-06)。
     * 較正パラメータは版番号だけでなく実際の値も含める。同じ版のまま値が差し替わった場合に
     * ハッシュが変わらないと、監査で「同じ条件で計算した」と誤って読める。
     */
    recalculationHash: computeRecordHash("vr", {
      methodId,
      methodVersion,
      physicalQuantityId,
      siteId,
      input,
      factorResolution,
      currencyConversion,
      corporateFinancialEffect: financialEffectSnapshot,
      calibration,
      versions,
    }),
  };

  if (output.valueConcept === "exchange") {
    if (output.parameterUncertainty.kind === "not_available" || quantileRange === null) {
      throw new Error(`[${methodId}] 企業財務へ接続する交換価値には不確実性分布が必要です。`);
    }
    return {
      ...common,
      parameterUncertainty: output.parameterUncertainty,
      quantileRange,
      valueConcept: "exchange",
      centralValue: exchangeAmount(centralValue),
    };
  }
  return output.parameterUncertainty.kind === "not_available"
    ? {
        ...common,
        parameterUncertainty: output.parameterUncertainty,
        quantileRange: null,
        valueConcept: "welfare",
        centralValue: welfareAmount(centralValue),
      }
    : {
        ...common,
        parameterUncertainty: output.parameterUncertainty,
        quantileRange: quantileRange!,
        valueConcept: "welfare",
        centralValue: welfareAmount(centralValue),
      };
}

export function buildValuationRecordsForPlugin(
  plugin: MonetizationMethodPlugin,
  options: Omit<BuildValuationRecordsOptions, "plugins">
): ValuationRecordGroup {
  const { input, config, physicalQuantityId, calibration: calibrationParams, officialAggregates, versions, rng } = options;

  if (!plugin.supportedCategories.includes(input.category)) {
    throw new Error(`[${plugin.methodId}] category=${input.category} はサポート対象外です。`);
  }
  if (plugin.licenseMode === "pending_review" || config.factorResolution?.factor.licenseMode === "pending_review") {
    throw new LicenseGateError(plugin.methodId, "pending_review");
  }
  const validUntil = config.factorResolution?.factor.licenseValidUntil;
  // YYYY-MM-DDはUTCの当日0時に解釈されるため、そのままだと有効期限日の開始時点で失効する。
  // LIME3契約は日本の暦日終端まで有効として実行時ゲートする。
  const validUntilEnd = validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil)
    ? new Date(`${validUntil}T23:59:59.999+09:00`).getTime()
    : validUntil
      ? new Date(validUntil).getTime()
      : undefined;
  if (validUntilEnd !== undefined && (!Number.isFinite(validUntilEnd) || validUntilEnd < Date.now())) {
    throw new LicenseGateError(plugin.methodId, "expired");
  }

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
      input,
      config.factorResolution,
      config.currencyConversion,
      config.corporateFinancialEffect,
      input.siteId,
      calibration,
      versions,
      rng
    );
  });

  return { methodId: plugin.methodId, records, reconciledAggregate };
}

export function buildValuationRecords(options: BuildValuationRecordsOptions): ValuationRecordGroup[] {
  return options.plugins.map((plugin) => buildValuationRecordsForPlugin(plugin, options));
}
