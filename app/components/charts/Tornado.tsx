/** モックのtornadoChart()をReact SVGとして移植。中心値からの要因別の振れ幅。 */

export interface TornadoFactorInput {
  name: string;
  low: number;
  high: number;
  dominant?: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("ja-JP").format(Math.round(n));

export function Tornado({ center, factors }: { center: number; factors: TornadoFactorInput[] }) {
  if (factors.length === 0) return null;
  const W = 720;
  const rowH = 34;
  const padL = 230;
  const top = 10;
  const H = top + factors.length * rowH + 26;
  const maxSwing = Math.max(...factors.map((f) => Math.max(Math.abs(f.low - center), Math.abs(f.high - center)))) * 1.25 || 1;
  const midX = padL + (W - padL - 40) / 2;
  const scale = (W - padL - 40) / 2 / maxSwing;

  const sorted = [...factors].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <line x1={midX} x2={midX} y1={top} y2={H - 20} stroke="#8B95A3" strokeWidth={1} strokeDasharray="2 3" />
      <text x={midX} y={H - 6} fontSize={10} fontFamily="var(--font-mono-ui)" textAnchor="middle" fill="#8B95A3">
        中心値 {fmt(center)}
      </text>
      {sorted.map((f, i) => {
        const cy = top + i * rowH + rowH / 2;
        const x1 = midX + (f.low - center) * scale;
        const x2 = midX + (f.high - center) * scale;
        const xa = Math.min(x1, x2);
        const xb = Math.max(x1, x2);
        return (
          <g key={i}>
            <text x={0} y={cy + 4} fontSize={12} fontFamily="var(--font-body)" fill="#16233A">
              {f.name}
            </text>
            <rect x={xa} y={cy - 9} width={xb - xa} height={18} rx={2} fill={f.dominant ? "#9B7233" : "#33564A"} opacity={f.dominant ? 0.85 : 0.55} />
            <text x={xa - 6} y={cy + 4} fontSize={10} fontFamily="var(--font-mono-ui)" textAnchor="end" fill="#4C5A6E">
              {fmt(f.low)}
            </text>
            <text x={xb + 6} y={cy + 4} fontSize={10} fontFamily="var(--font-mono-ui)" fill="#4C5A6E">
              {fmt(f.high)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
