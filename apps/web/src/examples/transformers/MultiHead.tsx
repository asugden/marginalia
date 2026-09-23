// Several heads at once, and the matrix that folds them back together.
//
// One head can look for one kind of relationship. A transformer layer runs
// several side by side — each with its own W_Q, W_K, W_V, each producing its
// own output for every word — then stacks those outputs end to end and
// multiplies by one more matrix, W_O, to get back to the model's width.
//
// The three heads here were fitted to find three different things (see
// train/build-heads.mjs). That is the demonstration: for "pierogi" only the
// adjective head does anything, for "a" only the little-words head does, and
// each head's output is one third of the stacked vector below.
//
// W_O is where the attention example's footnote pointed: "one more matrix
// whose job is combining heads". Here it is, and here is why it exists.

import { MiniGrid, Strip, Swatch, WCELL, maxAbs, topWeights } from "./draw.js";
import type { BlockRun, Model } from "./transformer.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
}

const BOX_W = 210;
const BOX_GAP = 24;
const BOX_Y = 8;
const GRID = 96;
const CELL = 5;
const PAD = 14; // a head box's inner padding, the same on every side
const STRIP_T = 9; // Strip's thickness, so the box can close under it
// Inside a head box, measured from its top edge: the head's output for the
// word is the last thing in, so the box ends a padding below the strip.
const OUT_LABEL_DY = GRID + 66;
const OUT_STRIP_DY = GRID + 72;
const BOX_H = OUT_STRIP_DY + STRIP_T + PAD;

export function MultiHead({ model, run, row }: Props) {
  const H = run.heads.length;
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const vDim = model.vDim;
  const eDim = model.eDim;
  const w = H * BOX_W + (H - 1) * BOX_GAP + 20;
  const x0 = 10;
  const stackY = BOX_Y + BOX_H + 56;
  const stackLen = H * vDim * CELL;
  const stackX = (w - stackLen) / 2;
  const woY = stackY + 40;
  // The attention example's W swatch cell, so W_O reads at the same scale as
  // the W_Q, W_K and W_V a student has already met.
  const woCell = WCELL;
  const woW = H * vDim * woCell;
  const woX = (w - woW) / 2;
  const outY = woY + eDim * woCell + 44;
  const outLen = eDim * CELL;
  const outX = (w - outLen) / 2;
  const h = outY + 40;

  const outBound = maxAbs(run.heads.flatMap((hd) => hd.out));
  const attnBound = maxAbs(run.attn);

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`${H} attention heads side by side, each with its own attention pattern. Their outputs for ${word} are stacked end to end and multiplied by W O to give one vector.`}
      >
        {run.heads.map((hd, k) => {
          const x = x0 + k * (BOX_W + BOX_GAP);
          const spec = model.heads[k]!;
          const cx = x + BOX_W / 2;
          return (
            <g key={k}>
              <rect
                className="tf-box"
                x={x}
                y={BOX_Y}
                width={BOX_W}
                height={BOX_H}
                rx={10}
              />
              <text className="tf-box__title" x={x + PAD} y={BOX_Y + 20}>
                head {k + 1}
              </text>
              <text className="tf-box__name" x={x + PAD} y={BOX_Y + 38}>
                {spec.name}
              </text>
              <MiniGrid
                weights={hd.weights}
                x={x + PAD}
                y={BOX_Y + 50}
                size={GRID}
                activeRow={i}
              />
              <text
                className="fig-label"
                x={x + PAD + GRID + 12}
                y={BOX_Y + 62}
              >
                for <tspan className="fig-word--key">{word}</tspan>:
              </text>
              {topWeights(hd.weights[i]!, run.tokens, 2)
                .split(", ")
                .map((s, r) => (
                  <text
                    key={r}
                    className="tf-box__gloss"
                    x={x + PAD + GRID + 12}
                    y={BOX_Y + 78 + r * 14}
                  >
                    {s}
                  </text>
                ))}
              {/* the head's output for the word */}
              <text
                className="fig-label"
                x={x + PAD}
                y={BOX_Y + OUT_LABEL_DY}
              >
                its output for <tspan className="fig-word--key">{word}</tspan>
              </text>
              <Strip
                v={hd.out[i]!}
                bound={outBound}
                x={x + PAD}
                y={BOX_Y + OUT_STRIP_DY}
                cell={CELL}
              />
              {/* flow down into the stacked vector */}
              <path
                className="tf-flow"
                d={`M ${cx} ${BOX_Y + BOX_H + 4} C ${cx} ${stackY - 24}, ${stackX + k * vDim * CELL + (vDim * CELL) / 2} ${BOX_Y + BOX_H + 28}, ${stackX + k * vDim * CELL + (vDim * CELL) / 2} ${stackY - 6}`}
              />
            </g>
          );
        })}

        {/* stacked */}
        <text
          className="fig-label"
          x={stackX - 10}
          y={stackY + STRIP_T / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          Concatenated vector
        </text>
        <Strip
          v={run.stacked[i]!}
          bound={outBound}
          x={stackX}
          y={stackY}
          cell={CELL}
        />
        {run.heads.map((_, k) => (
          <rect
            key={`br-${k}`}
            className="tf-bracket"
            x={stackX + k * vDim * CELL - 1}
            y={stackY - 3}
            width={vDim * CELL + 1}
            height={15}
            rx={2}
          />
        ))}

        {/* W_O */}
        <line
          className="tf-flow"
          x1={w / 2}
          y1={stackY + 14}
          x2={w / 2}
          y2={woY - 4}
        />
        <text
          className="at-grid__lane"
          x={woX - 10}
          y={woY + (eDim * woCell) / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          <tspan>× W</tspan>
          <tspan dy="3" fontSize="8">
            O
          </tspan>
        </text>
        <Swatch
          W={model.Wo}
          rows={eDim}
          cols={H * vDim}
          x={woX}
          y={woY}
          cell={woCell}
        />
        <text
          className="fig-num"
          x={woX + woW + 10}
          y={woY + (eDim * woCell) / 2 - 4}
        >
          {eDim} × {H * vDim}
        </text>
        <text
          className="fig-label-sub"
          x={woX + woW + 10}
          y={woY + (eDim * woCell) / 2 + 8}
        >
          back to {eDim} numbers
        </text>

        {/* out */}
        <line
          className="tf-flow"
          x1={w / 2}
          y1={woY + eDim * woCell + 4}
          x2={w / 2}
          y2={outY - 4}
        />
        <text
          className="fig-label"
          x={outX - 10}
          y={outY + STRIP_T / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          Output
        </text>
        <Strip
          v={run.attn[i]!}
          bound={attnBound}
          x={outX}
          y={outY}
          cell={CELL}
        />
      </svg>
    </div>
  );
}
