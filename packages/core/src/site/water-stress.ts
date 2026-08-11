/**
 * M1:WRI Aqueduct 4.0 Baseline Water Stress(BWS)カテゴリ→水ストレス基準のboolean化。
 * 参照元: docs/data/aqueduct-water-stress-notes.md、docs/data/acquisition-runbook.md §3.7
 *
 * `criteria.ts`の構造的既定(数値なら「0より大きければ充足」)はAqueductの`bws_cat`には
 * そのまま使えない(0=Low自体が正の値のため)。閾値でのboolean化は呼び出し側の責務
 * (§3.7完了条件)であり、この関数がその実装を1箇所に集約する。
 */

/**
 * `baseline_annual` CSVの`bws_cat`列が取る値。
 * -1: Arid and Low Water Use(取水量が少なすぎて比率が算出されない絶対的な水不足地域)
 * -9999: No Data
 * 0〜4: Low / Low-Medium / Medium-High / High / Extremely High
 */
export type BaselineWaterStressCategory = -9999 | -1 | 0 | 1 | 2 | 3 | 4;

/**
 * カテゴリ3(High、40-80%)以上を「水ストレス地域」とする。
 * 40%閾値はWRI自身が企業のリスク選定の目安として推奨する値(aqueduct-water-stress-notes.md §3)。
 * -1(Arid and Low Water Use)は取水比率という尺度では捉えられない絶対的な水不足地域のため、
 * 同様にtrueとする。-9999(No Data)は判定不能のためfalse(呼び出し側でno_data_source相当に
 * 倣うべきだが、この関数はNatureInterface.rawResultへの変換のみを担う)。
 */
export function isHighBaselineWaterStress(bwsCat: BaselineWaterStressCategory): boolean {
  return bwsCat === -1 || bwsCat >= 3;
}
