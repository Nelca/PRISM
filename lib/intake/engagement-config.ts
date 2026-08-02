/**
 * 実データ受け入れ②③:エンゲージメント設定JSON。
 *
 * 拠点一覧(CSV、顧客提供)とは異なり、このJSONはPRISM運用チームが顧客ヒアリングをもとに
 * 作成する想定のデータ(M3の深掘り設定・M6の意思決定入力・M7の開示claim)。
 * 承認閾値(approvalThreshold)は"pending"を許容する(M6 D-10:未入力を明示的な状態として
 * 扱う。担当者が閾値を把握していない場合でも先に進められる)。
 *
 * Countermeasureの`avoidedNatureCost`は、ValuationRecordのID(M3実行時に動的に生成される)
 * ではなく`sourceValuationMethodId`(手法ID、例 "replacement-cost")で参照する。
 * 実際のIDへの解決はload-company-dataset.ts(M3実行後)が行う。
 */

import { exchangeAmount } from "@core/types/common";
import type { ExchangeAmount, ImpactCategory } from "@core/types/common";
import type { AssessmentDepth } from "@core/types/assessment";
import type { ApprovalThreshold, BindingMechanism, CountermeasureType } from "@core/types/decision";
import type { ClaimType } from "@core/types/disclosure";

export interface EngagementCountermeasureConfig {
  type: CountermeasureType;
  targetSiteId: string;
  investmentCost: { initial: number; recurring: number };
  /** amountはExchangeAmount(M6のCountermeasure.avoidedNatureCostと同じ型)。JSON上は素の数値。 */
  avoidedNatureCost: { year: number; amount: ExchangeAmount; sourceValuationMethodId: string }[];
}

export interface EngagementDisclosureClaimConfig {
  id: string;
  sourceDocument: string;
  sourcePageOrSection: string;
  rawText: string;
  claimType: ClaimType;
  category: ImpactCategory | null;
  quantityValue?: number;
  quantityUnit?: string;
  periodStartYear?: number;
  periodEndYear?: number;
  scopeMentioned?: string | null;
  extractionConfidence: "high" | "low";
}

export interface EngagementConfig {
  physicalQuantityId: string;
  deepDive: {
    category: ImpactCategory;
    physicalQuantity: number;
    unit: string;
    siteId: string;
    sourceRegion: string;
    targetRegion: string;
  };
  methodConfig: {
    depth: AssessmentDepth;
    unitReplacementCost?: number;
    externalValueFactors?: Record<string, number>;
    vfesFitnessDimensions?: {
      ecologicalFit: number;
      socioeconomicFit: number;
      serviceDefinitionFit: number;
      temporalDistance: number;
      spatialScaleFit: number;
    };
  };
  calibration: {
    pppSource: string;
    pppValue: number;
    incomeElasticity: number;
    sourceIncomeLevel: number;
    targetIncomeLevel: number;
    deflator: number;
    relativePriceEscalationRate: number;
    elapsedYears: number;
    areaScaling: number;
  };
  baselineNpv: { value: number; discountRate: number; horizon: number; source: "manual_entry" | "csv_upload" };
  approvalThreshold: "pending" | ApprovalThreshold;
  bindingMechanism: BindingMechanism;
  countermeasures: EngagementCountermeasureConfig[];
  disclosureClaims: EngagementDisclosureClaimConfig[];
}

const VALID_CATEGORIES: ImpactCategory[] = ["climate", "water", "pollution"];
const VALID_DEPTHS: AssessmentDepth[] = ["screening", "deep_dive"];
const VALID_BINDING_KINDS = ["weak_reference", "npv_formula_replacement", "budget_allocation", "procurement_contract_clause"];
const VALID_CLAIM_TYPES: ClaimType[] = ["state", "quantitative", "trend", "comparative", "net_amount", "future_commitment"];

export interface EngagementConfigParseResult {
  config: EngagementConfig | null;
  errors: string[];
}

