/**
 * 数値表示の統一(build-plan §6「等幅フォント+桁区切りで数値・台帳表示を統一する」)。
 * このコンポーネントを通した数値は常にJetBrains Mono+桁区切りで表示する(globals.cssの.num)。
 */

export function Num({ value, unit, digits = 0 }: { value: number; unit?: string; digits?: number }) {
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
