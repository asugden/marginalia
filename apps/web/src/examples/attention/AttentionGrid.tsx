// The n x n attention grid, with the computation that feeds it drawn on its
// edges — laid out the way the convolutional example lays out its layers:
// input at the top, each stage a band beneath the last, captions down the
// left gutter.
//
// Two lanes feed the grid, and both start from the same embeddings:
//
//   across the top, one column per word:   word → E → × W_K → K
//   down the left, one row per word:       word → E → × W_Q → Q
//
// Every cell is then visibly the Q strip to its left dotted with the K strip
// above it, and every Q and K strip is visibly its E strip pushed through a
// matrix. The two matrices are drawn once each — as a swatch on the "× W"
// band — because they ARE shared by every word; drawing one per word would
// suggest the opposite. That is the point the figure exists to make: the
// matrices are the learned parameters, the vectors are just what falls out.
//
// Each strip is the actual vector, drawn as one cell per component in
// red/blue (positive/negative), the same convention the network examples use.
// Hovering a cell lights exactly the strips that produced it, all the way
// back to the embeddings; hovering any strip reports its numbers.
//
// Rendered as SVG so it stays crisp at lecture-projector sizes and can be
// exported straight into slides.

import { useId, useMemo } from "react";
import type { AttentionRun, Head } from "./attention.js";

export type GridStage = "scores" | "scaled" | "weights";

/** A hovered vector strip: which kind, and which token it belongs to. "V"
 *  and "out" are raised by the value panel, never by the grid. */
export interface HoveredVector {
  kind: "E" | "Q" | "K" | "V" | "out";
  index: number;
}

interface Props {
  head: Head;
  run: AttentionRun;
  /** Which stage of the computation to shade the cells by. */
  stage: GridStage;
  /** Highlighted query row, if any. */
  activeRow: number | null;
  /** Highlighted cell, if any. */
  activeCell: { i: number; j: number } | null;
  /** Highlighted vector strip, if any. */
  hoveredVector: HoveredVector | null;
  onHoverCell: (cell: { i: number; j: number } | null) => void;
  onHoverVector: (v: HoveredVector | null) => void;
  onSelectRow: (i: number | null) => void;
  /** Draw the causal mask's blocked upper triangle. */
  masked: boolean;
}

// Shared with ValueLane so the two figures read as one drawing system.
export const CELL = 46; // one grid cell
export const VCELL = 6; // one component of an E / Q / K / V strip, along the strip
export const STRIP_T = 9; // strip thickness
export const WCELL = 4; // one weight of a W swatch
export const WORD_H = 62; // column lane: the rotated words
const WORD_W = 76; // row lane: the word column
const PAD = 6;
const FORM_W = 72; // the "× W_Q" column; holds a 16-wide swatch
const FORM_H = 60; // the "× W_K" band; holds its label over an 8-tall swatch
const TOP = 16; // caption line above the column lane

