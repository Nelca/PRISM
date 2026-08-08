/**
 * UIから追加された任意の拠点をM3(深掘り評価)〜M7(開示検証)まで通すための汎用ビルダー。
 * lib/demo/company.tsは架空企業「東海化成」site-042専用の固定データなので変更しない。
 * ここでは同じ形のレコードを、フォーム入力(またはデフォルト値)から任意の拠点向けに組み立てる。
 *
 * M3の評価手法(packages/core/src/monetization/registry.ts)は現状waterカテゴリの
 * 3手法のみが実装されているため、新規拠点もwaterカテゴリで評価する。
 */

import { ALL_PLUGINS } from "@core/monetization/registry";
import { exchangeAmount } from "@core/types/common";
import type { Site } from "@core/types/site";
import type { DisclosureClaim } from "@core/types/disclosure";
import type { BaselineNpvInput } from "@core/types/financial-bridge";
import type { DeepDiveConfig } from "@core/pipeline/valuation-pipeline";
import { DEEP_DIVE_CALIBRATION } from "./company";
import type { CountermeasureCandidate } from "./company";
import type { UserSiteDeepDiveParams } from "./site-entry";

export const DEFAULT_DEEP_DIVE_PARAMS: UserSiteDeepDiveParams = {
  physicalQuantity: 10_000,
  unit: "m3",
  unitReplacementCost: 500,
  investmentCostInitial: 20_000_000,
  investmentCostRecurring: 1_000_000,
  baselineNpvValue: 500_000_000,
  approvalThresholdValue: 510_000_000,
  forcePromote: true,
};

export function buildUserDeepDiveConfig(siteId: string, params: UserSiteDeepDiveParams): DeepDiveConfig {
  return {
    physicalQuantityId: `pq-${siteId}-water-2027`,
    input: {
      category: "water",
      physicalQuantity: params.physicalQuantity,
      unit: params.unit,
      siteId,
      sourceRegion: "JP",
      targetRegion: "JP",
    },
    config: {
      depth: "deep_dive",
      unitReplacementCost: params.unitReplacementCost,
      externalValueFactors: {
        "lime3-water": 28_500,
        "ifvi-vfnutrition": 1.35,
        "ifvi-vfdisease": 1.05,
        "ifvi-vfes": 1.62,
        "ifvi-vfaccess": 0.34,
      },
      vfesFitnessDimensions: {
        ecologicalFit: 0.75,
        socioeconomicFit: 0.68,
        serviceDefinitionFit: 0.85,
        temporalDistance: 0.6,
        spatialScaleFit: 0.7,
      },
    },
    calibration: DEEP_DIVE_CALIBRATION,
    plugins: ALL_PLUGINS,
    calibrationSetVersion: "ifvi-water-consumption-v1",
    reconciliationFunctionVersion: "ifvi-reconciliation-v1",
    fitnessTierThresholdVersion: "fitness-tier-v1",
  };
}

export function buildUserBaselineNpv(params: UserSiteDeepDiveParams): BaselineNpvInput {
  return { value: params.baselineNpvValue, discountRate: 0.06, horizon: 10, source: "manual_entry" };
}

/**
 * 4対策案(reduction/avoidance/transfer/acceptance)をフォーム入力から比例的に導出する。
 * reductionはbuildUserCountermeasures(旧実装)と同じ式(回避量=物理量×単価×0.7)を維持し、
 * 他3案はreductionを基準に投資額・回避量をスケールした特性を持たせる(M6の対策比較用)。
 */
export function buildUserCountermeasureCandidates(
  siteId: string,
  replacementCostRecordId: string,
  params: UserSiteDeepDiveParams
): CountermeasureCandidate[] {
  const reductionAvoided = Math.round(params.physicalQuantity * params.unitReplacementCost * 0.7);
  const avoidanceAvoidedYear0 = Math.round(reductionAvoided * 0.5);
  const avoidanceAvoidedYear1 = Math.round(reductionAvoided * 1.15);
  const transferAvoided = Math.round(reductionAvoided * 0.3);

  return [
    {
      key: "reduction",
      label: "取水設備の効率化投資",
      avoidedPhysicalQuantity: params.physicalQuantity,
      countermeasure: {
        type: "reduction",
        targetSiteId: siteId,
        investmentCost: { initial: params.investmentCostInitial, recurring: params.investmentCostRecurring },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(reductionAvoided), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(reductionAvoided), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "avoidance",
      label: "調達先の変更(水源の多様化)",
      avoidedPhysicalQuantity: Math.round(params.physicalQuantity * 1.1),
      countermeasure: {
        type: "avoidance",
        targetSiteId: siteId,
        investmentCost: { initial: Math.round(params.investmentCostInitial * 1.8), recurring: Math.round(params.investmentCostRecurring * 0.6) },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(avoidanceAvoidedYear0), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(avoidanceAvoidedYear1), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "transfer",
      label: "自然リスク保険契約",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "transfer",
        targetSiteId: siteId,
        investmentCost: { initial: 0, recurring: Math.round(params.investmentCostRecurring * 1.5) },
        avoidedNatureCost: [
          { year: 0, amount: exchangeAmount(transferAvoided), sourceValuationRecordId: replacementCostRecordId },
          { year: 1, amount: exchangeAmount(transferAvoided), sourceValuationRecordId: replacementCostRecordId },
        ],
      },
    },
    {
      key: "acceptance",
      label: "対策を実施せず監視を継続",
      avoidedPhysicalQuantity: 0,
      countermeasure: {
        type: "acceptance",
        targetSiteId: siteId,
        investmentCost: { initial: 0, recurring: Math.round(params.investmentCostRecurring * 0.2) },
        avoidedNatureCost: [],
      },
    },
  ];
}

export function buildUserDisclosureClaim(site: Site, params: UserSiteDeepDiveParams): DisclosureClaim {
  return {
    id: `claim-${site.id}-2027`,
    sourceDocument: "統合報告書2027(デモ入力)",
    sourcePageOrSection: "—",
    rawText:
      params.disclosureClaimText?.trim() || `当社は2030年までに${site.name}における水使用量を20%削減することを目指します。`,
    claimType: "future_commitment",
    extractedMetadata: {
      category: "water",
      quantityMentioned: { value: 20, unit: "%" },
      periodMentioned: { startYear: 2027, endYear: 2030 },
      scopeMentioned: site.name,
    },
    extractionConfidence: "high",
  };
}
