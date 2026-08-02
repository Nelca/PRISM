/**
 * M4:乖離分解。
 * 参照元: docs/requirements/m4-divergence-decomposition.md
 *
 * 実装注記: M4要件定義書の付録は `MethodMetadata` / `EndpointCoverage` を
 * ValuationRecordとは別の入れ子型として定義していたが、実装では
 * ValuationRecord(valuation.ts)にそれらのフィールドを直接持たせている
 * (methodId・valueConcept・discountRateStatus・geographicCalibration・
 * aopCode・cicesRef・recalculability)。M4の分解ロジックはValuationRecordを
 * そのまま読めばよく、別型への変換は不要。
 */

import type { ExchangeAmount, ValueConcept, WelfareAmount } from "./common";

export type DecompositionFactor = "endpointCoverage" | "discountRate" | "geographicCalibration";

export type DecompositionMode =
  | "multiplicative" // 通常
  | "additive" // F-1
  | "not_decomposed"; // F-2 / F-3 / F-8 / 価値概念グループ間

export interface FactorContribution {
  factor: DecompositionFactor;
  /** c_i(Shapley寄与、対数空間)。 */
  logContribution: number;
  /** exp(c_i)。 */
  multiplier: number;
  /** F-9でnullになりうる(相殺時は割合表示を抑止する)。 */
  shareRatio: number | null;
  status: "decomposed" | "not_recalculable";
  /** status === "not_recalculable" の場合に理由を記録する。 */
  exclusionReason?: string;
}

export interface PairwiseDecomposition {
  methodIdA: string;
  methodIdB: string;
  /** ValueConceptGroupの価値概念に合わせてExchangeAmount/WelfareAmountのどちらかになる(2026-08-02追記)。 */
  valueA: ExchangeAmount | WelfareAmount;
  valueB: ExchangeAmount | WelfareAmount;
  /** not_decomposed のとき null。 */
  ratio: number | null;
  mode: DecompositionMode;
  /** 例 ["F-4", "F-9"]。 */
  fallbackApplied: string[];
  contributions: FactorContribution[];
  residual: {
    logResidual: number;
    multiplier: number;
  } | null;
  /** 自動生成の読み下し文。テンプレート+機械的な数値埋め込みで構成する(M5 D-5と同じ原則)。 */
  narrative: string;
}

export interface ValueConceptGroup {
  valueConcept: ValueConcept;
  methodIds: string[];
  /** 例 "SSBJ財務影響 / 投資判断"。 */
  usage: string;
  pairwiseDecompositions: PairwiseDecomposition[];
}

export interface RepresentativeValueSelection {
  groupValueConcept: ValueConcept;
  selectedMethodId: string;
  reason: string;
  priorYearMethodId?: string;
  recalculatedWithPriorMethod?: number;
}

/**
 * 乖離分解の結果。valuationRecordIds は分割前の総数に上限なし。
 * 各ValueConceptGroup内で 2 ≦ N ≦ 5(M4 §2.1、価値概念で分割した後のグループ単位で上限を適用する)。
 */
export interface DivergenceDecomposition {
  id: string;
  targetPhysicalQuantityId: string;
  siteId: string;
  valuationRecordIds: string[];
  groups: ValueConceptGroup[];
  crossGroupComparison: {
    /** 常にtrue。価値概念をまたぐグループ間は分解しない。 */
    incommensurable: true;
    metadataDifferences: string[];
  } | null;
  representativeValueSelection?: RepresentativeValueSelection;
  assumptionEntryIds: string[];
  recalculationHash: string;
}
