/** モックのscatterChart()をReact SVGとして移植。財務効果×環境アウトカムの2軸散布図。 */

export interface ScatterPointInput {
  x: number;
  y: number;
  label: string;
  color?: string;
}

export function Scatter({ points, xLabel, yLabel }: { points: ScatterPointInput[]; xLabel: string; yLabel: string }) {
  if (points.length === 0) return null;
  const W = 680;
  const H = 320;
  const pad = 54;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMax = Math.max(...xs) * 1.25 || 1;
  const xMin = Math.min(0, ...xs) * 1.1;
  const yMax = Math.max(...ys) * 1.25 || 1;
  const yMin = Math.min(0, ...ys) * 1.1;
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin)) * (W - pad - 30);
  const sy = (v: number) => H - pad - ((v - yMin) / (yMax - yMin)) * (H - pad - 20);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <line x1={sx(xMin)} x2={sx(xMax)} y1={sy(0)} y2={sy(0)} stroke="#C7CBC0" strokeWidth={1} />
      <line x1={sx(0)} x2={sx(0)} y1={sy(yMin)} y2={sy(yMax)} stroke="#C7CBC0" strokeWidth={1} />
      <text x={W - 30} y={sy(0) + 18} fontSize={10.5} fontFamily="var(--font-body)" textAnchor="end" fill="#8B95A3">
        {xLabel}
      </text>
      <text x={pad} y={16} fontSize={10.5} fontFamily="var(--font-body)" fill="#8B95A3">
        {yLabel}
      </text>
      {points.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={9} fill={p.color || "#33564A"} opacity={0.16} />
            <circle cx={cx} cy={cy} r={5} fill={p.color || "#33564A"} />
            <text x={cx + 11} y={cy + 4} fontSize={11.5} fontFamily="var(--font-body)" fill="#16233A" fontWeight={600}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
