// The value side of attention, for one word, drawn in the same grammar as the
// grid's lanes so the third matrix lands by rhyme.
//
// The grid answered "how much should this word take from each other word?"
// and said nothing about WHAT gets taken. This figure is the what. One column
// per word, top to bottom:
//
//   word → E → × W_V → V → × weight → (lines converge) → out
//
// The first three steps are the same shape as the grid's column lane
// (word → E → × W_K → K), which is the point: a value is the same embedding
// through a third shared matrix. Then each value is scaled by the selected
// word's row of attention weights, and the scaled values are summed into the
// output. The weighted sum is drawn as it is: one line per word converging
// on the output strip, with the line's thickness carrying the weight, so
// "mostly greasy and soggy, almost nothing from the rest" is visible before
// it is read.
//
// Clicking a value zeroes it. The output moves; the weight cells do not.
// That is the whole reason V is a separate matrix, and a student can prove it
// to themselves in one click.
//
// Rendered as SVG, like the grid, so it exports cleanly to slides.

import { useId, useMemo } from "react";
import type { AttentionRun, Head } from "./attention.js";
import {
  CELL,
  STRIP_T,
  Swatch,
  VCELL,
  WCELL,
  WORD_H,
  maxAbs,
  sign,
  type HoveredVector,
} from "./AttentionGrid.js";

interface Props {
  head: Head;
  run: AttentionRun;
  /** The word whose output is being assembled — a row of the grid. */
  row: number;
  /** Index of the word whose value is zeroed, if any. */
  zeroed: number | null;
  /** The output with the zeroed value removed; null when nothing is zeroed. */
  outOverride: Float32Array | null;
  hovered: HoveredVector | null;
  onHover: (v: HoveredVector | null) => void;
  onZero: (j: number | null) => void;
  onSelectRow: (i: number) => void;
}

const X0 = 190; // left gutter: lane labels, the W_V swatch, and the weights caption
const TOP = 16;
const FORM_H = 84; // the "× W_V" band: label over a 16-tall swatch
const WEIGHT_H = 26; // the "× weight" cells
const SUM_H = 64; // the converging lines

