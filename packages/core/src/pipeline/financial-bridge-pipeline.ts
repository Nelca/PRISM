/**
 * パイプライン層:M5(財務接続)。
 * 参照元: docs/requirements/m5-financial-bridge.md、docs/roadmap/build-plan.md §5.6
 *
 * 他の4本(assessment / valuation / decision / disclosure)と同じ形で、
 * 「正しい順序で呼ぶ」「前段の出力を次段の入力形式に変換する」だけを担う。
 * 各モジュールの関数シグネチャ・型は変更しない。
 *
 * **AssumptionEntryを生成しない。**M8 D-1の記録要求の棚卸し(M1・M2・M3・M4・M6・M7)に
 * M5は含まれておらず、`AssumptionSourceModule` にも "M5" は存在しない。
 * M5は既存のValuationRecordと企業提供の財務データを組み替えるだけで、
 * 新しい判断を行わないため(判断が発生しないところに台帳エントリを作らない)。
 *
 * **構造制約(D-24):** 2つのブリッジは共通の親インターフェースを持たず、この関数も
 * 両者を合算しない。ブリッジ1は交換価値、ブリッジ2は厚生価値しか受け取らない
 * (branded typeにより、取り違えるとコンパイルエラーになる)。
 */

import { buildBridge1NatureAdjustedProfit } from "../financial-bridge/bridge1";
import { buildBridge2SocialCostView } from "../financial-bridge/bridge2";
import { computeInternalizationStatus } from "../financial-bridge/internalization-status";
import { computeNatureDebt } from "../financial-bridge/nature-debt";
import { computeComparisonTargets } from "../financial-bridge/comparison-targets";
import type { CompanyFinancials } from "../financial-bridge/comparison-targets";
import { exchangeAmount } from "../types/common";
import type { ExchangeAmount } from "../types/common";
import type { ImpactCategory } from "../types/common";
import type {
  Bridge1NatureAdjustedProfit,
  Bridge2SocialCostView,
  ComparisonTargets,
  InternalizationProbability,
  InternalizationStatus,
  NatureDebt,
  FinancialBridgeContributionSummary,
} from "../types/financial-bridge";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "../types/valuation";

export interface FinancialBridgePipelineOptions {
  /** 代表値として選ばれた交換価値レコード(M4 §7.4の選択結果)。 */
  exchangeRecord: ExchangeValuationRecord;
  /** 厚生価値レコード。存在しない場合はブリッジ2を生成しない。 */
  welfareRecord?: WelfareValuationRecord;

  /** 監査済み報告営業利益。企業提供・PRISMは検証しない(M5 D-1)。 */
  reportedOperatingProfit: ExchangeAmount;
  /** 既に炭素税・水利用料等の形で実際に支払われている額(企業提供、M5 D-3)。 */
  currentlyInternalizedCost: ExchangeAmount;
  /** 企業提供の既存減損テスト前提(閾値)。 */
  existingImpairmentThreshold: ExchangeAmount;
  financials: CompanyFinancials;

  /** 3シナリオへの主観確率(企業が設定、M5 D-4.3)。既定は均等割り。 */
  internalizationProbabilities: InternalizationProbability[];
  /** 企業提供の割引率(全社。M5 D-4.4)。 */
  discountRate: number;

  /** ブリッジ2の内部化率(厚生価値ビュー側、開示専用)。 */
  socialCostInternalizationRate?: number;

  /**
   * シナリオ別に異なる未内部化コストを使う場合に指定する(GAP-11・D-127)。
   * 指定が無いシナリオは`internalizationStatus.uninternalizedCost`にフォールバックする
   * (`computeNatureDebt()`の第4引数、後方互換)。
   */
  uninternalizedCostByScenario?: Partial<Record<InternalizationProbability["scenario"], ExchangeAmount>>;

  /** 複数カテゴリを1拠点の財務ブリッジへ集約する場合の内訳。指定時は単一レコード入力を置き換える。 */
  exchangeContributions?: FinancialBridgeExchangeContribution[];
}

export interface FinancialBridgeExchangeContribution {
  record: ExchangeValuationRecord;
  materialIssueId: string;
  category: ImpactCategory;
  alreadyInternalizedCost: ExchangeAmount;
  verifiedIncrementalBenefit: ExchangeAmount;
  amountBasis: "annual" | "one_time";
  doubleCountKey: string;
  internalizationProbabilities: InternalizationProbability[];
  uninternalizedCostByScenario?: Partial<Record<InternalizationProbability["scenario"], ExchangeAmount>>;
  sourceHash?: string;
  dataVersion?: string;
}

export interface FinancialBridgePipelineResult {
  bridge1: Bridge1NatureAdjustedProfit;
  /** 厚生価値レコードがない場合はnull。 */
  bridge2: Bridge2SocialCostView | null;
  internalizationStatus: InternalizationStatus;
  natureDebt: NatureDebt;
  comparisonTargets: ComparisonTargets;
  contributionBreakdown: FinancialBridgeContributionSummary[];
}

