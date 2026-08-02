/**
 * M4 §5 F-4/F-5:要因別の再計算可能性判定。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §5(F-4「再計算不能な要因」・F-5「割引率がnullの扱い」)
 *
 * 実装検討で判明した点(plan file 参照): 「Bの設定からAの設定に差し替えて再計算する」を
 * 実際に式として持つのは3要因のうち**地理較正のみ**である。
 *   - 地理較正: M3の `applyGeographicCalibration` をそのまま再利用できる(構想書8.4に明示式がある)
 *   - 割引率:   ValuationRecordには時間プロファイルが保持されておらず、explicit同士で値が異なる
 *              場合の再計算式が存在しない。F-5a(両方 no_time_dimension)/F-5c(片方のみ
 *              no_time_dimension)は判定のみで再計算不要。それ以外(explicit同士だが値が違う等)は
 *              「未実装」として正直にF-4(残差)に倒す
 *   - エンドポイント被覆: aopCode一致ならゼロ寄与(公理通り)。不一致の場合、ValuationRecordは
 *              既に単一AoPまで分解済み(M3 D-1)のためエンドポイント別内訳がなく、再計算式がない
 *
 * したがって現時点で `kind: "recalculable"` になりうるのは地理較正のみ。他の2要因は
 * ゼロ寄与("zero")か再計算不能("not_recalculable")のいずれかに必ず分類される。
 * これは省略ではなく、上記の理由により実際に持ちうる式がないことの反映である。
 */

import { applyGeographicCalibration } from "../monetization/calibration";
import type { DecompositionFactor } from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";

const RATIO_EQUALITY_EPSILON = 1e-9;

export type FactorClassification =
  | { factor: DecompositionFactor; kind: "zero" }
  | { factor: DecompositionFactor; kind: "recalculable"; ratio: number }
  | { factor: DecompositionFactor; kind: "not_recalculable"; fallback: string; reason: string };

function calibrationMultiplier(record: ValuationRecord): number {
  return applyGeographicCalibration(1, record.geographicCalibration);
}

function ratiosApproximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < RATIO_EQUALITY_EPSILON * Math.max(1, Math.abs(b));
}

/** 地理較正(F-4の表:再計算可能性「高」)。 */
export function classifyGeographicCalibration(
  recordA: ValuationRecord,
  recordB: ValuationRecord
): FactorClassification {
  const multiplierA = calibrationMultiplier(recordA);
  const multiplierB = calibrationMultiplier(recordB);

  if (ratiosApproximatelyEqual(multiplierA, multiplierB)) {
    return { factor: "geographicCalibration", kind: "zero" };
  }

  return { factor: "geographicCalibration", kind: "recalculable", ratio: multiplierA / multiplierB };
}

export class InconsistentDiscountRateStatusError extends Error {}

/**
 * この関数はdiscountRateStatusが"explicit"または"documented_zero"の場合のみ呼ばれる
 * (呼び出し元のclassifyDiscountRateがno_time_dimensionを先に処理済み)。"explicit"であれば
 * discountRateは必ず数値のはずであり、nullは型では表現できてもデータとして矛盾した状態である。
 * `?? 0`で静かに0扱いにすると、この矛盾を「割引率0%」という別の正当な状態と区別できなくなる
 * (推定で埋めない、D-15と同じ規律)。
 */
function effectiveDiscountRate(record: ValuationRecord): number {
  if (record.discountRateStatus === "documented_zero") {
    return 0;
  }
  if (record.discountRate === null) {
    throw new InconsistentDiscountRateStatusError(
      `M4: discountRateStatusが"explicit"なのにdiscountRateがnullです(ValuationRecord id: ${record.id})。データが矛盾しています。`
    );
  }
  return record.discountRate;
}

/** 割引率(F-5a/b/c)。explicit同士で値が異なる場合の再計算式は未実装のためF-4に倒す。 */
export function classifyDiscountRate(recordA: ValuationRecord, recordB: ValuationRecord): FactorClassification {
  const aHasNoTimeDimension = recordA.discountRateStatus === "no_time_dimension";
  const bHasNoTimeDimension = recordB.discountRateStatus === "no_time_dimension";

  // F-5a: 両方とも時間次元を持たない → 要因を落とす。残差は生じない(ゼロ寄与公理により正当)
  if (aHasNoTimeDimension && bHasNoTimeDimension) {
    return { factor: "discountRate", kind: "zero" };
  }

  // F-5c: 一方のみ時間次元を持たない → 差し替えが定義できない
  if (aHasNoTimeDimension || bHasNoTimeDimension) {
    return {
      factor: "discountRate",
      kind: "not_recalculable",
      fallback: "F-5c",
      reason:
        "一方の手法が時間次元を持たない評価(年間フロー等)のため、割引率のみを差し替えた再計算が定義できません。",
    };
  }

  // 両方とも割引率の概念を持つ(explicit または documented_zero)
  const rateA = effectiveDiscountRate(recordA);
  const rateB = effectiveDiscountRate(recordB);

  if (ratiosApproximatelyEqual(rateA, rateB)) {
    return { factor: "discountRate", kind: "zero" };
  }

  // F-5b相当だが、時間プロファイルを保持していないため異なる割引率への再計算式がない
  return {
    factor: "discountRate",
    kind: "not_recalculable",
    fallback: "F-4",
    reason:
      "割引率が異なりますが(A: " +
      `${rateA}, B: ${rateB}` +
      ")、損害の時間プロファイルを保持していないため、割引率のみを差し替えた再計算ができません。",
  };
}

/** エンドポイント被覆(F-4の表:再計算可能性「中〜低」)。 */
export function classifyEndpointCoverage(recordA: ValuationRecord, recordB: ValuationRecord): FactorClassification {
  if (recordA.aopCode === recordB.aopCode) {
    return { factor: "endpointCoverage", kind: "zero" };
  }

  return {
    factor: "endpointCoverage",
    kind: "not_recalculable",
    fallback: "F-4",
    reason: `エンドポイント被覆が異なりますが(A: ${recordA.aopCode}, B: ${recordB.aopCode})、各ValuationRecordは既に単一AoPまで分解済みで内訳データを持たないため、被覆を差し替えた再計算ができません。`,
  };
}

export function classifyAllFactors(recordA: ValuationRecord, recordB: ValuationRecord): FactorClassification[] {
  return [
    classifyEndpointCoverage(recordA, recordB),
    classifyDiscountRate(recordA, recordB),
    classifyGeographicCalibration(recordA, recordB),
  ];
}
