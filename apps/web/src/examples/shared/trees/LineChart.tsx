// A small multi-series line chart, shared by the two ensemble pages: score
// against number of trees for the forest, loss against round for boosting.
// Deliberately minimal — the interesting thing is always the *shape* of the
// curve (does it flatten, or does it turn back up?), not the exact values.

export interface Series {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

export interface LineChartProps {
  series: Series[];
  /** 1-based position of the marker showing where the scrubber is. */
  cursor?: number;
  yLabel?: string;
  xLabel?: string;
  /** Force the y-axis to start at zero. Off for accuracy curves, where the
   *  interesting range is the top few percent. */
  zeroBased?: boolean;
  height?: number;
}

const W = 460;
const PAD_L = 46;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 30;

export function LineChart({
  series,
  cursor,
  yLabel,
  xLabel,
  zeroBased = false,
  height = 170,
}: LineChartProps) {
  const n = Math.max(...series.map((s) => s.values.length), 1);
  const all = series.flatMap((s) => s.values);
  const rawMax = all.length ? Math.max(...all) : 1;
  const rawMin = all.length ? Math.min(...all) : 0;
  const max = rawMax + (rawMax - rawMin) * 0.08 || 1;
  const min = zeroBased ? 0 : rawMin - (rawMax - rawMin) * 0.08;

  const plotW = W - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const sx = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const sy = (v: number) => PAD_T + plotH - ((v - min) / Math.max(max - min, 1e-9)) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" className="lchart" role="img"
      aria-label={`${yLabel ?? "value"} against ${xLabel ?? "step"}`}>
      <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} className="lchart__axis" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} className="lchart__axis" />

      {cursor != null && cursor >= 1 && (
        <line
          x1={sx(cursor - 1)}
          y1={PAD_T}
          x2={sx(cursor - 1)}
          y2={PAD_T + plotH}
          className="lchart__cursor"
        />
      )}

      {series.map((s) => (
        <path
          key={s.label}
          d={s.values
            .map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
            .join(" ")}
          stroke={s.color}
          strokeDasharray={s.dashed ? "4 3" : undefined}
          className="lchart__line"
        />
      ))}

      <text x={PAD_L} y={height - 8} className="lchart__label">{xLabel}</text>
      <text x={0} y={0} transform={`translate(12 ${PAD_T + plotH}) rotate(-90)`} className="lchart__label">
        {yLabel}
      </text>
      <g className="lchart__legend">
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${PAD_L + plotW - 8} ${PAD_T + 10 + i * 14})`}>
            <text textAnchor="end" x={-14} className="lchart__legend-text" fill={s.color}>
              {s.label}
            </text>
            <line x1={-11} y1={-4} x2={0} y2={-4} stroke={s.color} strokeWidth={2}
              strokeDasharray={s.dashed ? "3 2" : undefined} />
          </g>
        ))}
      </g>
      <text x={PAD_L - 6} y={PAD_T + 4} textAnchor="end" className="lchart__tick">
        {max.toFixed(max < 3 ? 2 : 0)}
      </text>
      <text x={PAD_L - 6} y={PAD_T + plotH} textAnchor="end" className="lchart__tick">
        {min.toFixed(min < 3 ? 2 : 0)}
      </text>
    </svg>
  );
}
