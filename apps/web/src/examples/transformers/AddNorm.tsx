// Add & norm — shown rather than told.
//
// The important half is the "add", and the reason it matters is a contrast:
// every layer in the networks students have met so far REPLACES its input.
// Multiply by a matrix, move on; what came in is gone. A transformer sublayer
// instead ADDS what it computed to the word it was given. So the panel draws
// both paths from the same word and lets the numbers make the case:
//
//   the old way   word → layer → the layer's output       (still the word? no)
//   this way      word → layer → word + the layer's output (still the word? yes)
//
// with, for each path, the nearest known word and the similarity to the
// original. Then the norm, with the size before and after.

import type { BlockRun, Model } from "./transformer.js";
import { cosine, nearest, rms } from "./transformer.js";
import { Strip, maxAbs } from "./draw.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
  /** Which of the block's two add & norm steps to draw. */
  which: 1 | 2;
}

const CELL = 6;
const THICK = 12;
const X_LABEL = 210; // right edge of the row labels
const X_STRIP = 224;
const GAP = 72;

export function AddNorm({ model, run, row, which }: Props) {
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const kept = which === 1 ? run.E[i]! : run.x1[i]!;
  const added = which === 1 ? run.attn[i]! : run.memory[i]!.out;
  const sum = which === 1 ? run.sum1[i]! : run.sum2[i]!;
  const normed = which === 1 ? run.x1[i]! : run.x2[i]!;
  const layer = which === 1 ? "attention" : "the memory";
  const len = kept.length * CELL;
  const bound = maxAbs([kept, added, sum]);

  const replaceSim = cosine(added, run.E[i]!);
  const addSim = cosine(sum, run.E[i]!);
  const replaceNearest = nearest(model, added, 1)[0]!;
  const addNearest = nearest(model, sum, 1)[0]!;

  const xSum = X_STRIP + 2 * (len + GAP);
  const xMeter = xSum + len + 30;
  const w = xMeter + 190;
  const rows = { old: 48, add: 108, norm: 170 };
  const h = 200;

  return (
    <div className="tf-figwrap tf-figwrap--tight">
      <svg
        className="tf-fig"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={`Two paths for ${word}. The old way replaces the word with what ${layer} computed and it stops resembling ${word}. This way adds it to the word and ${word} stays ${word}. Then the sum is normalised.`}
      >
        {/* column captions */}
        <text className="at-grid__axis" x={X_STRIP} y={24}>
          the word
        </text>
        <text className="at-grid__axis" x={X_STRIP + len + GAP} y={24}>
          what {layer} made
        </text>
        <text className="at-grid__axis" x={xSum} y={24}>
          what goes on
        </text>
        <text className="at-grid__axis" x={xMeter} y={24}>
          still {word}?
        </text>

        {/* row 1: the old way — replace */}
        <text className="tf-rowlabel" x={X_LABEL} y={rows.old - 4} textAnchor="end">
          the old way
        </text>
        <text className="tf-rowlabel tf-rowlabel--sub" x={X_LABEL} y={rows.old + 9} textAnchor="end">
          multiply, move on
        </text>
        <Strip v={kept} bound={bound} x={X_STRIP} y={rows.old - 6} cell={CELL} thick={THICK} className="tf-strip--ghost" />
        <line className="tf-map__flow" x1={X_STRIP + len + 6} y1={rows.old} x2={X_STRIP + len + GAP - 8} y2={rows.old} markerEnd="url(#tf-map-arrow)" />
        <Strip v={added} bound={bound} x={X_STRIP + len + GAP} y={rows.old - 6} cell={CELL} thick={THICK} />
        <line className="tf-map__flow" x1={X_STRIP + 2 * len + GAP + 6} y1={rows.old} x2={xSum - 8} y2={rows.old} markerEnd="url(#tf-map-arrow)" />
        <Strip v={added} bound={bound} x={xSum} y={rows.old - 6} cell={CELL} thick={THICK} />
        <Meter x={xMeter} y={rows.old} sim={replaceSim} word={replaceNearest.word} />

        {/* row 2: this way — add */}
        <text className="tf-rowlabel tf-rowlabel--on" x={X_LABEL} y={rows.add - 4} textAnchor="end">
          a transformer
        </text>
        <text className="tf-rowlabel tf-rowlabel--sub" x={X_LABEL} y={rows.add + 9} textAnchor="end">
          add it back
        </text>
        <Strip v={kept} bound={bound} x={X_STRIP} y={rows.add - 6} cell={CELL} thick={THICK} />
        <text className="tf-op" x={X_STRIP + len + GAP / 2} y={rows.add + 6} textAnchor="middle">
          +
        </text>
        <Strip v={added} bound={bound} x={X_STRIP + len + GAP} y={rows.add - 6} cell={CELL} thick={THICK} />
        <text className="tf-op" x={X_STRIP + 2 * len + GAP + GAP / 2} y={rows.add + 6} textAnchor="middle">
          =
        </text>
        <Strip v={sum} bound={bound} x={xSum} y={rows.add - 6} cell={CELL} thick={THICK} />
        <Meter x={xMeter} y={rows.add} sim={addSim} word={addNearest.word} />

        {/* row 3: then norm */}
        <text className="tf-rowlabel" x={X_LABEL} y={rows.norm - 4} textAnchor="end">
          then norm
        </text>
        <text className="tf-rowlabel tf-rowlabel--sub" x={X_LABEL} y={rows.norm + 9} textAnchor="end">
          same shape, size one
        </text>
        <Strip v={sum} bound={bound} x={xSum} y={rows.norm - 6} cell={CELL} thick={THICK} className="tf-strip--ghost" />
        <text className="tf-size" x={xSum} y={rows.norm + 22}>
          size {rms(sum).toFixed(2)}
        </text>
        <line className="tf-map__flow" x1={xSum + len + 6} y1={rows.norm} x2={xMeter - 8} y2={rows.norm} markerEnd="url(#tf-map-arrow)" />
        <Strip v={normed} bound={maxAbs([normed])} x={xMeter} y={rows.norm - 6} cell={CELL} thick={THICK} />
        <text className="tf-size" x={xMeter} y={rows.norm + 22}>
          size {rms(normed).toFixed(2)}
        </text>
        <path className="tf-map__flow" d={`M ${xSum + len / 2} ${rows.add + 10} L ${xSum + len / 2} ${rows.norm - 12}`} markerEnd="url(#tf-map-arrow)" />

        <defs>
          <marker id="tf-map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-map__head" />
          </marker>
        </defs>
      </svg>

      <p className="tf-readout">
        Replace the word with what {layer} computed and the result is closest to{" "}
        <b>{replaceNearest.word}</b>, only <b>{replaceSim.toFixed(2)}</b> like{" "}
        <b>{word}</b> — the word is gone. Add it back and the result is closest
        to <b>{addNearest.word}</b>, <b>{addSim.toFixed(2)}</b> like {word}: still
        the word, now carrying what it learned. Every layer in a transformer
        makes that same choice.
      </p>
    </div>
  );
}

/** "Still the word?" — a similarity bar and the nearest known word. */
function Meter({ x, y, sim, word }: { x: number; y: number; sim: number; word: string }) {
  const wBar = 110;
  const v = Math.max(0, Math.min(1, sim));
  return (
    <g>
      <rect className="tf-meter__track" x={x} y={y - 5} width={wBar} height={10} rx={5} />
      <rect className={`tf-meter__fill${v > 0.7 ? " tf-meter__fill--yes" : ""}`} x={x} y={y - 5} width={wBar * v} height={10} rx={5} />
      <text className="tf-size" x={x + wBar + 8} y={y + 4}>
        {sim.toFixed(2)}
      </text>
      <text className="tf-meter__word" x={x} y={y + 20}>
        nearest word: {word}
      </text>
    </g>
  );
}
