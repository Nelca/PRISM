/**
 * M8 D-3:旧版のパラメータでの再計算。
 * 参照元: docs/requirements/m8-ledger-versioning.md §3
 *   完了条件「任意のレコードを旧版係数で再計算できる」
 *
 * 版管理レジストリ(versioned-parameter-set.ts)はパラメータ**値**を持たない台帳であり、
 * 実際の値は各ValuationRecordに自己完結して保存されている(`geographicCalibration`)。
 * したがって「旧版で再計算する」は、過去のレコードが持つ較正パラメータを
 * 現在のレコードに当て直すことで実現できる(D-97)。
 *
 * **手法の係数値(IFVIのvalue factor等)そのものは、どのレコードにも保存されていない。**
 * 較正前の値は復元できるが、係数が変わった場合の再計算は現状できない。
 * その場合は「再計算不能」を返す。近い値で代用しない(D-15)。
 */

import { applyGeographicCalibration } from "../monetization/calibration";
import type { GeographicCalibrationRecord, ValuationRecord } from "../types/valuation";

/** 較正の倍率(較正前の値1に対する較正後の値)。 */
export function calibrationFactor(calibration: GeographicCalibrationRecord): number {
  return applyGeographicCalibration(1, calibration);
}

export type PriorParameterRecalculationStatus =
  | "recalculated"
  | "identical_parameters" // 旧版と現行で較正パラメータが同一(再計算しても値は変わらない)
  | "method_version_differs" // 手法の版が違う。係数値を保持していないため再計算できない
  | "uncomputable"; // 現行の較正倍率が0で、較正前の値を復元できない

export interface PriorParameterRecalculation {
  status: PriorParameterRecalculationStatus;
  /** status === "recalculated" のときのみ埋まる。 */
  recalculatedValue?: number;
  /** 再計算できなかった場合の理由(画面にそのまま出す)。 */
  reason?: string;
}

/**
 * 現在のレコードを、過去のレコードが使っていた較正パラメータで再計算する。
 *
 * 手順:現在の較正倍率で割って較正前の値を復元し、旧版の較正倍率を掛け直す。
 * どちらもレコードに保存済みの実値のみを使う(新たな推定を挟まない)。
 */
export function recalculateWithPriorParameters(
  current: ValuationRecord,
  prior: Pick<ValuationRecord, "methodId" | "methodVersion" | "geographicCalibration">
): PriorParameterRecalculation {
  if (prior.methodVersion !== current.methodVersion) {
    return {
      status: "method_version_differs",
      reason:
        `手法 ${current.methodId} の版が異なります(旧版 ${prior.methodVersion} / 現行 ${current.methodVersion})。` +
        "旧版の係数値そのものは保存していないため、この差分の再計算はできません。",
    };
  }

  const currentFactor = calibrationFactor(current.geographicCalibration);
  if (currentFactor === 0) {
    return {
      status: "uncomputable",
      reason: "現行の較正倍率が0のため、較正前の値を復元できません。",
    };
  }

  const priorFactor = calibrationFactor(prior.geographicCalibration);
  if (priorFactor === currentFactor) {
    return { status: "identical_parameters" };
  }

  const uncalibrated = (current.centralValue) / currentFactor;
  return { status: "recalculated", recalculatedValue: uncalibrated * priorFactor };
}
