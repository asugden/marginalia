// The whole attention example, collapsed to a box.
//
// The attention page spent its length inside one head: the grid, the three
// matrices, the weighted sum. From here on that has to be a single object the
// page can stack and repeat, so this figure draws it as one: words go in on
// the left carrying their embeddings, the box holds the head's attention
// grid and nothing else, and the same words come out on the right, each now
// carrying some of its context. The box is deliberately unannotated: glossing
// the grid as "how much" and the values as "what" blurred the query / key /
// value roles the attention page took care to separate.
//
// Everything drawn is computed from head 0, which is the attention page's
// head verbatim, so a student can check this box against that page.

import { useState } from "react";
import { MiniGrid, Strip, maxAbs, topWeights } from "./draw.js";
import type { BlockRun } from "./transformer.js";

interface Props {
  run: BlockRun;
  /** The word the page is following. */
  row: number;
  onSelectRow: (i: number) => void;
}

const ROW = 30;
const WORD_X = 88;
const E_X = 100;
const CELL = 5;
const BOX_X = 250;
const BOX_PAD = 18; // the box's padding around its grid
const BOX_MIN_W = 160; // wide enough for its title
const OUT_GAP = 60; // box edge to the output column
const TOP = 44;

export function HeadBox({ run, row, onSelectRow }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = run.tokens.length;
  const head = run.heads[0]!;
  const eDim = run.E[0]!.length;
  const eLen = eDim * CELL;
  const lit = hover ?? row;
  const h = TOP + n * ROW + 16;
  const outBound = maxAbs(head.out);
  const boxH = n * ROW;
  const gridSize = Math.min(boxH - 44, 150);
  // The box is just the head: its title and its grid, nothing else.
  const BOX_W = Math.max(gridSize + 2 * BOX_PAD, BOX_MIN_W);
  const OUT_X = BOX_X + BOX_W + OUT_GAP;
  const w = OUT_X + eLen + 110;
  // The grid sits centred in the box below its title.
  const gridY = TOP + 22 + (boxH - 10 - gridSize) / 2;

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`The sentence enters an attention head on the left as embeddings and leaves on the right with each word's vector changed by the words it attended to.`}
      >
        <text className="fig-label" x={E_X} y={TOP - 26}>
          in: embedding
        </text>
        <text className="fig-label" x={OUT_X} y={TOP - 26}>
          out: embedding + context
        </text>

        {/* The box. */}
        <rect
          className="tf-box"
          x={BOX_X}
          y={TOP - 6}
          width={BOX_W}
          height={boxH + 12}
          rx={10}
        />
        <text
          className="tf-box__title"
          x={BOX_X + BOX_W / 2}
          y={TOP + 14}
          textAnchor="middle"
        >
          one attention head
        </text>
        <MiniGrid
          weights={head.weights}
          x={BOX_X + (BOX_W - gridSize) / 2}
          y={gridY}
          size={gridSize}
          activeRow={lit}
        />

        {run.tokens.map((t, i) => {
          const cy = TOP + i * ROW + ROW / 2;
          const on = lit === i;
          const cls = on ? " tf-row--on" : lit !== null ? " tf-row--dim" : "";
          return (
            <g
              key={`${t}-${i}`}
              className={`tf-row${cls}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectRow(i)}
            >
              <rect
                className="at-grid__hit"
                x={0}
                y={cy - ROW / 2}
                width={w}
                height={ROW}
              />
              <text
                className="tf-word"
                x={WORD_X}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {t}
              </text>
              <Strip
                v={run.E[i]!}
                bound={maxAbs([run.E[i]!])}
                x={E_X}
                y={cy - 4.5}
                cell={CELL}
              />
              <line
                className="tf-flow"
                x1={E_X + eLen + 4}
                y1={cy}
                x2={BOX_X - 4}
                y2={cy}
              />
              <line
                className="tf-flow"
                x1={BOX_X + BOX_W + 4}
                y1={cy}
                x2={OUT_X - 4}
                y2={cy}
              />
              <Strip
                v={head.out[i]!}
                bound={outBound}
                x={OUT_X}
                y={cy - 4.5}
                cell={CELL}
              />
              <text
                className="tf-word tf-word--out"
                x={OUT_X + eLen + 8}
                y={cy}
                dominantBaseline="middle"
              >
                {t}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="tf-readout">
        <b>{run.tokens[lit]}</b> entered as its own embedding and came out{" "}
        {takesFromOthers(head.weights[lit]!, lit) ? (
          <>
            updated by <b>{topWeights(head.weights[lit]!, run.tokens)}</b>.
          </>
        ) : (
          <>largely un-updated.</>
        )}
      </p>
    </div>
  );
}

/** Whether any word other than the word itself makes the readout's list —
 *  the same top 3 at 5% or more that `topWeights` prints. When the only
 *  word listed is the word attending to itself ("a 92%"), saying it was
 *  "updated by" that reads as nonsense; it simply kept itself. */
function takesFromOthers(row: number[], self: number, k = 3, min = 0.05): boolean {
  return row
    .map((w, j) => ({ w, j }))
    .sort((a, b) => b.w - a.w)
    .slice(0, k)
    .some((d) => d.w >= min && d.j !== self);
}
