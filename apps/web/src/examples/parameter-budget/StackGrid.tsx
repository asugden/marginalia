// Blocks in series, heads in parallel, drawn to scale.
//
// One square is one attention head. A ROW of squares is one transformer
// block: its heads read the same input at the same time, side by side — in
// parallel. The rows run top to bottom, and each block's output is the next
// block's input — in series. A word goes in at the top and has to pass
// through every row, one after another, to come out at the bottom.
//
// The grid is redrawn at the chosen model's real shape, always fitted to the
// same box, so going from this site's one block of three heads to Llama 3.1's
// 126 blocks of 128 heads is a change you watch rather than a number you read.

import { useState } from "react";
import type { ModelShape } from "./models.js";

const W = 660;
const H = 560;
const GX0 = 110; // the grid's box
const GY0 = 74;
const GW = 520;
const GH = 430;
const MAX_CELL = 44;

export function StackGrid({ model }: { model: ModelShape }) {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const R = model.blocks;
  const C = model.heads;
  const cell = Math.min(MAX_CELL, GW / C, GH / R);
  // Gaps only while there is room for them; at Llama's scale the heads merge
  // into a texture, which is the point.
  const gap = cell > 10 ? 3 : cell > 5 ? 1 : cell > 3 ? 0.5 : 0;
  const gridW = C * cell;
  const gridH = R * cell;
  const x0 = GX0 + (GW - gridW) / 2;
  const y0 = GY0 + (GH - gridH) / 2;
  const seriesX = x0 - 22;
  const arrows = R <= 12; // an arrow between every pair of rows, while they fit
  // Past a couple of thousand heads, one <rect> per head makes redrawing
  // slow; each block becomes one rect filled with a repeating head pattern,
  // which draws the same picture.
  const patterned = R * C > 2000;
  // A short stack has no room for its label running down beside it.
  const sideways = gridH >= 200;

  return (
    <svg
      className="mb-grid"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${model.name}: ${R} transformer ${R === 1 ? "block" : "blocks"} in series, each with ${C} attention heads in parallel — ${(R * C).toLocaleString()} heads in all.`}
    >
      <defs>
        {patterned && (
          <>
            <pattern
              id="mb-heads"
              x={x0}
              y={y0}
              width={cell}
              height={cell}
              patternUnits="userSpaceOnUse"
            >
              <rect
                className="mb-head"
                x={gap / 2}
                y={gap / 2}
                width={cell - gap}
                height={cell - gap}
              />
            </pattern>
            <pattern
              id="mb-heads-on"
              x={x0}
              y={y0}
              width={cell}
              height={cell}
              patternUnits="userSpaceOnUse"
            >
              <rect
                className="mb-head mb-head--on"
                x={gap / 2}
                y={gap / 2}
                width={cell - gap}
                height={cell - gap}
              />
            </pattern>
          </>
        )}
        <marker
          id="mb-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0.5 L8,4 L0,7.5 Z" className="mb-arrowhead" />
        </marker>
      </defs>

      {/* Parallel: one bracket across the heads of a block. */}
      <path
        className="mb-bracket"
        d={`M ${x0} ${y0 - 12} v -6 H ${x0 + gridW} v 6`}
      />
      <text
        className="fig-label-sub"
        x={x0 + gridW / 2}
        y={y0 - 26}
        textAnchor="middle"
      >
        {C} per block
      </text>
      <text
        className="fig-label"
        x={x0 + gridW / 2}
        y={y0 - 38}
        textAnchor="middle"
      >
        heads (run in parallel)
      </text>

      {/* Series: the word's path down through every block. */}
      <text className="fig-word" x={seriesX} y={y0 - 12} textAnchor="middle">
        in
      </text>
      <line
        className="mb-series"
        x1={seriesX}
        y1={y0 - 4}
        x2={seriesX}
        y2={y0 + gridH + 6}
        markerEnd="url(#mb-arrow)"
      />
      <text
        className="fig-word"
        x={seriesX}
        y={y0 + gridH + 24}
        textAnchor="middle"
      >
        out
      </text>
      {sideways ? (
        <>
          <text
            className="fig-label-sub"
            x={seriesX - 18}
            y={y0 + gridH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${seriesX - 18} ${y0 + gridH / 2})`}
          >
            {R} {R === 1 ? "block" : "blocks"}
          </text>
          <text
            className="fig-label"
            x={seriesX - 32}
            y={y0 + gridH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${seriesX - 32} ${y0 + gridH / 2})`}
          >
            blocks (run in series)
          </text>
        </>
      ) : (
        <>
          <text
            className="fig-label"
            x={seriesX - 12}
            y={y0 + gridH / 2 - 2}
            textAnchor="end"
          >
            blocks, in series
          </text>
          <text
            className="fig-label-sub"
            x={seriesX - 12}
            y={y0 + gridH / 2 + 11}
            textAnchor="end"
          >
            {R} {R === 1 ? "block" : "blocks"}
          </text>
        </>
      )}

      {/* The heads. One row per block. */}
      {Array.from({ length: R }, (_, r) => {
        const y = y0 + r * cell;
        const on = hoverRow === r;
        return (
          <g
            key={r}
            className={`mb-block${on ? " mb-block--on" : ""}`}
            onMouseEnter={() => setHoverRow(r)}
            onMouseLeave={() => setHoverRow(null)}
          >
            <rect
              className="mb-block__hit"
              x={x0 - 4}
              y={y}
              width={gridW + 8}
              height={cell}
            />
            {patterned ? (
              <rect
                x={x0}
                y={y}
                width={gridW}
                height={cell}
                fill={`url(#${on ? "mb-heads-on" : "mb-heads"})`}
              />
            ) : (
              Array.from({ length: C }, (_, c) => (
                <rect
                  key={c}
                  className="mb-head"
                  x={x0 + c * cell + gap / 2}
                  y={y + gap / 2}
                  width={Math.max(0.5, cell - gap)}
                  height={Math.max(0.5, cell - gap)}
                  rx={cell > 10 ? 4 : 0}
                />
              ))
            )}
            {arrows && r < R - 1 && (
              <line
                className="mb-step"
                x1={x0 + gridW + 12}
                y1={y + cell / 2}
                x2={x0 + gridW + 12}
                y2={y + cell * 1.5}
                markerEnd="url(#mb-arrow)"
              />
            )}
          </g>
        );
      })}

      {/* Which block the pointer is on. */}
      <text className="fig-note" x={W / 2} y={H - 8} textAnchor="middle">
        {hoverRow === null
          ? "Point at a row to pick out one block."
          : `Block ${hoverRow + 1} of ${R}: ${C} heads read its input at once, then its output goes to ${
              hoverRow + 1 < R ? `block ${hoverRow + 2}` : "the model's output"
            }.`}
      </text>
    </svg>
  );
}
