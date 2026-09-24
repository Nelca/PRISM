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

/** 共通単位で小額を表示しても、非ゼロを0と誤認させない。 */
function scaledNumber(value: number, divisor: number): string {
  const scaled = value / divisor;
  if (value !== 0 && Math.abs(scaled) < 0.00000001) return scaled.toExponential(1);
  const digits = value !== 0 && Math.abs(scaled) < 0.1 ? Math.min(8, Math.max(2, -Math.floor(Math.log10(Math.abs(scaled))))) : 1;
  return new Intl.NumberFormat("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(scaled);
}

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
  if (scale === "oku") return `${scaledNumber(value, OKU)}億円`;
  if (scale === "million") return `${scaledNumber(value, MILLION_YEN)}百万円`;
  return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

/** スケール表示のtitle属性に置く、桁区切りフル桁+円の正確な値。 */
function formatYenExact(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

/**
 * 金額レンジの表示(2026-08-23レビュー第3回:単位混在の解消)。
 *
 * `formatYen(low)`〜`formatYen(high)`のように両端を別々にautoYenScaleすると、
 * 「年57,761円〜12.6百万円」のように片方だけスケールされたレンジになり、
 * どちらが大きいのか一読で分からない。`pickYenScale(low, high)`で決めた
 * 共通スケール1つを両端に必ず適用する。
 *
 * 共通スケールを小さい側に適用すると小数1桁では"0.0"に潰れて読めなくなることがある
 * (例:百万円スケールで57,761円は0.06百万円)。その値だけ小数2桁に上げて読める形にする
 * (両端が同じ位取りで揃っていることが目的なので、桁数が両端で揃っていなくても問題ない)。
 */
export function formatCompactYenRange(low: number, high: number): string {
  const scale = pickYenScale(low, high);
  if (scale === "none") {
    return `${formatYen(low, scale)}〜${formatYen(high, scale)}`;
  }
  const divisor = scale === "oku" ? OKU : MILLION_YEN;
  const label = scale === "oku" ? "億円" : "百万円";
  const formatOne = (value: number) => `${scaledNumber(value, divisor)}${label}`;
  return `${formatOne(low)}〜${formatOne(high)}`;
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
      const formatted = scaledNumber(value, divisor);

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
