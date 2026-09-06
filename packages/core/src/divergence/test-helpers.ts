/**
 * M4のテスト全体で使う ValuationRecord フィクスチャ組み立てヘルパー。
 * 本番コードからは参照しない(テスト専用)。
 */

import type { AoPCode, DiscountRateStatus, ExchangeAmount, ValueConcept, WelfareAmount } from "../types/common";
import { exchangeAmount, welfareAmount } from "../types/common";
import type { Distribution, QuantileRange } from "../types/common";
import type { ComparisonSubject } from "../types/comparison";
import type { MethodEvaluationTrace } from "../types/trace";
import type {
  ExchangeValuationRecord,
  GeographicCalibrationRecord,
  TransferFitness,
  ValuationRecord,
  WelfareValuationRecord,
} from "../types/valuation";
import { F3_THRESHOLD_DISABLED_VERSION, F8_THRESHOLD_DISABLED_VERSION } from "./mode-selection";
import { RECIPE_REGISTRY_VERSION } from "./recipes/registry";
import { SUBJECT_IDENTITY_RULE_VERSION } from "./comparability";
import { TOLERANCE_POLICY } from "./tolerance";

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

/**
 * 再計算ハッシュ(GAP-06)に入るパラメータ版のテスト用フィクスチャ。
 * 本番の版番号ではなく、テストで固定するためだけの値。
 */
export const TEST_VALUATION_VERSIONS = {
  calibrationSetVersion: "test-calibration-v1",
  fitnessTierThresholdVersion: "test-fitness-tier-v1",
  aopMappingVersion: "test-aop-mapping-v1",
};

export const TEST_DECOMPOSITION_VERSIONS = {
  algorithmVersion: "test-shapley-v1",
  cicesMatchLevel: "group",
  aopMappingVersion: "test-aop-mapping-v1",
  f3ThresholdVersion: "test-f3-v1",
  f8ThresholdVersion: "test-f8-v1",
};

export const TEST_DECISION_VERSIONS = {
  bindingMechanismDefinitionVersion: "test-binding-mechanism-v1",
};

/** 新経路(V2)の版フィクスチャ。F-3/F-8 は H-06 未承認のため無効化版を使う(T-02-9)。 */
export const TEST_DECOMPOSITION_VERSIONS_V2 = {
  algorithmVersion: "test-shapley-v2",
  cicesMatchLevel: "group",
  aopMappingVersion: "test-aop-mapping-v1",
  f3ThresholdVersion: F3_THRESHOLD_DISABLED_VERSION,
  f8ThresholdVersion: F8_THRESHOLD_DISABLED_VERSION,
  recipeRegistryVersion: RECIPE_REGISTRY_VERSION,
  toleranceVersion: TOLERANCE_POLICY.version,
  subjectRuleVersion: SUBJECT_IDENTITY_RULE_VERSION,
  pathwayMappingVersion: "test-pathway-mapping-v1",
};

/** 比較対象(§5.1)のテスト用フィクスチャ。既定は水・消費水・m³・年次2027・年間フロー。 */
export function makeComparisonSubject(overrides: Partial<ComparisonSubject> = {}): ComparisonSubject {
  return {
    id: "subject:pq-test-water-2027",
    physicalQuantityId: "pq-1",
    sourceRecordIds: [],
    category: "water",
    flow: { kind: "water", waterSource: "surface", waterUse: "consumption" },
    quantity: { value: 1, unit: "m3", measurementBoundary: "site" },
    location: { siteId: "site-042", region: "JP" },
    period: { kind: "annual", year: 2027 },
    timeBasis: "annual",
    boundary: { siteId: "site-042" },
    identityRuleVersion: SUBJECT_IDENTITY_RULE_VERSION,
    provenance: "demo_default",
    sourceHash: "test:subject",
    ...overrides,
  };
}

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
  /** 完成実装 §5.3:再生可能な計算トレース。新経路のテストで使う。 */
  trace?: MethodEvaluationTrace;
  methodVersion?: string;
  id?: string;
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
    id: options.id ?? `vr-${options.methodId}`,
    methodId: options.methodId,
    methodVersion: options.methodVersion ?? "1.0.0",
    trace: options.trace,
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
    inputSnapshot: {
      category: "water" as const,
      physicalQuantity: 1,
      unit: "m3",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
    },
  };

  if (valueConcept === "exchange") {
    return { ...common, valueConcept: "exchange", centralValue: exchangeAmount(options.centralValue) };
  }
  return { ...common, valueConcept: "welfare", centralValue: welfareAmount(options.centralValue) };
}

export function unwrapAmount(value: ExchangeAmount | WelfareAmount): number {
  return value;
}