export function ValueLane({
  head,
  run,
  row,
  zeroed,
  outOverride,
  hovered,
  onHover,
  onZero,
  onSelectRow,
}: Props) {
  const n = run.tokens.length;
  const { eDim, vDim } = head;
  const eLen = eDim * VCELL;
  const vLen = vDim * VCELL;
  const markerId = useId();
  const i = Math.min(row, n - 1);
  const word = run.tokens[i]!;
  const weights = run.weights[i]!;
  const out = outOverride ?? run.out[i]!;

  // Column lane, top to bottom.
  const yE = TOP + WORD_H;
  const yForm = yE + eLen;
  const yV = yForm + FORM_H;
  const yW = yV + vLen + 10;
  const yOut = yW + WEIGHT_H + SUM_H;
  const midX = X0 + (n * CELL) / 2;
  const outX = midX - vLen / 2;

  const w = X0 + n * CELL + 10;
  const h = yOut + STRIP_T + 34;

  // Each E on its own scale (as on the grid); every V and the output on one
  // shared scale, so the output visibly sits inside the range of the values
  // it averages; W_V on its own.
  const eBounds = useMemo(() => run.E.map((e) => maxAbs([e])), [run]);
  const vBound = useMemo(() => maxAbs([...run.V, ...run.out]), [run]);
  const wvBound = useMemo(() => maxAbs([head.Wv]), [head]);

  const hv = hovered;
  const colLit = (j: number) => hv?.kind === "V" && hv.index === j;

  return (
    <div className="at-grid__scroll">
      <svg
        className="at-grid at-vlane"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`How the output for ${word} is assembled: each word's embedding is multiplied by W V to give its value, each value is scaled by ${word}'s attention weight for that word, and the scaled values are added into one output vector.`}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="at-grid__arrowhead" />
          </marker>
        </defs>

        <text className="at-grid__axis" x={X0} y={TOP - 4}>
          every word in the sentence →
        </text>

        {/* ── Lane labels, right-aligned against the first column ── */}
        <text
          className="at-grid__lane"
          x={X0 - 10}
          y={yE + eLen / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          E
        </text>
        <text
          className="at-grid__lane"
          x={X0 - 10}
          y={yForm + 13}
          textAnchor="end"
        >
          <tspan>× W</tspan>
          <tspan dy="3" fontSize="8">V</tspan>
        </text>
        <Swatch
          W={head.Wv}
          rows={vDim}
          cols={eDim}
          bound={wvBound}
          x={X0 - 10 - eDim * WCELL}
          y={yForm + 18}
        />
        <text
          className="at-grid__lane"
          x={X0 - 10}
          y={yV + vLen / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          V
        </text>
        <text
          className="at-grid__lane"
          x={X0 - 10}
          y={yW + WEIGHT_H / 2 - 2}
          textAnchor="end"
        >
          × weight
        </text>
        <text
          className="at-grid__axis"
          x={X0 - 10}
          y={yW + WEIGHT_H / 2 + 10}
          textAnchor="end"
        >
          {word}'s row of the grid
        </text>

        {/* ── One column per word ── */}
        {run.tokens.map((t, j) => {
          const x = X0 + j * CELL;
          const cx = x + CELL / 2;
          const lit = colLit(j);
          const off = zeroed === j;
          const wt = weights[j]!;
          // Where this word's line lands on the output strip: spread across
          // its width so the lines read as flowing into it.
          const tx = outX + ((j + 0.5) * vLen) / n;
          return (
            <g key={`col-${j}`}>
              <text
                className={`at-grid__collabel${lit || off ? " at-grid__collabel--on" : ""}`}
                transform={`translate(${cx}, ${yE - 6}) rotate(-45)`}
                textAnchor="start"
                onClick={() => onSelectRow(j)}
              >
                {t}
              </text>

              {/* E */}
              <g
                className="at-grid__strip at-grid__strip--on"
                transform={`translate(${cx - STRIP_T / 2}, ${yE})`}
              >
                {Array.from(run.E[j]!, (v, d) => (
                  <rect
                    key={d}
                    x={0}
                    y={d * VCELL}
                    width={STRIP_T}
                    height={VCELL - 1}
                    style={{ fill: sign(v / eBounds[j]!) }}
                  />
                ))}
              </g>

              {/* × W_V */}
              <line
                className={`at-grid__arrow${lit ? " at-grid__arrow--on" : ""}`}
                x1={cx}
                y1={yForm + 5}
                x2={cx}
                y2={yV - 5}
                markerEnd={`url(#${markerId})`}
              />

              {/* V — click to zero, hover for numbers */}
              <g
                className={`at-grid__strip at-vlane__value${lit ? " at-grid__strip--on" : ""}${off ? " at-vlane__value--off" : ""}`}
                transform={`translate(${cx - STRIP_T / 2}, ${yV})`}
                onMouseEnter={() => onHover({ kind: "V", index: j })}
                onMouseLeave={() => onHover(null)}
                onClick={() => onZero(off ? null : j)}
                role="button"
                aria-pressed={off}
                aria-label={`${off ? "restore" : "zero"} the value for ${t}`}
              >
                <rect className="at-grid__hit" x={-4} y={-3} width={STRIP_T + 8} height={vLen + 6} />
                {Array.from(run.V[j]!, (v, d) => (
                  <rect
                    key={d}
                    x={0}
                    y={d * VCELL}
                    width={STRIP_T}
                    height={VCELL - 1}
                    style={{ fill: sign(v / vBound) }}
                  />
                ))}
                {off && (
                  <g className="at-vlane__cross" pointerEvents="none">
                    <line x1={-3} y1={-3} x2={STRIP_T + 3} y2={vLen + 2} />
                    <line x1={STRIP_T + 3} y1={-3} x2={-3} y2={vLen + 2} />
                  </g>
                )}
              </g>

              {/* × weight — from the grid, and pointedly unchanged by zeroing */}
              <rect
                className="at-vlane__wcell"
                x={x + 3}
                y={yW}
                width={CELL - 6}
                height={WEIGHT_H}
                rx={3}
                style={{
                  fill: `color-mix(in srgb, var(--accent) ${Math.round(wt * 100)}%, var(--surface))`,
                }}
              />
              <text
                className={`at-grid__num${wt > 0.6 ? " at-grid__num--inv" : ""}`}
                x={cx}
                y={yW + WEIGHT_H / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {wt >= 0.995 ? "1.0" : wt.toFixed(2).slice(1)}
              </text>

              {/* the weighted sum: one line per word, thickness = weight */}
              <line
                className={`at-vlane__sum${off ? " at-vlane__sum--off" : ""}${lit ? " at-vlane__sum--on" : ""}`}
                x1={cx}
                y1={yW + WEIGHT_H + 4}
                x2={tx}
                y2={yOut - 2}
                style={
                  off
                    ? undefined
                    : {
                        strokeWidth: 0.75 + wt * 6,
                        strokeOpacity: 0.18 + wt * 0.82,
                      }
                }
              />
            </g>
          );
        })}

        {/* ── The output ── */}
        <text
          className="at-grid__lane"
          x={outX - 10}
          y={yOut + STRIP_T / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          out
        </text>
        <g
          className={`at-grid__strip at-grid__strip--on${hv?.kind === "out" ? " at-vlane__out--on" : ""}`}
          transform={`translate(${outX}, ${yOut})`}
          onMouseEnter={() => onHover({ kind: "out", index: i })}
          onMouseLeave={() => onHover(null)}
        >
          <rect className="at-grid__hit" x={-2} y={-4} width={vLen + 4} height={STRIP_T + 8} />
          {Array.from(out, (v, d) => (
            <rect
              key={d}
              x={d * VCELL}
              y={0}
              width={VCELL - 1}
              height={STRIP_T}
              style={{ fill: sign(v / vBound) }}
            />
          ))}
          <rect
            className="at-vlane__outframe"
            x={-2}
            y={-2}
            width={vLen + 3}
            height={STRIP_T + 4}
            rx={2}
          />
        </g>
        <text
          className="at-grid__axis"
          x={midX}
          y={yOut + STRIP_T + 16}
          textAnchor="middle"
        >
          <tspan>out</tspan>
          <tspan dy="3" fontSize="7">{word}</tspan>
          <tspan dy="-3"> = Σ weight × V</tspan>
        </text>
      </svg>
    </div>
  );
}
