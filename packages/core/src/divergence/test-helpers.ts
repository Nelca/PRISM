/**
 * M4のテスト全体で使う ValuationRecord フィクスチャ組み立てヘルパー。
 * 本番コードからは参照しない(テスト専用)。
 */

import type { AoPCode, DiscountRateStatus, ExchangeAmount, ValueConcept, WelfareAmount } from "../types/common";
import { exchangeAmount, welfareAmount } from "../types/common";
import type { Distribution, QuantileRange } from "../types/common";
import type {
  ExchangeValuationRecord,
  GeographicCalibrationRecord,
  TransferFitness,
  ValuationRecord,
  WelfareValuationRecord,
} from "../types/valuation";

export const IDENTITY_CALIBRATION: GeographicCalibrationRecord = {
  pppSource: "test",
  pppValue: 1,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  sourceRegion: "JP",
  targetRegion: "JP",
  deflator: 1,
  relativePriceEscalationRate: 1,
  elapsedYears: 0,
  areaScaling: 1,
};

export interface ValuationRecordFixtureOptions {
  methodId: string;
  centralValue: number;
  valueConcept?: ValueConcept;
  aopCode?: AoPCode;
  discountRate?: number | null;
  discountRateStatus?: DiscountRateStatus;
  geographicCalibration?: GeographicCalibrationRecord;
  transferFitness?: TransferFitness;
  parameterUncertainty?: Distribution;
  quantileRange?: QuantileRange;
}

export function makeValuationRecord(
  options: ValuationRecordFixtureOptions & { valueConcept: "exchange" }
): ExchangeValuationRecord;
export function makeValuationRecord(
  options: ValuationRecordFixtureOptions & { valueConcept?: "welfare" }
): WelfareValuationRecord;
export function makeValuationRecord(options: ValuationRecordFixtureOptions): ValuationRecord {
  const valueConcept = options.valueConcept ?? "welfare";

  const common = {
    id: `vr-${options.methodId}`,
    methodId: options.methodId,
    methodVersion: "1.0.0",
    physicalQuantityId: "pq-1",
    siteId: "site-042",
    aopCode: options.aopCode ?? "human_health",
    aopSourceLabel: "test",
    aopMappingConfidence: "high" as const,
    quantileRange: options.quantileRange ?? {
      p5: options.centralValue * 0.8,
      p50: options.centralValue,
      p95: options.centralValue * 1.2,
    },
    parameterUncertainty: options.parameterUncertainty ?? { kind: "lognormal" as const, mu: 0, sigma: 0.1 },
    transferFitness: options.transferFitness ?? { tier: "not_applicable" as const },
    discountRate: options.discountRate ?? null,
    discountRateStatus: options.discountRateStatus ?? "no_time_dimension",
    geographicCalibration: options.geographicCalibration ?? IDENTITY_CALIBRATION,
    scopeExclusions: [] as string[],
    recalculability: { endpointBreakdownPublished: false, damageTimeProfilePublished: false },
    assumptionEntryIds: [] as string[],
    recalculationHash: "placeholder:test",
  };

  if (valueConcept === "exchange") {
    return { ...common, valueConcept: "exchange", centralValue: exchangeAmount(options.centralValue) };
  }
  return { ...common, valueConcept: "welfare", centralValue: welfareAmount(options.centralValue) };
}

export function unwrapAmount(value: ExchangeAmount | WelfareAmount): number {
  return value as unknown as number;
}
