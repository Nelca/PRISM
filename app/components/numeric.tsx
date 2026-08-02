/**
 * 数値表示の統一(build-plan §6「IBM Plex Monoを数値・台帳表示に使用」)。
 * このコンポーネントを通した数値は常に等幅フォント+桁区切りで表示する。
 */

export function Num({ value, unit, digits = 0 }: { value: number; unit?: string; digits?: number }) {
  const formatted = new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  return (
    <span style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>
      {formatted}
      {unit ? <span className="ml-0.5 text-zinc-500">{unit}</span> : null}
    </span>
  );
}

/** ハッシュ・ID等、桁区切りをしない等幅文字列表示。 */
export function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{children}</span>;
}