export function parseEngagementConfig(jsonText: string): EngagementConfigParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { config: null, errors: [`engagement-config.jsonの構文が不正です: ${(e as Error).message}`] };
  }

  const errors: string[] = [];
  const obj = parsed as Record<string, unknown>;

  if (typeof obj !== "object" || obj === null) {
    return { config: null, errors: ["engagement-config.jsonのトップレベルはオブジェクトである必要があります。"] };
  }

  if (typeof obj.physicalQuantityId !== "string" || !obj.physicalQuantityId) {
    errors.push("physicalQuantityIdが必須です。");
  }

  const deepDive = obj.deepDive as EngagementConfig["deepDive"] | undefined;
  if (!deepDive) {
    errors.push("deepDiveが必須です。");
  } else if (!VALID_CATEGORIES.includes(deepDive.category)) {
    errors.push(`deepDive.categoryが不正です("${deepDive.category}")。climate/water/pollutionのいずれかです。`);
  }

  const methodConfig = obj.methodConfig as EngagementConfig["methodConfig"] | undefined;
  if (!methodConfig) {
    errors.push("methodConfigが必須です。");
  } else if (!VALID_DEPTHS.includes(methodConfig.depth)) {
    errors.push(`methodConfig.depthが不正です("${methodConfig.depth}")。screening/deep_diveのいずれかです。`);
  }

  if (!obj.calibration) {
    errors.push("calibrationが必須です。");
  }

  if (!obj.baselineNpv) {
    errors.push("baselineNpvが必須です。");
  }

  const approvalThresholdRaw = obj.approvalThreshold;
  if (approvalThresholdRaw !== "pending") {
    const t = approvalThresholdRaw as { value?: unknown; source?: unknown } | undefined;
    if (!t || typeof t.value !== "number") {
      errors.push('approvalThresholdは"pending"、または{ value: number, source: string }である必要があります。');
    }
  }

  const bindingMechanism = obj.bindingMechanism as { kind?: string } | undefined;
  if (!bindingMechanism || !VALID_BINDING_KINDS.includes(bindingMechanism.kind ?? "")) {
    errors.push(`bindingMechanism.kindが不正です("${bindingMechanism?.kind}")。`);
  }

  interface RawCountermeasure {
    type: CountermeasureType;
    targetSiteId: string;
    investmentCost: { initial: number; recurring: number };
    avoidedNatureCost: { year: number; amount: number; sourceValuationMethodId: string }[];
  }
  const countermeasuresRaw = obj.countermeasures as RawCountermeasure[] | undefined;
  if (!Array.isArray(countermeasuresRaw) || countermeasuresRaw.length === 0) {
    errors.push("countermeasuresは1件以上の配列である必要があります。");
  }

  const disclosureClaims = obj.disclosureClaims as EngagementDisclosureClaimConfig[] | undefined;
  if (!Array.isArray(disclosureClaims)) {
    errors.push("disclosureClaimsは配列である必要があります(0件でも可)。");
  } else {
    disclosureClaims.forEach((claim, i) => {
      if (!VALID_CLAIM_TYPES.includes(claim.claimType)) {
        errors.push(`disclosureClaims[${i}].claimTypeが不正です("${claim.claimType}")。`);
      }
    });
  }

  if (errors.length > 0) {
    return { config: null, errors };
  }

  // ここまでの検証を通過していれば、各フィールドは想定の形をしていることが保証されている。
  // ExchangeAmountが必要な箇所(approvalThreshold.value・avoidedNatureCost[].amount)は、
  // 素の数値を`obj`から取り出したままキャストするのではなく、exchangeAmount()で明示的に
  // 構築する(D-11:branded typeはヘルパー関数経由で構築する、という規律をここでも守る)。
  const approvalThreshold: "pending" | ApprovalThreshold =
    approvalThresholdRaw === "pending"
      ? "pending"
      : {
          value: exchangeAmount((approvalThresholdRaw as { value: number }).value),
          source: (approvalThresholdRaw as { source: "manual_entry" | "csv_upload" }).source,
        };

  const countermeasures: EngagementCountermeasureConfig[] = countermeasuresRaw!.map((cm) => ({
    type: cm.type,
    targetSiteId: cm.targetSiteId,
    investmentCost: cm.investmentCost,
    avoidedNatureCost: cm.avoidedNatureCost.map((ac) => ({
      year: ac.year,
      amount: exchangeAmount(ac.amount),
      sourceValuationMethodId: ac.sourceValuationMethodId,
    })),
  }));

  const config: EngagementConfig = {
    physicalQuantityId: obj.physicalQuantityId as string,
    deepDive: deepDive!,
    methodConfig: methodConfig!,
    calibration: obj.calibration as EngagementConfig["calibration"],
    baselineNpv: obj.baselineNpv as EngagementConfig["baselineNpv"],
    approvalThreshold,
    bindingMechanism: bindingMechanism as BindingMechanism,
    countermeasures,
    disclosureClaims: disclosureClaims ?? [],
  };

  return { config, errors: [] };
}
