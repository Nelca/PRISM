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

  /**
   * 軸レンジ(第4版 D-14)。以前は最小値側に余白がなく、投資額0の「何もしない」等の
   * 0値の点が原点・軸線上に張り付いて比較として読めなかった。データの広がり(span)に
   * 比例した余白を両側に持たせ、0値の点も軸の内側に収める。0の基準線は参照用に残す。
   */
  const domain = (values: number[]): [number, number] => {
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.12, hi + span * 0.18];
  };
  const [xMin, xMax] = domain(xs);
  const [yMin, yMax] = domain(ys);
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin)) * (W - pad - 30);
  const sy = (v: number) => H - pad - ((v - yMin) / (yMax - yMin)) * (H - pad - 20);

  /**
   * ラベル位置(D-14:ラベルの重なり解消)。
   * 既定は点の右。右端に近い点は左側に出す。先に置いたラベルと重なりそうな場合は
   * 点の下側にずらす(候補は3〜4件の想定なので、この2段階で十分読める)。
   */
  const placed: { x: number; y: number }[] = [];
  const labelPlacement = (cx: number, cy: number) => {
    const alignRight = cx > W - 150;
    let lx = alignRight ? cx - 11 : cx + 11;
    let ly = cy + 4;
    if (placed.some((q) => Math.abs(q.x - lx) < 120 && Math.abs(q.y - ly) < 16)) {
      ly = cy + 20;
      lx = alignRight ? cx - 6 : cx + 6;
    }
    placed.push({ x: lx, y: ly });
    return { lx, ly, anchor: alignRight ? ("end" as const) : ("start" as const) };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      <title>{xLabel}と{yLabel}の比較</title>
      <desc>{points.map((point) => `${point.label}: ${xLabel}${point.x}、${yLabel}${point.y}`).join("。")}</desc>
      {/* 0の基準線(レンジ内にある場合のみ)。プロット領域の枠は薄く別に描く。 */}
      <rect
        x={sx(xMin)}
        y={sy(yMax)}
        width={sx(xMax) - sx(xMin)}
        height={sy(yMin) - sy(yMax)}
        fill="none"
        stroke="#E6E8E1"
        strokeWidth={1}
      />
      {xMin <= 0 && 0 <= xMax && (
        <line x1={sx(0)} x2={sx(0)} y1={sy(yMin)} y2={sy(yMax)} stroke="#C7CBC0" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {yMin <= 0 && 0 <= yMax && (
        <line x1={sx(xMin)} x2={sx(xMax)} y1={sy(0)} y2={sy(0)} stroke="#C7CBC0" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <text x={W - 30} y={H - 12} fontSize={10.5} fontFamily="var(--font-body)" textAnchor="end" fill="#8B95A3">
        {xLabel} →
      </text>
      <text x={pad - 40} y={16} fontSize={10.5} fontFamily="var(--font-body)" fill="#8B95A3">
        ↑ {yLabel}
      </text>
      {points.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        const { lx, ly, anchor } = labelPlacement(cx, cy);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={9} fill={p.color || "#2F68F6"} opacity={0.16} />
            <circle cx={cx} cy={cy} r={5} fill={p.color || "#2F68F6"} />
            <text x={lx} y={ly} fontSize={11.5} fontFamily="var(--font-body)" textAnchor={anchor} fill="#16233A" fontWeight={600}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
