// The layer, as a map — drawn once at the top so every panel can point at it.
//
// A semi-traditional network drawing: columns of neurons joined by
// connections, widening in the middle and narrowing again, the way the digit
// recognizer is drawn. The one non-traditional part is the attention block,
// which is not a column of neurons but a grid of pairs — so it is drawn as
// the grid the attention page built. Everything is live for the selected
// word: the input column is its embedding, the hidden column is which memory
// drawers opened, the output column is the block's output.
//
// Two curved skips over the top carry the word itself past each sublayer to
// a "+": that is the residual connection, and drawing it as a bypass is what
// makes the add & norm panel's point visible before it is made.

import type { BlockRun, Model } from "./transformer.js";
import { MiniGrid, sign } from "./draw.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
}

const W = 780;
const H = 250;
const MID = 128; // vertical centre of the columns
const NODE_GAP = 11;
const X_IN = 44;
const ATT_X = 92;
const ATT_W = 124;
const X_PLUS1 = 258;
const X_A = 304;
const X_HID = 404;
const X_B = 504;
const X_PLUS2 = 548;
const X_OUT = 596;

function colY(count: number, gap: number) {
  const span = (count - 1) * gap;
  return (i: number) => MID - span / 2 + i * gap;
}

export function LayerMap({ model, run, row }: Props) {
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const eDim = model.eDim;
  const E = run.E[i]!;
  const x1 = run.x1[i]!;
  const memOut = run.memory[i]!.out;
  const act = run.memory[i]!.activation;
  const x2 = run.x2[i]!;
  const keys = model.vocab.map((v) => model.embed.get(v)!);
  const hidden = keys.length;
  const yE = colY(eDim, NODE_GAP);
  const yH = colY(hidden, (eDim * NODE_GAP) / hidden);
  const bound = (v: Float32Array) => Math.max(...Array.from(v, Math.abs)) || 1;
  const bE = bound(E);
  const b1 = bound(x1);
  const bB = bound(memOut);
  const b2 = bound(x2);
  const maxAct = Math.max(0.001, ...Array.from(act));
  const kBound = Math.max(...keys.map(bound));

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig tf-map"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`One transformer layer for ${word}: its embedding enters, passes through attention, is added back to itself and normalised, passes through a two-layer memory, is added back again and normalised, and leaves. The whole layer is repeated N times.`}
      >
        <defs>
          <marker id="tf-map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-map__head" />
          </marker>
        </defs>

        {/* the repeat frame */}
        <rect className="tf-map__repeat" x={ATT_X - 14} y={14} width={X_OUT - ATT_X + 6} height={H - 40} rx={12} />
        <Marker x={ATT_X + 6} y={H - 26} n={5} />
        <text className="tf-map__nx" x={ATT_X + 20} y={H - 22}>
          repeat × N
        </text>

        {/* connections, drawn first so nodes sit on top */}
        <g className="tf-map__wires">
          {keys.map((k, hIdx) =>
            Array.from({ length: eDim }, (_, d) => (
              <line
                key={`a-${hIdx}-${d}`}
                x1={X_A}
                y1={yE(d)}
                x2={X_HID}
                y2={yH(hIdx)}
                style={{ stroke: sign(k[d]! / kBound), opacity: 0.22 }}
              />
            )),
          )}
          {keys.map((k, hIdx) =>
            Array.from({ length: eDim }, (_, d) => (
              <line
                key={`b-${hIdx}-${d}`}
                x1={X_HID}
                y1={yH(hIdx)}
                x2={X_B}
                y2={yE(d)}
                style={{ stroke: sign(k[d]! / kBound), opacity: act[hIdx]! > 0 ? 0.45 : 0.08 }}
              />
            )),
          )}
        </g>

        {/* input column */}
        <text className="at-grid__axis" x={X_IN} y={MID + 104} textAnchor="middle">
          in: {word}
        </text>
        {Array.from(E, (v, d) => (
          <circle key={d} className="tf-map__node" cx={X_IN} cy={yE(d)} r={4} style={{ fill: sign(v / bE) }} />
        ))}
        <line className="tf-map__flow" x1={X_IN + 8} y1={MID} x2={ATT_X - 4} y2={MID} markerEnd="url(#tf-map-arrow)" />

        {/* attention block */}
        <rect className="tf-box" x={ATT_X} y={MID - 62} width={ATT_W} height={124} rx={8} />
        <MiniGrid weights={run.heads[0]!.weights} x={ATT_X + 14} y={MID - 48} size={96} activeRow={i} />
        <text className="at-grid__axis" x={ATT_X + ATT_W - 8} y={MID - 34} textAnchor="end">
          ×{run.heads.length}
        </text>
        <Marker x={ATT_X + 6} y={MID - 62} n={1} />
        <text className="tf-map__cap" x={ATT_X + ATT_W / 2} y={MID + 76} textAnchor="middle">
          attention: heads + W
          <tspan dy="3" fontSize="7">O</tspan>
        </text>
        <line className="tf-map__flow" x1={ATT_X + ATT_W + 4} y1={MID} x2={X_PLUS1 - 12} y2={MID} markerEnd="url(#tf-map-arrow)" />

        {/* skip 1 and the first plus */}
        <path
          className="tf-map__skip"
          d={`M ${X_IN} ${yE(0) - 8} C ${X_IN} 8, ${X_PLUS1} 8, ${X_PLUS1} ${MID - 12}`}
          markerEnd="url(#tf-map-arrow)"
        />
        <circle className="tf-map__plus" cx={X_PLUS1} cy={MID} r={10} />
        <text className="tf-map__plussign" x={X_PLUS1} y={MID + 4} textAnchor="middle">+</text>
        <Marker x={X_PLUS1 - 8} y={MID + 16} n={2} />
        <text className="tf-map__cap" x={X_PLUS1} y={MID + 76} textAnchor="middle">
          add &amp; norm
        </text>
        <line className="tf-map__flow" x1={X_PLUS1 + 12} y1={MID} x2={X_A - 8} y2={MID} markerEnd="url(#tf-map-arrow)" />

        {/* the memory: two layers */}
        {Array.from(x1, (v, d) => (
          <circle key={d} className="tf-map__node" cx={X_A} cy={yE(d)} r={4} style={{ fill: sign(v / b1) }} />
        ))}
        {Array.from(act, (a, hIdx) => (
          <circle
            key={hIdx}
            className="tf-map__node tf-map__node--hidden"
            cx={X_HID}
            cy={yH(hIdx)}
            r={a > 0 ? 3.4 : 2.4}
            style={{
              fill: `color-mix(in srgb, var(--accent) ${Math.round((a / maxAct) * 100)}%, var(--surface))`,
            }}
          />
        ))}
        {Array.from(memOut, (v, d) => (
          <circle key={d} className="tf-map__node" cx={X_B} cy={yE(d)} r={4} style={{ fill: sign(v / bB) }} />
        ))}
        <Marker x={X_HID - 8} y={yH(0) - 22} n={3} />
        <text className="tf-map__cap" x={X_HID} y={MID + 90} textAnchor="middle">
          the memory: widen to {hidden} drawers, narrow back to {eDim}
        </text>
        <line className="tf-map__flow" x1={X_B + 8} y1={MID} x2={X_PLUS2 - 12} y2={MID} markerEnd="url(#tf-map-arrow)" />

        {/* skip 2 and the second plus */}
        <path
          className="tf-map__skip"
          d={`M ${X_A} ${yE(0) - 8} C ${X_A} 8, ${X_PLUS2} 8, ${X_PLUS2} ${MID - 12}`}
          markerEnd="url(#tf-map-arrow)"
        />
        <circle className="tf-map__plus" cx={X_PLUS2} cy={MID} r={10} />
        <text className="tf-map__plussign" x={X_PLUS2} y={MID + 4} textAnchor="middle">+</text>
        <Marker x={X_PLUS2 - 8} y={MID + 16} n={4} />
        <text className="tf-map__cap" x={X_PLUS2} y={MID + 76} textAnchor="middle">
          add &amp; norm
        </text>
        <line className="tf-map__flow" x1={X_PLUS2 + 12} y1={MID} x2={X_OUT - 8} y2={MID} markerEnd="url(#tf-map-arrow)" />

        {/* output column */}
        <text className="at-grid__axis" x={X_OUT} y={MID + 104} textAnchor="middle">
          out
        </text>
        {Array.from(x2, (v, d) => (
          <circle key={d} className="tf-map__node" cx={X_OUT} cy={yE(d)} r={4} style={{ fill: sign(v / b2) }} />
        ))}
        <text className="tf-map__skiplabel" x={(X_IN + X_PLUS1) / 2} y={16} textAnchor="middle">
          the word itself, carried past
        </text>
      </svg>
    </div>
  );
}

/** A numbered marker, matching the chips on the panel headings below. */
function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="tf-map__marker" transform={`translate(${x}, ${y})`}>
      <circle r={8} />
      <text y={3} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}
