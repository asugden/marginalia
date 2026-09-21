// Several heads at once, and the matrix that folds them back together.
//
// One head can look for one kind of relationship. A transformer layer runs
// several side by side — each with its own W_Q, W_K, W_V, each producing its
// own output for every word — then stacks those outputs end to end and
// multiplies by one more matrix, W_O, to get back to the model's width.
//
// The three heads here were fitted to find three different things (see
// train/build-heads.mjs), and the figure lets the student switch any of them
// off. That is the demonstration: for "pierogi" only the adjective head does
// anything, for "a" only the little-words head does, and switching a head
// off removes exactly its contribution from the stacked vector.
//
// W_O is where the attention example's footnote pointed: "one more matrix
// whose job is combining heads". Here it is, and here is why it exists.

import type { BlockRun, Model } from "./transformer.js";
import { MiniGrid, Strip, Swatch, maxAbs, topWeights } from "./draw.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
  muted: ReadonlySet<number>;
  onToggleHead: (k: number) => void;
}

const BOX_W = 210;
const BOX_GAP = 24;
const BOX_Y = 8;
const BOX_H = 178;
const GRID = 96;
const CELL = 5;

export function MultiHead({ model, run, row, muted, onToggleHead }: Props) {
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
  const woCell = 2;
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
          const off = muted.has(k);
          const spec = model.heads[k]!;
          const cx = x + BOX_W / 2;
          return (
            <g
              key={k}
              className={`tf-head${off ? " tf-head--off" : ""}`}
              onClick={() => onToggleHead(k)}
              role="button"
              aria-pressed={!off}
              aria-label={`${off ? "switch on" : "switch off"} head ${k + 1}, ${spec.name}`}
            >
              <rect className="tf-box" x={x} y={BOX_Y} width={BOX_W} height={BOX_H} rx={10} />
              <text className="tf-box__title" x={x + 14} y={BOX_Y + 20}>
                head {k + 1}
              </text>
              <text className="tf-box__name" x={x + 14} y={BOX_Y + 38}>
                {spec.name}
              </text>
              <MiniGrid
                weights={hd.weights}
                x={x + 14}
                y={BOX_Y + 50}
                size={GRID}
                activeRow={i}
              />
              <text className="at-grid__axis" x={x + 14 + GRID + 12} y={BOX_Y + 62}>
                for {word}:
              </text>
              {topWeights(hd.weights[i]!, run.tokens, 2)
                .split(", ")
                .map((s, r) => (
                  <text key={r} className="tf-box__gloss" x={x + 14 + GRID + 12} y={BOX_Y + 78 + r * 14}>
                    {s}
                  </text>
                ))}
              {/* the head's output for the word */}
              <text className="at-grid__axis" x={x + 14} y={BOX_Y + GRID + 66}>
                its output for {word}
              </text>
              <Strip
                v={hd.out[i]!}
                bound={outBound}
                x={x + 14}
                y={BOX_Y + GRID + 72}
                cell={CELL}
                className={off ? "tf-strip--off" : undefined}
              />
              <text className="tf-head__switch" x={x + BOX_W - 14} y={BOX_Y + 20} textAnchor="end">
                {off ? "off — click to switch on" : "on — click to switch off"}
              </text>
              {/* flow down into the stacked vector */}
              <path
                className={`tf-flow${off ? " tf-flow--off" : ""}`}
                d={`M ${cx} ${BOX_Y + BOX_H + 4} C ${cx} ${stackY - 24}, ${stackX + k * vDim * CELL + (vDim * CELL) / 2} ${BOX_Y + BOX_H + 28}, ${stackX + k * vDim * CELL + (vDim * CELL) / 2} ${stackY - 6}`}
              />
            </g>
          );
        })}

        {/* stacked */}
        <text className="at-grid__axis" x={stackX} y={stackY - 10}>
          stacked end to end — {H} × {vDim} = {H * vDim} numbers
        </text>
        <Strip v={run.stacked[i]!} bound={outBound} x={stackX} y={stackY} cell={CELL} />
        {run.heads.map((_, k) => (
          <rect
            key={`br-${k}`}
            className={`tf-bracket${muted.has(k) ? " tf-bracket--off" : ""}`}
            x={stackX + k * vDim * CELL - 1}
            y={stackY - 3}
            width={vDim * CELL + 1}
            height={15}
            rx={2}
          />
        ))}

        {/* W_O */}
        <line className="tf-flow" x1={w / 2} y1={stackY + 14} x2={w / 2} y2={woY - 4} />
        <text className="at-grid__lane" x={woX - 10} y={woY + (eDim * woCell) / 2} textAnchor="end" dominantBaseline="middle">
          <tspan>× W</tspan>
          <tspan dy="3" fontSize="8">O</tspan>
        </text>
        <Swatch W={model.Wo} rows={eDim} cols={H * vDim} x={woX} y={woY} cell={woCell} />
        <text className="at-grid__axis" x={woX + woW + 10} y={woY + (eDim * woCell) / 2 - 4}>
          {eDim} × {H * vDim}
        </text>
        <text className="at-grid__axis" x={woX + woW + 10} y={woY + (eDim * woCell) / 2 + 8}>
          back to {eDim} numbers
        </text>

        {/* out */}
        <line className="tf-flow" x1={w / 2} y1={woY + eDim * woCell + 4} x2={w / 2} y2={outY - 4} />
        <text className="at-grid__axis" x={outX} y={outY - 8}>
          the attention layer's output for {word}
        </text>
        <Strip v={run.attn[i]!} bound={attnBound} x={outX} y={outY} cell={CELL} />
      </svg>

      <p className="tf-readout">
        {muted.size === 0 ? (
          <>
            Each head reads the same sentence and looks for something
            different. For <b>{word}</b>, notice which heads actually move it
            and which just pass it through. <b>Click a head to switch it off</b>{" "}
            and watch its third of the stacked vector go blank.
          </>
        ) : (
          <>
            With {muted.size === 1 ? "one head" : `${muted.size} heads`} off,
            the stacked vector has {muted.size === 1 ? "a gap" : "gaps"} and W
            <sub>O</sub> gets less to work with. The output for <b>{word}</b>{" "}
            changed only if a switched-off head was doing something for it.
          </>
        )}
      </p>
    </div>
  );
}
