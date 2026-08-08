/** モックのfootballChart()をReact SVGとして移植。手法ごとのlow/mid/highレンジバー。 */

export interface FootballMethodInput {
  name: string;
  tier: string;
  concept: "exchange" | "welfare";
  low: number;
  mid: number;
  high: number;
}

const fmt = (n: number) => new Intl.NumberFormat("ja-JP").format(Math.round(n));
const tierColor = (tier: string) => (tier === "A" ? "#2F5D50" : tier === "B" ? "#9B7233" : "#8B8F86");

export function Football({ methods, threshold, thresholdLabel }: { methods: FootballMethodInput[]; threshold?: number; thresholdLabel?: string }) {
  if (methods.length === 0) return null;
  const W = 760;
  const rowH = 46;
  const padL = 210;
  const padR = 90;
  const top = 18;
  const H = top + methods.length * rowH + 30;
  const allVals = methods.flatMap((m) => [m.low, m.high]);
  const max = Math.max(...allVals) * 1.12;
  const min = 0;
  const x = (v: number) => padL + ((v - min) / (max - min)) * (W - padL - padR);

  const steps = 5;
  const gridlines = Array.from({ length: steps + 1 }, (_, i) => min + ((max - min) * i) / steps);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
      {gridlines.map((v, i) => (
        <g key={i}>
          <line x1={x(v)} x2={x(v)} y1={top - 6} y2={H - 24} stroke="#E1E3DC" strokeWidth={1} />
          <text x={x(v)} y={H - 10} fontSize={10} fontFamily="var(--font-mono-ui)" textAnchor="middle" fill="#8B95A3">
            {fmt(v)}
          </text>
        </g>
      ))}

      {methods.map((m, i) => {
        const cy = top + i * rowH + rowH / 2;
        const barColor = m.concept === "welfare" ? "#6B5B8A" : tierColor(m.tier);
        return (
          <g key={i}>
            <text x={0} y={cy - 6} fontSize={12.5} fontFamily="var(--font-body)" fill="#16233A" fontWeight={600}>
              {m.name}
            </text>
            <text x={0} y={cy + 11} fontSize={10} fontFamily="var(--font-mono-ui)" fill="#8B95A3">
              {(m.concept === "welfare" ? "厚生価値" : "交換価値") + " ・ Tier " + m.tier}
            </text>
            <line x1={x(m.low)} x2={x(m.high)} y1={cy} y2={cy} stroke={barColor} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
            <line x1={x(m.low)} x2={x(m.low)} y1={cy - 7} y2={cy + 7} stroke={barColor} strokeWidth={2} />
            <line x1={x(m.high)} x2={x(m.high)} y1={cy - 7} y2={cy + 7} stroke={barColor} strokeWidth={2} />
            <circle cx={x(m.mid)} cy={cy} r={5.5} fill={barColor} stroke="#fff" strokeWidth={1.5} />
            <text x={x(m.mid)} y={cy - 13} fontSize={11} fontFamily="var(--font-mono-ui)" textAnchor="middle" fill={barColor} fontWeight={600}>
              {fmt(m.mid)}
            </text>
          </g>
        );
      })}

      {threshold !== undefined && (
        <g>
          <line x1={x(threshold)} x2={x(threshold)} y1={top - 14} y2={H - 24} stroke="#953F35" strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={x(threshold)} y={top - 16} fontSize={10} fontFamily="var(--font-mono-ui)" textAnchor="middle" fill="#953F35">
            {thresholdLabel || "承認閾値"}
          </text>
        </g>
      )}
    </svg>
  );
}
