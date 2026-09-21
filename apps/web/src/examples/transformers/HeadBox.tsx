// The whole attention example, collapsed to a box.
//
// The attention page spent its length inside one head: the grid, the three
// matrices, the weighted sum. From here on that has to be a single object the
// page can stack and repeat, so this figure draws it as one: words go in on
// the left carrying their embeddings, the box holds the two things a head
// does (how much each word takes from each other; what it takes), and the
// same words come out on the right, each now carrying some of its context.
//
// Everything drawn is computed from head 0, which is the attention page's
// head verbatim, so a student can check this box against that page.

import { useState } from "react";
import type { BlockRun } from "./transformer.js";
import { MiniGrid, Strip, maxAbs, topWeights } from "./draw.js";

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
const BOX_W = 250;
const OUT_X = 560;
const TOP = 44;

export function HeadBox({ run, row, onSelectRow }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = run.tokens.length;
  const head = run.heads[0]!;
  const eDim = run.E[0]!.length;
  const eLen = eDim * CELL;
  const lit = hover ?? row;
  const h = TOP + n * ROW + 16;
  const w = OUT_X + eLen + 110;
  const outBound = maxAbs(head.out);
  const boxH = n * ROW;
  const gridSize = Math.min(boxH - 44, 150);

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
        <text className="at-grid__axis" x={E_X} y={TOP - 26}>
          in: the word's embedding
        </text>
        <text className="at-grid__axis" x={OUT_X} y={TOP - 26}>
          out: having read the sentence
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
        <text className="tf-box__title" x={BOX_X + BOX_W / 2} y={TOP + 14} textAnchor="middle">
          one attention head
        </text>
        <MiniGrid
          weights={head.weights}
          x={BOX_X + 18}
          y={TOP + 30}
          size={gridSize}
          activeRow={lit}
        />
        <text
          className="at-grid__axis"
          x={BOX_X + 18 + gridSize + 14}
          y={TOP + 30 + gridSize / 2 - 22}
        >
          how much
        </text>
        <text
          className="tf-box__gloss"
          x={BOX_X + 18 + gridSize + 14}
          y={TOP + 30 + gridSize / 2 - 8}
        >
          each word takes
        </text>
        <text
          className="tf-box__gloss"
          x={BOX_X + 18 + gridSize + 14}
          y={TOP + 30 + gridSize / 2 + 6}
        >
          from each other
        </text>
        <text
          className="at-grid__axis"
          x={BOX_X + 18 + gridSize + 14}
          y={TOP + 30 + gridSize / 2 + 30}
        >
          what
        </text>
        <text
          className="tf-box__gloss"
          x={BOX_X + 18 + gridSize + 14}
          y={TOP + 30 + gridSize / 2 + 44}
        >
          it takes: values
        </text>

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
              <rect className="at-grid__hit" x={0} y={cy - ROW / 2} width={w} height={ROW} />
              <text className="tf-word" x={WORD_X} y={cy} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
              <Strip v={run.E[i]!} bound={maxAbs([run.E[i]!])} x={E_X} y={cy - 4.5} cell={CELL} />
              <line className="tf-flow" x1={E_X + eLen + 4} y1={cy} x2={BOX_X - 4} y2={cy} />
              <line className="tf-flow" x1={BOX_X + BOX_W + 4} y1={cy} x2={OUT_X - 4} y2={cy} />
              <Strip v={head.out[i]!} bound={outBound} x={OUT_X} y={cy - 4.5} cell={CELL} />
              <text className="tf-word tf-word--out" x={OUT_X + eLen + 8} y={cy} dominantBaseline="middle">
                {t}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="tf-readout">
        <b>{run.tokens[lit]}</b> went in as its own embedding and came out
        made of{" "}
        <b>{topWeights(head.weights[lit]!, run.tokens)}</b> — the row of the
        grid you built on the attention page, applied.
      </p>
    </div>
  );
}
