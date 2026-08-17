/** モックのwaterfallChart()をReact SVGとして移植。連続する差分を積み上げて表示する。 */

export interface WaterfallStepInput {
  label: string;
  value: number;
  isTotal: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("ja-JP").format(Math.round(n));

export function Waterfall({ steps }: { steps: WaterfallStepInput[] }) {
  if (steps.length === 0) return null;
  const barW = 84;
  const gap = 26;
  const top = 20;
  /** X軸ラベルを2段に振り分けるため(第4版 D-07:1段では隣と重なって判読できない)、下余白を広げる。 */
  const bottom = 58;
  const H = 258;

  const vals: { label: string; start: number; end: number; total: boolean; value: number; delta?: number }[] = [];
  let running = steps[0].value;
  vals.push({ label: steps[0].label, start: 0, end: running, total: true, value: running });
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].isTotal) {
      vals.push({ label: steps[i].label, start: 0, end: steps[i].value, total: true, value: steps[i].value });
      running = steps[i].value;
      continue;
    }
    const start = running;
    running += steps[i].value;
    vals.push({
      label: steps[i].label,
      start: Math.min(start, running),
      end: Math.max(start, running),
      total: false,
      delta: steps[i].value,
      value: steps[i].value,
    });
  }

  const max = Math.max(...vals.map((v) => Math.max(v.start, v.end))) * 1.15;
  const W = Math.max(720, vals.length * (barW + gap) + 40);
  const y = (v: number) => top + (1 - v / max) * (H - top - bottom);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <line x1={30} x2={W - 10} y1={y(0)} y2={y(0)} stroke="#D9DCD2" strokeWidth={1} />
      {vals.map((v, i) => {
        const bx = 40 + i * (barW + gap);
        const color = v.total ? "#16233A" : (v.delta ?? 0) < 0 ? "#953F35" : "#33564A";
        const y1 = y(v.start);
        const y2 = y(v.end);
        const yTop = Math.min(y1, y2);
        const h = Math.abs(y2 - y1) || 2;
        const prevEnd = i > 0 ? y(vals[i - 1].end) : null;
        /**
         * ラベルの重なり解消(第4版 D-07):偶数番目を上段・奇数番目を下段に振り分ける。
         * 1本あたりの実効幅が (barW + gap) × 2 になり、日本語の手法名でも判読できる。
         * 下段のラベルにはバー中央から短い目印線を下ろし、どのバーのラベルかを保つ。
         */
        const lower = i % 2 === 1;
        const labelY = lower ? H - 10 : H - 28;
        return (
          <g key={i}>
            <rect x={bx} y={yTop} width={barW} height={h} rx={2} fill={color} opacity={v.total ? 1 : 0.82} />
            {prevEnd !== null && (
              <line x1={bx - gap} x2={bx} y1={prevEnd} y2={prevEnd} stroke="#C7CBC0" strokeWidth={1} strokeDasharray="2 2" />
            )}
            <text x={bx + barW / 2} y={yTop - 8} fontSize={11.5} fontFamily="var(--font-mono-ui)" textAnchor="middle" fill={color} fontWeight={600}>
              {(!v.total && (v.delta ?? 0) > 0 ? "+" : "") + fmt(v.value)}
            </text>
            {lower && (
              <line x1={bx + barW / 2} x2={bx + barW / 2} y1={H - 40} y2={H - 20} stroke="#C7CBC0" strokeWidth={1} />
            )}
            <text x={bx + barW / 2} y={labelY} fontSize={10} fontFamily="var(--font-body)" textAnchor="middle" fill="#4C5A6E">
              {v.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
