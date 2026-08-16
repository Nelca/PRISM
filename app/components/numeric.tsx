/**
 * 数値表示の統一(build-plan §6「等幅フォント+桁区切りで数値・台帳表示を統一する」)。
 * このコンポーネントを通した数値は常にJetBrains Mono+桁区切りで表示する(globals.cssの.num)。
 *
 * 指示09(金額の自動スケーリング):「1,234,000,000円」級の数字がフル桁で並ぶと桁の読み違いを
 * 誘うため、円・円/年単位の金額は既定で億円/百万円に丸めて表示し、正確な値はtitle属性に退避する。
 * 対象はunitが「円」「円/年」系のときだけ(m3・件・%等や単位なしは現状維持)。
 */

/** 円建て金額の表示スケール。"none" はフル桁表示(スケールしない)。 */
export type YenScale = "oku" | "million" | "none";

const OKU = 100_000_000;
const MILLION_YEN = 1_000_000;

/** 金額の絶対値だけからスケールを自動判定する(|値|>=1億→億円、>=100万→百万円、それ未満→フル桁)。 */
export function autoYenScale(value: number): YenScale {
  const abs = Math.abs(value);
  if (abs >= OKU) return "oku";
  if (abs >= MILLION_YEN) return "million";
  return "none";
}

/**
 * 複数の金額から、同一表内で統一して使うスケールを1つ選ぶ(指示09)。
 * 表の中で行ごとに単位が割れる(百万円の行と億円の行が混在する等)のを防ぐため、
 * 表を描画する側が対象の金額をまとめて渡し、最大絶対値を基準にスケールを決める。
 */
export function pickYenScale(...values: number[]): YenScale {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return "none";
  return autoYenScale(Math.max(...finite.map((v) => Math.abs(v))));
}

/**
 * 金額をスケールに応じた文字列に丸める(lib/pipeline/open-tasks.ts の formatCompactYen と
 * 同じ丸め方:億円/百万円は小数1桁、それ未満は桁区切りのフル桁+円)。
 * ホームの発見サマリー(地の文)のような、Numコンポーネントを使わない箇所と表記を揃えるために使う。
 */
export function formatYen(value: number, scale: YenScale = autoYenScale(value)): string {
  if (scale === "oku") return `${(value / OKU).toFixed(1)}億円`;
  if (scale === "million") return `${(value / MILLION_YEN).toFixed(1)}百万円`;
  return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

/** スケール表示のtitle属性に置く、桁区切りフル桁+円の正確な値。 */
function formatYenExact(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

export function Num({
  value,
  unit,
  digits = 0,
  scale,
}: {
  value: number;
  unit?: string;
  digits?: number;
  /**
   * 表内で単位を揃えたいときに明示指定する(pickYenScaleで算出)。
   * 省略時はこの値単独からautoYenScaleで自動判定する。unitが円系でなければ無視される。
   */
  scale?: YenScale;
}) {
  const isYenUnit = unit === "円" || (unit?.startsWith("円/") ?? false);

  if (isYenUnit) {
    const resolvedScale = scale ?? autoYenScale(value);
    if (resolvedScale !== "none") {
      const divisor = resolvedScale === "oku" ? OKU : MILLION_YEN;
      const scaledLabel = resolvedScale === "oku" ? "億円" : "百万円";
      // unitが「円/年」のような場合、「/年」部分だけをスケール後の単位に付け足す。
      const suffix = unit === "円" ? "" : unit!.slice("円".length);
      const formatted = new Intl.NumberFormat("ja-JP", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value / divisor);

      return (
        <span className="num" title={formatYenExact(value)}>
          {formatted}
          <span style={{ color: "var(--ink-faint)", marginLeft: 2 }}>
            {scaledLabel}
            {suffix}
          </span>
        </span>
      );
    }
  }

  const formatted = new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  return (
    <span className="num">
      {formatted}
      {unit ? <span style={{ color: "var(--ink-faint)", marginLeft: 2 }}>{unit}</span> : null}
    </span>
  );
}

/** ハッシュ・ID等、桁区切りをしない等幅文字列表示。 */
export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}