export function runFinancialBridgePipeline(options: FinancialBridgePipelineOptions): FinancialBridgePipelineResult {
  const contributions: FinancialBridgeExchangeContribution[] = options.exchangeContributions ?? [{
    record: options.exchangeRecord,
    materialIssueId: `legacy-${options.exchangeRecord.siteId}`,
    category: options.exchangeRecord.inputSnapshot?.category ?? "water",
    alreadyInternalizedCost: options.currentlyInternalizedCost,
    verifiedIncrementalBenefit: exchangeAmount(0),
    amountBasis: "annual",
    doubleCountKey: options.exchangeRecord.id,
    internalizationProbabilities: options.internalizationProbabilities,
    uninternalizedCostByScenario: options.uninternalizedCostByScenario,
  }];
  const duplicateKeys = contributions
    .map((entry) => entry.doubleCountKey)
    .filter((key, index, all) => all.indexOf(key) !== index);
  if (duplicateKeys.length > 0) {
    throw new Error(`財務ブリッジの二重計上防止キーが重複しています: ${[...new Set(duplicateKeys)].join(", ")}`);
  }

  const calculated = contributions.map((contribution) => {
    const status = computeInternalizationStatus(contribution.record.centralValue, contribution.alreadyInternalizedCost);
    const debt = computeNatureDebt(
      status.uninternalizedCost,
      contribution.internalizationProbabilities,
      options.discountRate,
      contribution.uninternalizedCostByScenario
    );
    return { contribution, status, debt };
  });

  const internalizationStatus: InternalizationStatus = {
    totalExternalCost: exchangeAmount(calculated.reduce((sum, entry) => sum + Number(entry.status.totalExternalCost), 0)),
    currentlyInternalizedCost: exchangeAmount(
      calculated.reduce((sum, entry) => sum + Number(entry.status.currentlyInternalizedCost), 0)
    ),
    uninternalizedCost: exchangeAmount(calculated.reduce((sum, entry) => sum + Number(entry.status.uninternalizedCost), 0)),
    internalizationRate: 0,
  };
  internalizationStatus.internalizationRate = Number(internalizationStatus.totalExternalCost) === 0
    ? 0
    : Number(internalizationStatus.currentlyInternalizedCost) / Number(internalizationStatus.totalExternalCost);

  const natureDebt: NatureDebt = {
    totalDebt: exchangeAmount(calculated.reduce((sum, entry) => sum + Number(entry.debt.totalDebt), 0)),
    breakdown: calculated.flatMap(({ contribution, debt }) =>
      debt.breakdown.map((entry) => ({
        ...entry,
        sourceValuationRecordId: contribution.record.id,
        materialIssueId: contribution.materialIssueId,
        category: contribution.category,
      }))
    ),
    nonGaapLabel: calculated[0]?.debt.nonGaapLabel ?? computeNatureDebt(exchangeAmount(0), [], options.discountRate).nonGaapLabel,
  };
  const verifiedIncrementalBenefit = exchangeAmount(
    contributions.reduce((sum, entry) => sum + Number(entry.verifiedIncrementalBenefit), 0)
  );
  const contributionBreakdown: FinancialBridgeContributionSummary[] = calculated.map(({ contribution, status, debt }) => ({
    sourceValuationRecordId: contribution.record.id,
    materialIssueId: contribution.materialIssueId,
    category: contribution.category,
    grossCost: status.totalExternalCost,
    alreadyInternalizedCost: status.currentlyInternalizedCost,
    uninternalizedCost: status.uninternalizedCost,
    verifiedIncrementalBenefit: contribution.verifiedIncrementalBenefit,
    natureDebt: debt.totalDebt,
    amountBasis: contribution.amountBasis,
    doubleCountKey: contribution.doubleCountKey,
    sourceHash: contribution.sourceHash,
    dataVersion: contribution.dataVersion,
  }));

  // ブリッジ1の「将来内部化見込みコスト」は自然債務そのもの(M5 D-1が §4 の自然債務と
  // 接続すると明記している)。デモ層が0を渡していたのをここで正しく接続する。
  const bridge1 = buildBridge1NatureAdjustedProfit(
    options.reportedOperatingProfit,
    exchangeAmount(0), // 依存リスクの正常化調整:企業提供の入力がまだないため0(推定で埋めない)
    natureDebt.totalDebt,
    verifiedIncrementalBenefit
  );

  const bridge2 = options.welfareRecord
    ? buildBridge2SocialCostView(options.welfareRecord.centralValue, options.socialCostInternalizationRate ?? 0)
    : null;

  const comparisonTargets = computeComparisonTargets({
    reportedOperatingProfit: options.reportedOperatingProfit,
    natureAdjustedOperatingProfit: bridge1.natureAdjustedOperatingProfit,
    natureDebt,
    existingImpairmentThreshold: options.existingImpairmentThreshold,
    financials: options.financials,
  });

  return { bridge1, bridge2, internalizationStatus, natureDebt, comparisonTargets, contributionBreakdown };
}
