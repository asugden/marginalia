// Small SVG pieces shared by the transformer panels, in the attention
// example's visual language: a vector is a strip of cells, an attention
// pattern is a little grid shaded by weight, a matrix is a swatch. Colours
// follow ../shared/palette.ts — computed numbers in vermillion/cerulean,
// learned parameters in sage/plum, attention weights on the positive arm.
// Keeping one drawing vocabulary across the two pages is what lets this page
// say "the whole attention example is now this box" and be believed.

import { WCELL, maxAbs, sign } from "../attention/AttentionGrid.js";
import { learned, magnitude, value } from "../shared/palette.js";

// `sign` is the legacy ramp, re-exported only for the RNN example until it
// has its own palette pass. Nothing on the transformer page uses it.
export { WCELL, maxAbs, sign };

export function Strip({
  v,
  bound,
  x,
  y,
  dir = "h",
  cell = 5,
  thick = 9,
  kind = "value",
  className,
}: {
  v: Float32Array;
  bound: number;
  x: number;
  y: number;
  dir?: "h" | "v";
  cell?: number;
  thick?: number;
  /** A computed vector by default; "learned" for one the model fitted, such
   *  as a weight matrix's row. */
  kind?: "value" | "learned";
  className?: string;
}) {
  const fill = kind === "learned" ? learned : value;
  return (
    <g className={className} transform={`translate(${x}, ${y})`}>
      {Array.from(v, (val, d) => (
        <rect
          key={d}
          x={dir === "h" ? d * cell : 0}
          y={dir === "h" ? 0 : d * cell}
          width={dir === "h" ? cell - 1 : thick}
          height={dir === "h" ? thick : cell - 1}
          style={{ fill: fill(val / bound) }}
        />
      ))}
    </g>
  );
}

/** An attention pattern as an n × n grid shaded by weight, the attention
 *  example's grid shrunk to an icon. */
export function MiniGrid({
  weights,
  x,
  y,
  size,
  activeRow = null,
  className,
}: {
  weights: number[][];
  x: number;
  y: number;
  size: number;
  activeRow?: number | null;
  className?: string;
}) {
  const n = weights.length;
  const c = size / n;
  return (
    <g className={className} transform={`translate(${x}, ${y})`}>
      {weights.map((row, i) =>
        row.map((w, j) => (
          <rect
            key={`${i}-${j}`}
            x={j * c + 0.5}
            y={i * c + 0.5}
            width={c - 1}
            height={c - 1}
            rx={1}
            style={{
              fill: magnitude(w),
              opacity: activeRow === null || activeRow === i ? 1 : 0.3,
            }}
          />
        )),
      )}
      <rect className="tf-frame" x={0} y={0} width={size} height={size} />
    </g>
  );
}

/** A weight matrix as a swatch of small cells. */
export function Swatch({
  W,
  rows,
  cols,
  x,
  y,
  cell = 3,
  className,
}: {
  W: Float32Array;
  rows: number;
  cols: number;
  x: number;
  y: number;
  cell?: number;
  className?: string;
}) {
  const bound = maxAbs([W]);
  return (
    <g className={className} transform={`translate(${x}, ${y})`}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * cell}
            y={r * cell}
            width={cell - 0.5}
            height={cell - 0.5}
            style={{ fill: learned(W[r * cols + c]! / bound) }}
          />
        )),
      )}
      <rect className="tf-frame" x={-0.5} y={-0.5} width={cols * cell + 0.6} height={rows * cell + 0.6} />
    </g>
  );
}

/** The top few weights of one attention row, as "greasy 43%, soggy 41%". */
export function topWeights(row: number[], tokens: string[], k = 3, min = 0.05): string {
  return row
    .map((w, j) => ({ w, j }))
    .sort((a, b) => b.w - a.w)
    .slice(0, k)
    .filter((d) => d.w >= min)
    .map((d) => `${tokens[d.j]} ${Math.round(d.w * 100)}%`)
    .join(", ");
}
