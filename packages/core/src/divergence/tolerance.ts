/**
 * M4完成 §6.5:数値許容誤差の方針と版。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.5、T-02
 *
 * `|x − y| ≤ atol + rtol × scale` を金額(共通通貨)・対数値のそれぞれに定める。
 * scale は両端・反実仮想値・寄与の絶対値の最大値から再現可能に定義し、相殺時に全体差だけを
 * 基準にしない。atol/rtol は演算精度と独立に検算したケース(§7.2.1 の統合化係数 4通り一致・
 * 世界平均/日本の比 2.56623)を根拠に設定した(tolerance.test.ts)。
 *
 * 出典の丸め幅・モデル不確実性・業務上の重要性はここに混ぜない。F-3/F-8 の業務閾値は
 * H-06 の対象であり、別の版(f3/f8ThresholdVersion)で管理する。
 * 変更時は version を上げ、根拠・影響を design-rationale-log に記録する。
 */

export interface ToleranceSpec {
  atol: number;
  rtol: number;
}

export interface TolerancePolicy {
  version: string;
  /** 共通通貨(JPY)での金額比較。 */
  money: ToleranceSpec;
  /** 対数空間での比較(ln 値・対数寄与)。 */
  log: ToleranceSpec;
  /** 倍率・比率(無次元)の比較。 */
  ratio: ToleranceSpec;
}

export const TOLERANCE_POLICY: TolerancePolicy = {
  version: "tol-v1",
  money: { atol: 1e-6, rtol: 1e-9 },
  log: { atol: 1e-12, rtol: 1e-9 },
  ratio: { atol: 1e-12, rtol: 1e-9 },
};

/** scale = max(|v|)。空配列なら 0(atol のみが効く)。非有限値は無視しない(呼び出し側で先に停止する)。 */
export function toleranceScale(values: number[]): number {
  let scale = 0;
  for (const value of values) {
    const magnitude = Math.abs(value);
    if (magnitude > scale) scale = magnitude;
  }
  return scale;
}

export function withinTolerance(x: number, y: number, scale: number, spec: ToleranceSpec): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) return false;
  return Math.abs(x - y) <= spec.atol + spec.rtol * scale;
}

/** 許容誤差内でゼロとみなせるか。 */
export function isZeroWithinTolerance(value: number, scale: number, spec: ToleranceSpec): boolean {
  return withinTolerance(value, 0, scale, spec);
}
