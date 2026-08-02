/**
 * M3 D-3:地理較正。
 * 参照元: docs/requirements/m3-monetization-engine.md §3
 *
 * 構想書8.4の補正式(5項の掛け算):
 *   較正後の値 = 較正前の値
 *              × PPP
 *              × 所得弾力性調整(対象地所得/研究地所得)^η
 *              × デフレータ
 *              × 相対価格上昇係数^経過年数
 *              × 面積スケーリング
 *
 * 手法によらずコアエンジンが一律適用する共通関数(手法プラグインには実装させない)。
 * プラグインが返す MethodOutput.centralValue は常に「較正前」の値であることが前提。
 */

import type { GeographicCalibrationRecord } from "../types/valuation";

export function applyGeographicCalibration(
  centralValue: number,
  calibration: GeographicCalibrationRecord
): number {
  const incomeRatio = calibration.targetIncomeLevel / calibration.sourceIncomeLevel;
  const incomeElasticityAdjustment = incomeRatio ** calibration.incomeElasticity;
  const relativePriceEscalationAdjustment =
    calibration.relativePriceEscalationRate ** calibration.elapsedYears;

  return (
    centralValue *
    calibration.pppValue *
    incomeElasticityAdjustment *
    calibration.deflator *
    relativePriceEscalationAdjustment *
    calibration.areaScaling
  );
}