export function AttentionGrid({
  head,
  run,
  stage,
  activeRow,
  activeCell,
  hoveredVector,
  onHoverCell,
  onHoverVector,
  onSelectRow,
  masked,
}: Props) {
  const n = run.tokens.length;
  const { eDim, qkDim } = head;
  const eLen = eDim * VCELL;
  const qkLen = qkDim * VCELL;
  const markerId = useId();

  // Row lane, left to right: word, E, × W_Q, Q, then the grid.
  const xE = WORD_W + PAD;
  const xForm = xE + eLen;
  const xQ = xForm + FORM_W;
  const gridX = xQ + qkLen + PAD;
  // Column lane, top to bottom: word, E, × W_K, K, then the grid.
  const yE = TOP + WORD_H;
  const yForm = yE + eLen;
  const yK = yForm + FORM_H;
  const gridY = yK + qkLen + PAD;

  const w = gridX + n * CELL + 10;
  const h = gridY + n * CELL + 10;

  // Shading range depends on the stage: weights are already 0..1, while raw
  // and scaled scores are signed and need their own scale to stay readable.
  const range = useMemo(() => {
    if (stage === "weights") return { min: 0, max: 1 };
    const src = stage === "scores" ? run.scores : run.scaled;
    let min = Infinity;
    let max = -Infinity;
    for (const row of src) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const bound = Math.max(Math.abs(min), Math.abs(max)) || 1;
    return { min: -bound, max: bound };
  }, [run, stage]);

  // Q and K share a colour scale so "these are the same kind of thing" reads
  // visually, and so a cell's shade agrees with the strips that made it.
  // Each E strip is scaled to itself: the embeddings put most of their energy
  // in a few components, and on a shared scale the rest wash out to blank.
  // Each W swatch has its own scale.
  const qkBound = useMemo(() => maxAbs([...run.Q, ...run.K]), [run]);
  const eBounds = useMemo(() => run.E.map((e) => maxAbs([e])), [run]);
  const wqBound = useMemo(() => maxAbs([head.Wq]), [head]);
  const wkBound = useMemo(() => maxAbs([head.Wk]), [head]);

  const values =
    stage === "scores"
      ? run.scores
      : stage === "scaled"
        ? run.scaled
        : run.weights;

  const hv = hoveredVector;
  const rowLit = (i: number) =>
    activeRow === i ||
    activeCell?.i === i ||
    (hv !== null && (hv.kind === "E" || hv.kind === "Q") && hv.index === i);
  const colLit = (j: number) =>
    activeCell?.j === j ||
    (hv !== null && (hv.kind === "E" || hv.kind === "K") && hv.index === j);
  const stripClass = (lit: boolean) =>
    `at-grid__strip${lit ? " at-grid__strip--on" : ""}`;
  const arrowClass = (lit: boolean) =>
    `at-grid__arrow${lit ? " at-grid__arrow--on" : ""}`;

  return (
    <div className="at-grid__scroll">
      <svg
        className={`at-grid${
          activeRow !== null || activeCell !== null || hv !== null
            ? " at-grid--focus"
            : ""
        }`}
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`${n} by ${n} attention grid. Across the top, each word's embedding is multiplied by W K to give its key; down the side, the same embeddings are multiplied by W Q to give the queries; each cell is one query dotted with one key.`}
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

        {/* ── Captions on the two lanes ── */}
        <text className="at-grid__axis" x={4} y={TOP - 4}>
          rows: queries ↓
        </text>
        <text className="at-grid__axis" x={gridX} y={TOP - 4}>
          columns: keys →
        </text>

        {/* ── Band labels for the column lane, right-aligned against the
            first column so each names the strips beside it — the way the
            convolutional example captions each layer. Short on purpose: the
            prose above carries the sentences, the hover readout the numbers. ── */}
        <text
          className="at-grid__lane"
          x={gridX - 10}
          y={yE + eLen / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          E
        </text>
        <text
          className="at-grid__lane"
          x={gridX - 10}
          y={yForm + 13}
          textAnchor="end"
        >
          <tspan>× W</tspan>
          <tspan dy="3" fontSize="8">K</tspan>
        </text>
        <Swatch
          W={head.Wk}
          rows={qkDim}
          cols={eDim}
          bound={wkBound}
          x={gridX - 10 - eDim * WCELL}
          y={yForm + 20}
        />
        <text
          className="at-grid__lane"
          x={gridX - 10}
          y={yK + qkLen / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          K
        </text>

        {/* ── Column headers for the row lane, sitting just above the first
            row: E, then the × W_Q swatch, then Q. A mirror of the labels
            above — same operation, different matrix. ── */}
        <text
          className="at-grid__lane"
          x={xE + eLen / 2}
          y={gridY - 8}
          textAnchor="middle"
        >
          E
        </text>
        <Swatch
          W={head.Wq}
          rows={qkDim}
          cols={eDim}
          bound={wqBound}
          x={xForm + (FORM_W - eDim * WCELL) / 2}
          y={gridY - 8 - 14 - qkDim * WCELL}
        />
        <text
          className="at-grid__lane"
          x={xForm + FORM_W / 2}
          y={gridY - 8}
          textAnchor="middle"
        >
          <tspan>× W</tspan>
          <tspan dy="3" fontSize="8">Q</tspan>
        </text>
        <text
          className="at-grid__lane"
          x={xQ + qkLen / 2}
          y={gridY - 8}
          textAnchor="middle"
        >
          Q
        </text>

        {/* ── Column lane: the word, its E, an arrow through W_K, its K —
            each stacked directly above its column. ── */}
        {run.tokens.map((t, j) => {
          const x = gridX + j * CELL;
          const cx = x + CELL / 2;
          const lit = colLit(j);
          return (
            <g key={`col-${j}`}>
              <text
                className={`at-grid__collabel${lit ? " at-grid__collabel--on" : ""}`}
                transform={`translate(${cx}, ${yE - 6}) rotate(-45)`}
                textAnchor="start"
                onClick={() => onSelectRow(activeRow === j ? null : j)}
              >
                {t}
              </text>
              <g
                className={stripClass(lit)}
                transform={`translate(${cx - STRIP_T / 2}, ${yE})`}
                onMouseEnter={() => onHoverVector({ kind: "E", index: j })}
                onMouseLeave={() => onHoverVector(null)}
              >
                <rect className="at-grid__hit" x={-3} y={-2} width={STRIP_T + 6} height={eLen + 4} />
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
              <line
                className={arrowClass(lit)}
                x1={cx}
                y1={yForm + 5}
                x2={cx}
                y2={yK - 5}
                markerEnd={`url(#${markerId})`}
              />
              <g
                className={stripClass(lit)}
                transform={`translate(${cx - STRIP_T / 2}, ${yK})`}
                onMouseEnter={() => onHoverVector({ kind: "K", index: j })}
                onMouseLeave={() => onHoverVector(null)}
              >
                <rect className="at-grid__hit" x={-3} y={-2} width={STRIP_T + 6} height={qkLen + 4} />
                {Array.from(run.K[j]!, (v, d) => (
                  <rect
                    key={d}
                    x={0}
                    y={d * VCELL}
                    width={STRIP_T}
                    height={VCELL - 1}
                    style={{ fill: sign(v / qkBound) }}
                  />
                ))}
              </g>
            </g>
          );
        })}

        {/* ── Row lane: the word, its E, an arrow through W_Q, its Q — each
            laid directly left of its row. ── */}
        {run.tokens.map((t, i) => {
          const y = gridY + i * CELL;
          const cy = y + CELL / 2;
          const lit = rowLit(i);
          return (
            <g key={`row-${i}`}>
              <text
                className={`at-grid__rowlabel${lit ? " at-grid__rowlabel--on" : ""}`}
                x={WORD_W - 8}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                onClick={() => onSelectRow(activeRow === i ? null : i)}
              >
                {t}
              </text>
              <g
                className={stripClass(lit)}
                transform={`translate(${xE}, ${cy - STRIP_T / 2})`}
                onMouseEnter={() => onHoverVector({ kind: "E", index: i })}
                onMouseLeave={() => onHoverVector(null)}
              >
                <rect className="at-grid__hit" x={-2} y={-3} width={eLen + 4} height={STRIP_T + 6} />
                {Array.from(run.E[i]!, (v, d) => (
                  <rect
                    key={d}
                    x={d * VCELL}
                    y={0}
                    width={VCELL - 1}
                    height={STRIP_T}
                    style={{ fill: sign(v / eBounds[i]!) }}
                  />
                ))}
              </g>
              <line
                className={arrowClass(lit)}
                x1={xForm + 5}
                y1={cy}
                x2={xQ - 5}
                y2={cy}
                markerEnd={`url(#${markerId})`}
              />
              <g
                className={stripClass(lit)}
                transform={`translate(${xQ}, ${cy - STRIP_T / 2})`}
                onMouseEnter={() => onHoverVector({ kind: "Q", index: i })}
                onMouseLeave={() => onHoverVector(null)}
              >
                <rect className="at-grid__hit" x={-2} y={-3} width={qkLen + 4} height={STRIP_T + 6} />
                {Array.from(run.Q[i]!, (v, d) => (
                  <rect
                    key={d}
                    x={d * VCELL}
                    y={0}
                    width={VCELL - 1}
                    height={STRIP_T}
                    style={{ fill: sign(v / qkBound) }}
                  />
                ))}
              </g>
            </g>
          );
        })}

        {/* ── The cells ── */}
        {values.map((row, i) =>
          row.map((v, j) => {
            const blocked = masked && j > i;
            const t = blocked ? 0 : (v - range.min) / (range.max - range.min || 1);
            const dim = activeRow !== null && activeRow !== i;
            const on = activeCell && activeCell.i === i && activeCell.j === j;
            return (
              <g key={`c-${i}-${j}`}>
                <rect
                  className={`at-grid__cell${blocked ? " at-grid__cell--blocked" : ""}${
                    dim ? " at-grid__cell--dim" : ""
                  }${on ? " at-grid__cell--on" : ""}`}
                  x={gridX + j * CELL + 1}
                  y={gridY + i * CELL + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  rx={3}
                  style={blocked ? undefined : { fill: shade(t, stage) }}
                  onMouseEnter={() => onHoverCell({ i, j })}
                  onMouseLeave={() => onHoverCell(null)}
                  onClick={() => onSelectRow(activeRow === i ? null : i)}
                />
                {!blocked && (
                  <text
                    className={`at-grid__num${stage === "weights" && t > 0.6 ? " at-grid__num--inv" : ""}`}
                    x={gridX + j * CELL + CELL / 2}
                    y={gridY + i * CELL + CELL / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                    style={{ opacity: dim ? 0.25 : 1 }}
                  >
                    {stage === "weights"
                      ? v >= 0.995
                        ? "1.0"
                        : v.toFixed(2).slice(1)
                      : v.toFixed(1)}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

/** A learned weight matrix drawn small — the same idea as the kernel swatch
 *  above each feature map in the convolutional example. One swatch per
 *  matrix, not one per word, because the matrix is shared. */
export function Swatch({
  W,
  rows,
  cols,
  bound,
  x,
  y,
}: {
  W: Float32Array;
  rows: number;
  cols: number;
  bound: number;
  x: number;
  y: number;
}) {
  return (
    <g className="at-grid__swatch" transform={`translate(${x}, ${y})`}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * WCELL}
            y={r * WCELL}
            width={WCELL - 0.5}
            height={WCELL - 0.5}
            style={{ fill: sign(W[r * cols + c]! / bound) }}
          />
        )),
      )}
      <rect
        className="at-grid__swatchframe"
        x={-1}
        y={-1}
        width={cols * WCELL + 1.5}
        height={rows * WCELL + 1.5}
      />
    </g>
  );
}

export function maxAbs(vectors: Float32Array[]): number {
  let b = 0;
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) {
      const a = Math.abs(v[i]!);
      if (a > b) b = a;
    }
  }
  return b || 1;
}

/** Cell fill. Weights use a single-hue ramp (they are all >= 0); raw and
 *  scaled scores are signed, so they use the same red/blue convention the
 *  network examples use for positive/negative weights. */
function shade(t: number, stage: GridStage): string {
  const clamp = Math.max(0, Math.min(1, t));
  if (stage === "weights") {
    return `color-mix(in srgb, var(--accent) ${Math.round(clamp * 100)}%, var(--surface))`;
  }
  const signed = (clamp - 0.5) * 2;
  return sign(signed, 85);
}

/** Red positive, blue negative — used for the E/Q/K strips, the W swatches
 *  and the signed score cells, so one colour language covers the figure. */
export function sign(t: number, strength = 92): string {
  const c = Math.max(-1, Math.min(1, t));
  if (c >= 0) {
    return `color-mix(in srgb, var(--accent) ${Math.round(c * strength)}%, var(--surface))`;
  }
  return `color-mix(in srgb, #4a6fa5 ${Math.round(-c * strength)}%, var(--surface))`;
}
